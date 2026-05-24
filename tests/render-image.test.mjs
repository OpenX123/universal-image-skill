// AI 生图脚本测试（render-image.mjs）
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { runScript, withTempDir, mockHttpServer, TINY_PNG } from './helpers.mjs'

const SCRIPT = 'skill/scripts/render-image.mjs'

// 启动一个 OpenAI 兼容的 mock 服务
// modes:
//   - 'b64': 返回 { data: [{ b64_json: <base64 png> }] }
//   - 'url': 返回 { data: [{ url: '<mock url>/dl/x.png' }] }；并提供 /dl/ 路由返回 PNG
//   - 'status': 返回指定的状态码
async function startImageMock({ mode = 'b64', status = 200, requireAuth = false } = {}) {
  const requests = []
  const routes = {
    '/v1/images/generations': (req, res, body) => {
      if (requireAuth) {
        const auth = req.headers.authorization || ''
        if (!auth.startsWith('Bearer ')) {
          res.statusCode = 401
          res.end(JSON.stringify({ error: { message: 'missing auth' } }))
          return
        }
      }
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: body.toString('utf8') })

      if (mode === 'status') {
        res.statusCode = status
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: { message: `mock ${status}` } }))
        return
      }
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      if (mode === 'b64') {
        const b64 = TINY_PNG.toString('base64')
        res.end(JSON.stringify({ data: [{ b64_json: b64 }] }))
      } else if (mode === 'url') {
        // 注意：服务器地址是动态的，故先返回相对路径占位，下面 finalize 时换成绝对 url
        res.end(JSON.stringify({ data: [{ url: `${baseUrl}/dl/image.png` }] }))
      }
    },
    '/dl/': (req, res) => {
      res.statusCode = 200
      res.setHeader('content-type', 'image/png')
      res.end(TINY_PNG)
    }
  }
  let baseUrl = ''
  const server = await mockHttpServer({ routes })
  baseUrl = server.url
  return { ...server, generationsRequests: requests }
}

