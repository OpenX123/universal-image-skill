// 新版本提醒器测试
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { withEnv, withTempDir, mockHttpServer } from './helpers.mjs'
import {
  showNotificationIfAvailable,
  refreshCacheIfStale,
  recordLatestVersion,
  __test as internals,
} from '../installer/notifier.mjs'

function captureLog() {
  const orig = console.log
  const lines = []
  console.log = (...args) => lines.push(args.join(' '))
  return {
    lines,
    restore() { console.log = orig },
  }
}

async function writeCacheFile(homeDir, data) {
  // 直接走 internals.getCachePath() 拿到 HOME 重定向后的路径
  const p = internals.getCachePath()
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(data), 'utf8')
  return p
}

async function readCacheFile() {
  const p = internals.getCachePath()
  try {
    const raw = await fs.readFile(p, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function startRegistryMock({ status = 200, latestVersion = '9.9.9' } = {}) {
  const stats = { requestCount: 0 }
  const server = mockHttpServer({
    routes: {
      '/': (req, res) => {
        stats.requestCount++
        res.statusCode = status
        if (status >= 400) return res.end('mock fail')
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ 'dist-tags': { latest: latestVersion } }))
      },
    },
  })
  return { server, stats }
}

describe('installer/notifier.mjs', () => {
  it('getCachePath：跟着 HOME / USERPROFILE 走（lazy 计算）', async () => {
    await withTempDir(async (home) => {
      await withEnv({ HOME: home, USERPROFILE: home }, async () => {
        const p = internals.getCachePath()
        assert.ok(p.includes(home), `应在临时 HOME 下，实际 ${p}`)
        assert.ok(p.endsWith('universal-image-cache.json'))
      })
    })
  })

  it('showNotificationIfAvailable：缓存为空时不打印', async () => {
    await withTempDir(async (home) => {
      await withEnv({ HOME: home, USERPROFILE: home }, async () => {
        const cap = captureLog()
        try {
          await showNotificationIfAvailable('0.4.0')
        } finally { cap.restore() }
        assert.equal(cap.lines.length, 0)
      })
    })
  })

  it('showNotificationIfAvailable：缓存版本 ≤ 当前版本时不打印', async () => {
    await withTempDir(async (home) => {
      await withEnv({ HOME: home, USERPROFILE: home }, async () => {
        await writeCacheFile(home, { lastCheck: Date.now(), latestVersion: '0.4.0' })
        const cap = captureLog()
        try {
          await showNotificationIfAvailable('0.4.0')
        } finally { cap.restore() }
        assert.equal(cap.lines.length, 0)
      })
    })
  })

  it('showNotificationIfAvailable：缓存版本 > 当前版本时打印提示', async () => {
    await withTempDir(async (home) => {
      await withEnv({ HOME: home, USERPROFILE: home }, async () => {
        await writeCacheFile(home, { lastCheck: Date.now(), latestVersion: '0.5.0' })
        const cap = captureLog()
        try {
          await showNotificationIfAvailable('0.4.0')
        } finally { cap.restore() }
        const joined = cap.lines.join('\n')
        assert.match(joined, /v0\.4\.0 → v0\.5\.0/)
        assert.match(joined, /universal-image-skill update/)
      })
    })
  })

  it('showNotificationIfAvailable：UNIVERSAL_IMAGE_SKIP_UPDATE_NOTIFIER=1 时不打印', async () => {
    await withTempDir(async (home) => {
      await withEnv({
        HOME: home, USERPROFILE: home,
        UNIVERSAL_IMAGE_SKIP_UPDATE_NOTIFIER: '1',
      }, async () => {
        await writeCacheFile(home, { lastCheck: Date.now(), latestVersion: '9.9.9' })
        const cap = captureLog()
        try {
          await showNotificationIfAvailable('0.4.0')
        } finally { cap.restore() }
        assert.equal(cap.lines.length, 0)
      })
    })
  })

  it('showNotificationIfAvailable：CI=true 时不打印', async () => {
    await withTempDir(async (home) => {
      await withEnv({ HOME: home, USERPROFILE: home, CI: 'true' }, async () => {
        await writeCacheFile(home, { lastCheck: Date.now(), latestVersion: '9.9.9' })
        const cap = captureLog()
        try {
          await showNotificationIfAvailable('0.4.0')
        } finally { cap.restore() }
        assert.equal(cap.lines.length, 0)
      })
    })
  })

  it('refreshCacheIfStale：缓存新鲜（<24h）时不发请求', async () => {
    const { server: mockPromise, stats } = startRegistryMock({ latestVersion: '9.9.9' })
    const mock = await mockPromise
    try {
      await withTempDir(async (home) => {
        await withEnv({
          HOME: home, USERPROFILE: home,
          UNIVERSAL_IMAGE_REGISTRY_URL: mock.url,
        }, async () => {
          await writeCacheFile(home, {
            lastCheck: Date.now() - 60 * 60 * 1000, // 1h ago
            latestVersion: '0.4.0',
          })
          await refreshCacheIfStale()
          assert.equal(stats.requestCount, 0, '不应发请求')
          const cache = await readCacheFile()
          assert.equal(cache.latestVersion, '0.4.0', '缓存不应被改写')
        })
      })
    } finally {
      await mock.close()
    }
  })

  it('refreshCacheIfStale：缓存过期（≥24h）时发请求并更新', async () => {
    const { server: mockPromise, stats } = startRegistryMock({ latestVersion: '9.9.9' })
    const mock = await mockPromise
    try {
      await withTempDir(async (home) => {
        await withEnv({
          HOME: home, USERPROFILE: home,
          UNIVERSAL_IMAGE_REGISTRY_URL: mock.url,
        }, async () => {
          await writeCacheFile(home, {
            lastCheck: Date.now() - 25 * 60 * 60 * 1000, // 25h ago
            latestVersion: '0.4.0',
          })
          await refreshCacheIfStale()
          assert.equal(stats.requestCount, 1)
          const cache = await readCacheFile()
          assert.equal(cache.latestVersion, '9.9.9')
        })
      })
    } finally {
      await mock.close()
    }
  })

  it('refreshCacheIfStale：完全没缓存时也会发请求并落盘', async () => {
    const { server: mockPromise, stats } = startRegistryMock({ latestVersion: '1.0.0' })
    const mock = await mockPromise
    try {
      await withTempDir(async (home) => {
        await withEnv({
          HOME: home, USERPROFILE: home,
          UNIVERSAL_IMAGE_REGISTRY_URL: mock.url,
        }, async () => {
          await refreshCacheIfStale()
          assert.equal(stats.requestCount, 1)
          const cache = await readCacheFile()
          assert.equal(cache.latestVersion, '1.0.0')
          assert.ok(Number.isFinite(cache.lastCheck))
        })
      })
    } finally {
      await mock.close()
    }
  })

  it('refreshCacheIfStale：registry 500 时静默失败，不抛', async () => {
    const { server: mockPromise } = startRegistryMock({ status: 500 })
    const mock = await mockPromise
    try {
      await withTempDir(async (home) => {
        await withEnv({
          HOME: home, USERPROFILE: home,
          UNIVERSAL_IMAGE_REGISTRY_URL: mock.url,
        }, async () => {
          await refreshCacheIfStale() // 不应抛
          const cache = await readCacheFile()
          assert.equal(cache, null, '没缓存就还是没缓存')
        })
      })
    } finally {
      await mock.close()
    }
  })

  it('refreshCacheIfStale：UNIVERSAL_IMAGE_SKIP_UPDATE_NOTIFIER=1 时不发请求', async () => {
    const { server: mockPromise, stats } = startRegistryMock({ latestVersion: '9.9.9' })
    const mock = await mockPromise
    try {
      await withTempDir(async (home) => {
        await withEnv({
          HOME: home, USERPROFILE: home,
          UNIVERSAL_IMAGE_REGISTRY_URL: mock.url,
          UNIVERSAL_IMAGE_SKIP_UPDATE_NOTIFIER: '1',
        }, async () => {
          await refreshCacheIfStale()
          assert.equal(stats.requestCount, 0)
        })
      })
    } finally {
      await mock.close()
    }
  })

  it('recordLatestVersion：写入指定版本到缓存', async () => {
    await withTempDir(async (home) => {
      await withEnv({ HOME: home, USERPROFILE: home }, async () => {
        await recordLatestVersion('1.2.3')
        const cache = await readCacheFile()
        assert.equal(cache.latestVersion, '1.2.3')
        assert.ok(Number.isFinite(cache.lastCheck))
      })
    })
  })

  it('recordLatestVersion：空版本号不写', async () => {
    await withTempDir(async (home) => {
      await withEnv({ HOME: home, USERPROFILE: home }, async () => {
        await recordLatestVersion('')
        const cache = await readCacheFile()
        assert.equal(cache, null)
      })
    })
  })
})
