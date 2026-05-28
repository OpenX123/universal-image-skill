// skill/lib/config.mjs 测试
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadConfig, requireFields, ConfigError } from '../skill/lib/config.mjs'
import { withTempDir, withEnv } from './helpers.mjs'

// 把 process.cwd 暂时切换到 fn 内执行，再恢复
async function withCwd(dir, fn) {
  const prev = process.cwd()
  process.chdir(dir)
  try {
    return await fn()
  } finally {
    process.chdir(prev)
  }
}

// loadConfig 同时会读 skill/.env，可能对干净测试造成干扰
// 解决：把所有 KNOWN_FIELDS 都从 process.env 删除，并把 cwd 切到一个无 .env 的临时目录
const KNOWN_FIELDS = [
  'PLANTUML_SERVER_URL',
  'IMAGE_API_BASE_URL',
  'IMAGE_API_KEY',
  'IMAGE_MODEL',
  'OUTPUT_DIR',
  'DEFAULT_FORMAT'
]

function clearedEnv() {
  const obj = {}
  for (const k of KNOWN_FIELDS) obj[k] = undefined
  return obj
}

describe('skill/lib/config.mjs', () => {
  it('.env 不存在时 loadConfig 不抛错，必填字段为 undefined（默认值字段有值）', async () => {
    await withTempDir(async (tmp) => {
      await withCwd(tmp, async () => {
        await withEnv(clearedEnv(), async () => {
          const cfg = loadConfig()
          assert.ok(typeof cfg === 'object')
          // IMAGE_API_KEY 没默认值，应当 undefined
          assert.equal(cfg.IMAGE_API_KEY, undefined)
          // PLANTUML_SERVER_URL 有默认值
          assert.ok(cfg.PLANTUML_SERVER_URL && cfg.PLANTUML_SERVER_URL.startsWith('http'))
        })
      })
    })
  })

  it('.env 解析忽略空行和 # 注释行', async () => {
    await withTempDir(async (tmp) => {
      const envPath = join(tmp, '.env')
      const content = [
        '# 这是一个注释',
        '',
        'IMAGE_API_KEY=sk-test-123',
        '',
        '# 另一行注释',
        'IMAGE_MODEL=custom-model'
      ].join('\n')
      await writeFile(envPath, content, 'utf8')
      await withCwd(tmp, async () => {
        await withEnv(clearedEnv(), async () => {
          const cfg = loadConfig()
          assert.equal(cfg.IMAGE_API_KEY, 'sk-test-123')
          assert.equal(cfg.IMAGE_MODEL, 'custom-model')
        })
      })
    })
  })

  it('value 去掉首尾的双引号 / 单引号', async () => {
    await withTempDir(async (tmp) => {
      const envPath = join(tmp, '.env')
      await writeFile(
        envPath,
        ['IMAGE_API_KEY="sk-quoted"', "IMAGE_MODEL='single'"].join('\n'),
        'utf8'
      )
      await withCwd(tmp, async () => {
        await withEnv(clearedEnv(), async () => {
          const cfg = loadConfig()
          assert.equal(cfg.IMAGE_API_KEY, 'sk-quoted')
          assert.equal(cfg.IMAGE_MODEL, 'single')
        })
      })
    })
  })

  it('requireFields 缺失时抛 ConfigError，message 列出字段名', () => {
    const cfg = { IMAGE_API_BASE_URL: 'http://x' }
    let threw = null
    try {
      requireFields(cfg, ['IMAGE_API_BASE_URL', 'IMAGE_API_KEY'])
    } catch (e) {
      threw = e
    }
    assert.ok(threw, '缺失字段应当抛错')
    assert.ok(threw instanceof Error)
    assert.ok(/IMAGE_API_KEY/.test(threw.message), `错误信息应列出缺失字段，实际 ${threw.message}`)
    if (threw instanceof ConfigError) {
      assert.deepEqual(threw.missing, ['IMAGE_API_KEY'])
    }
  })

  it('requireFields 字段都齐全时不抛错', () => {
    const cfg = { A: '1', B: '2' }
    assert.doesNotThrow(() => requireFields(cfg, ['A', 'B']))
  })

  it('process.env 覆盖 .env 文件的同名字段', async () => {
    await withTempDir(async (tmp) => {
      const envPath = join(tmp, '.env')
      await writeFile(envPath, 'IMAGE_API_KEY=from-file', 'utf8')
      await withCwd(tmp, async () => {
        await withEnv({ ...clearedEnv(), IMAGE_API_KEY: 'from-process-env' }, async () => {
          const cfg = loadConfig()
          assert.equal(cfg.IMAGE_API_KEY, 'from-process-env')
        })
      })
    })
  })
})