describe('render-image.mjs', () => {
  it('缺 IMAGE_API_KEY 时报 CONFIG_MISSING 错误', async () => {
    await withTempDir(async (dir) => {
      const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
        '--prompt', 'a cat',
        '--output-dir', dir
      ], {
        env: {
          // 显式清空 key，但保留 base url
          IMAGE_API_KEY: '',
          IMAGE_API_BASE_URL: 'http://127.0.0.1:1/v1'
        }
      })

      assert.equal(exitCode, 1)
      assert.ok(lastJsonLine, '应输出 JSON')
      assert.equal(lastJsonLine.ok, false)
      const code = lastJsonLine.error?.code || ''
      assert.ok(/CONFIG|MISSING|KEY/i.test(code), `错误码应明确缺配置，实际 ${code}`)
    })
  })

  it('b64_json 返回：成功保存文件', async () => {
    const mock = await startImageMock({ mode: 'b64' })
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine, stderr } = await runScript(SCRIPT, [
          '--prompt', 'an astronaut riding a horse',
          '--output-dir', dir
        ], {
          env: {
            IMAGE_API_BASE_URL: `${mock.url}/v1`,
            IMAGE_API_KEY: 'sk-test',
            IMAGE_MODEL: 'gpt-image-2'
          }
        })

        assert.equal(exitCode, 0, `stderr=${stderr}`)
        assert.equal(lastJsonLine.ok, true)
        assert.equal(lastJsonLine.engine, 'image')
        const st = await stat(lastJsonLine.path)
        assert.ok(st.size > 0)
      })
    } finally {
      await mock.close()
    }
  })

  it('url 返回：二次下载图片成功', async () => {
    const mock = await startImageMock({ mode: 'url' })
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--prompt', 'a landscape',
          '--output-dir', dir
        ], {
          env: {
            IMAGE_API_BASE_URL: `${mock.url}/v1`,
            IMAGE_API_KEY: 'sk-test'
          }
        })

        assert.equal(exitCode, 0)
        assert.equal(lastJsonLine.ok, true)
        const st = await stat(lastJsonLine.path)
        assert.ok(st.size > 0)
        // /dl/ 应被请求过一次
        const dlReq = mock.requests.find((r) => r.url && r.url.startsWith('/dl/'))
        assert.ok(dlReq, '应当对 /dl/ 发起过下载请求')
      })
    } finally {
      await mock.close()
    }
  })

  it('mock 返回 401：错误码含 IMAGE 且 httpStatus=401', async () => {
    const mock = await startImageMock({ mode: 'status', status: 401 })
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--prompt', 'unauthorized test',
          '--output-dir', dir
        ], {
          env: {
            IMAGE_API_BASE_URL: `${mock.url}/v1`,
            IMAGE_API_KEY: 'sk-bad'
          }
        })

        assert.equal(exitCode, 1)
        assert.equal(lastJsonLine.ok, false)
        const code = lastJsonLine.error?.code || ''
        assert.ok(/IMAGE/.test(code), `错误码应当含 IMAGE，实际 ${code}`)
        assert.equal(lastJsonLine.error?.httpStatus, 401)
      })
    } finally {
      await mock.close()
    }
  })

  it('缺 --prompt 时退出码 1', async () => {
    const mock = await startImageMock({ mode: 'b64' })
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--output-dir', dir
        ], {
          env: {
            IMAGE_API_BASE_URL: `${mock.url}/v1`,
            IMAGE_API_KEY: 'sk-test'
          }
        })

        assert.equal(exitCode, 1)
        if (lastJsonLine) {
          assert.equal(lastJsonLine.ok, false)
        }
      })
    } finally {
      await mock.close()
    }
  })

  it('--ratio 16:9 默认 2k 档位：size 解析为 2048x1152', async () => {
    const mock = await startImageMock({ mode: 'b64' })
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--prompt', 'landscape',
          '--ratio', '16:9',
          '--output-dir', dir
        ], {
          env: { IMAGE_API_BASE_URL: `${mock.url}/v1`, IMAGE_API_KEY: 'sk-test' }
        })

        assert.equal(exitCode, 0)
        const payload = JSON.parse(mock.generationsRequests[0].body)
        assert.equal(payload.size, '2048x1152', '16:9 + 默认 2k 应解析为 2048x1152')
      })
    } finally {
      await mock.close()
    }
  })

  it('--ratio 9:16 --tier 4k：size 解析为 2160x3840', async () => {
    const mock = await startImageMock({ mode: 'b64' })
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--prompt', 'phone wallpaper',
          '--ratio', '9:16',
          '--tier', '4k',
          '--output-dir', dir
        ], {
          env: { IMAGE_API_BASE_URL: `${mock.url}/v1`, IMAGE_API_KEY: 'sk-test' }
        })

        assert.equal(exitCode, 0)
        const payload = JSON.parse(mock.generationsRequests[0].body)
        assert.equal(payload.size, '2160x3840')
      })
    } finally {
      await mock.close()
    }
  })

  it('--size 优先级高于 --ratio', async () => {
    const mock = await startImageMock({ mode: 'b64' })
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--prompt', 'custom',
          '--size', '1920x1088',
          '--ratio', '1:1',
          '--output-dir', dir
        ], {
          env: { IMAGE_API_BASE_URL: `${mock.url}/v1`, IMAGE_API_KEY: 'sk-test' }
        })

        assert.equal(exitCode, 0)
        const payload = JSON.parse(mock.generationsRequests[0].body)
        assert.equal(payload.size, '1920x1088', '显式 --size 应覆盖 --ratio')
      })
    } finally {
      await mock.close()
    }
  })

  it('--size 不是 16 的倍数时退出码 1 且错误明确', async () => {
    await withTempDir(async (dir) => {
      const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
        '--prompt', 'invalid',
        '--size', '1000x1000',
        '--output-dir', dir
      ], {
        env: { IMAGE_API_BASE_URL: 'http://127.0.0.1:1/v1', IMAGE_API_KEY: 'sk-test' }
      })

      assert.equal(exitCode, 1)
      assert.equal(lastJsonLine.ok, false)
      assert.match(lastJsonLine.error.message, /16 的倍数/)
    })
  })

  it('--ratio 不在白名单时退出码 1', async () => {
    await withTempDir(async (dir) => {
      const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
        '--prompt', 'invalid',
        '--ratio', '7:3',
        '--output-dir', dir
      ], {
        env: { IMAGE_API_BASE_URL: 'http://127.0.0.1:1/v1', IMAGE_API_KEY: 'sk-test' }
      })

      assert.equal(exitCode, 1)
      assert.equal(lastJsonLine.ok, false)
      assert.match(lastJsonLine.error.message, /ratio/)
    })
  })

  it('quality / background / format 三参数透传到 API body', async () => {
    const mock = await startImageMock({ mode: 'b64' })
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--prompt', 'transparent logo',
          '--ratio', '1:1',
          '--quality', 'high',
          '--background', 'transparent',
          '--format', 'png',
          '--output-dir', dir
        ], {
          env: { IMAGE_API_BASE_URL: `${mock.url}/v1`, IMAGE_API_KEY: 'sk-test' }
        })

        assert.equal(exitCode, 0)
        const payload = JSON.parse(mock.generationsRequests[0].body)
        assert.equal(payload.quality, 'high')
        assert.equal(payload.background, 'transparent')
        assert.equal(payload.output_format, 'png')
      })
    } finally {
      await mock.close()
    }
  })

  it('background=transparent 配 format=jpeg 时直接拒绝', async () => {
    await withTempDir(async (dir) => {
      const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
        '--prompt', 'bad combo',
        '--background', 'transparent',
        '--format', 'jpeg',
        '--output-dir', dir
      ], {
        env: { IMAGE_API_BASE_URL: 'http://127.0.0.1:1/v1', IMAGE_API_KEY: 'sk-test' }
      })

      assert.equal(exitCode, 1)
      assert.equal(lastJsonLine.ok, false)
      assert.match(lastJsonLine.error.message, /transparent|jpeg/)
    })
  })

  it('POST body 包含 model / prompt / n / size', async () => {
    const mock = await startImageMock({ mode: 'b64' })
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--prompt', 'a happy puppy',
          '--size', '1024x1024',
          '--output-dir', dir
        ], {
          env: {
            IMAGE_API_BASE_URL: `${mock.url}/v1`,
            IMAGE_API_KEY: 'sk-test',
            IMAGE_MODEL: 'gpt-image-2'
          }
        })

        assert.equal(exitCode, 0)
        const genReq = mock.generationsRequests[0]
        assert.ok(genReq, '应当至少有一次 generations 请求')
        let payload
        try {
          payload = JSON.parse(genReq.body)
        } catch (e) {
          assert.fail(`生成接口的 body 不是合法 JSON: ${genReq.body}`)
        }
        assert.equal(payload.prompt, 'a happy puppy')
        assert.ok(payload.model, 'body 应包含 model')
        assert.ok(payload.n === undefined || payload.n >= 1, 'n 字段若存在应 >=1')
        assert.equal(payload.size, '1024x1024')
      })
    } finally {
      await mock.close()
    }
  })
})
