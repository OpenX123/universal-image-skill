// Mermaid 渲染脚本测试
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Buffer } from 'node:buffer'
import {
  runScript,
  withTempDir,
  mockHttpServer,
  TINY_PNG,
  TINY_SVG
} from './helpers.mjs'

const SCRIPT = 'skill/scripts/render-mermaid.mjs'

// 工厂：启动一个 mock mermaid.ink 服务
async function startMermaidMock({ status = 200, body = TINY_PNG, svgBody = TINY_SVG } = {}) {
  return await mockHttpServer({
    routes: {
      '/img/': (req, res) => {
        // path 形如 /img/<base64url>?type=png&width=...&scale=...
        // 先剥离查询串再 base64url 解码
        const afterPrefix = req.url.slice('/img/'.length)
        const qIdx = afterPrefix.indexOf('?')
        const segmentRaw = qIdx === -1 ? afterPrefix : afterPrefix.slice(0, qIdx)
        const segment = decodeURIComponent(segmentRaw)
        const std = segment.replace(/-/g, '+').replace(/_/g, '/')
        const padded = std + '=='.slice((std.length + 2) % 4)
        let decoded
        try {
          decoded = Buffer.from(padded, 'base64').toString('utf8')
        } catch {
          decoded = ''
        }
        res.setHeader('x-decoded-source', encodeURIComponent(decoded))
        res.statusCode = status
        if (status >= 400) return res.end(`mock fail ${status}`)
        res.setHeader('content-type', 'image/png')
        res.end(body)
      },
      '/svg/': (req, res) => {
        res.statusCode = status
        if (status >= 400) return res.end(`mock fail ${status}`)
        res.setHeader('content-type', 'image/svg+xml')
        res.end(svgBody)
      }
    }
  })
}

describe('render-mermaid.mjs', () => {
  it('--inline 传入源码：成功路径返回 ok 与文件', async () => {
    const mock = await startMermaidMock()
    try {
      await withTempDir(async (dir) => {
        const inline = 'graph TD\n  A-->B'
        const { exitCode, lastJsonLine, stderr } = await runScript(SCRIPT, [
          '--inline', inline,
          '--output-dir', dir,
          '--format', 'png'
        ], { env: { MERMAID_INK_URL: mock.url } })

        assert.equal(exitCode, 0, `exit not 0; stderr: ${stderr}`)
        assert.ok(lastJsonLine, '应当输出 JSON 行')
        assert.equal(lastJsonLine.ok, true)
        assert.equal(lastJsonLine.engine, 'mermaid')
        assert.ok(lastJsonLine.path, '应当返回 path')

        // 文件存在且大小 > 0
        const st = await stat(lastJsonLine.path)
        assert.ok(st.size > 0, 'png 文件应当非空')

        // sourceCode 含原文
        assert.equal(lastJsonLine.sourceCode, inline)

        // sourcePath 是 .mmd
        assert.ok(lastJsonLine.sourcePath && lastJsonLine.sourcePath.endsWith('.mmd'))
        const srcText = await readFile(lastJsonLine.sourcePath, 'utf8')
        assert.equal(srcText, inline)
      })
    } finally {
      await mock.close()
    }
  })

  it('--input 从文件读取源码', async () => {
    const mock = await startMermaidMock()
    try {
      await withTempDir(async (dir) => {
        const srcFile = join(dir, 'src.mmd')
        const text = 'sequenceDiagram\n  Alice->>Bob: Hi'
        await writeFile(srcFile, text, 'utf8')

        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--input', srcFile,
          '--output-dir', dir
        ], { env: { MERMAID_INK_URL: mock.url } })

        assert.equal(exitCode, 0)
        assert.equal(lastJsonLine.ok, true)
        assert.equal(lastJsonLine.sourceCode, text)
      })
    } finally {
      await mock.close()
    }
  })

  it('--stdin 从标准输入读取源码', async () => {
    const mock = await startMermaidMock()
    try {
      await withTempDir(async (dir) => {
        const text = 'graph LR\n  X-->Y'
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--stdin',
          '--output-dir', dir
        ], { env: { MERMAID_INK_URL: mock.url }, stdin: text })

        assert.equal(exitCode, 0)
        assert.equal(lastJsonLine.ok, true)
        assert.equal(lastJsonLine.sourceCode, text)
      })
    } finally {
      await mock.close()
    }
  })

  it('--format svg：输出扩展名为 .svg', async () => {
    const mock = await startMermaidMock()
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--inline', 'graph TD; A-->B',
          '--output-dir', dir,
          '--format', 'svg'
        ], { env: { MERMAID_INK_URL: mock.url } })

        assert.equal(exitCode, 0)
        assert.ok(lastJsonLine.path.endsWith('.svg'), `path 应当 .svg 结尾，实际 ${lastJsonLine.path}`)
      })
    } finally {
      await mock.close()
    }
  })

  it('mock 返回 500：ok:false、错误码含 MERMAID 或 HTTP、退出码 1', async () => {
    const mock = await startMermaidMock({ status: 500 })
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--inline', 'graph TD; A-->B',
          '--output-dir', dir
        ], { env: { MERMAID_INK_URL: mock.url } }, )

        assert.equal(exitCode, 1)
        assert.ok(lastJsonLine, '失败时也应输出 JSON')
        assert.equal(lastJsonLine.ok, false)
        assert.equal(lastJsonLine.engine, 'mermaid')
        assert.ok(lastJsonLine.error)
        const code = lastJsonLine.error.code || ''
        assert.ok(/MERMAID|HTTP/.test(code), `错误码应当含 MERMAID 或 HTTP，实际 ${code}`)
      })
    } finally {
      await mock.close()
    }
  })

  it('mock 返回 404：ok:false、退出码 1', async () => {
    const mock = await startMermaidMock({ status: 404 })
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--inline', 'graph TD; A-->B',
          '--output-dir', dir
        ], { env: { MERMAID_INK_URL: mock.url } })

        assert.equal(exitCode, 1)
        assert.equal(lastJsonLine.ok, false)
        const code = lastJsonLine.error.code || ''
        assert.ok(/MERMAID|HTTP/.test(code))
      })
    } finally {
      await mock.close()
    }
  })

  it('--source-dir：图片和源码可落到不同目录（文档模式）', async () => {
    const mock = await startMermaidMock()
    try {
      await withTempDir(async (dir) => {
        const imgDir = join(dir, 'images')
        const srcDir = join(dir, 'images', 'code')
        const inline = 'graph TD\n  Docs-->Mode'
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--inline', inline,
          '--output-dir', imgDir,
          '--source-dir', srcDir
        ], { env: { MERMAID_INK_URL: mock.url } })

        assert.equal(exitCode, 0)
        assert.equal(lastJsonLine.ok, true)
        // 图片在 images/
        assert.ok(lastJsonLine.path.includes(`${'images'}`), `path 应含 images，实际 ${lastJsonLine.path}`)
        assert.ok(!lastJsonLine.path.includes(join('images', 'code')), 'path 不应在 code 子目录')
        // 源码在 images/code/
        assert.ok(lastJsonLine.sourcePath.includes(join('images', 'code')), `sourcePath 应在 images/code，实际 ${lastJsonLine.sourcePath}`)
        // 两者基名相同（除扩展名）
        const imgBase = lastJsonLine.path.split(/[\\/]/).pop().replace(/\.png$/, '')
        const srcBase = lastJsonLine.sourcePath.split(/[\\/]/).pop().replace(/\.mmd$/, '')
        assert.equal(imgBase, srcBase, '图片与源码应同基名便于配对')
        // 源码内容正确
        const srcText = await readFile(lastJsonLine.sourcePath, 'utf8')
        assert.equal(srcText, inline)
      })
    } finally {
      await mock.close()
    }
  })

  it('默认调用带 width=1600 scale=2 高清参数', async () => {
    const mock = await startMermaidMock()
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--inline', 'graph TD; A-->B',
          '--output-dir', dir
        ], { env: { MERMAID_INK_URL: mock.url } })

        assert.equal(exitCode, 0)
        const imgReq = mock.requests.find((r) => r.url && r.url.startsWith('/img/'))
        assert.ok(imgReq, '应有 /img/ 请求')
        assert.match(imgReq.url, /[?&]width=1600/)
        assert.match(imgReq.url, /[?&]scale=2/)
      })
    } finally {
      await mock.close()
    }
  })

  it('--scale 3 --width 2000 透传到 URL', async () => {
    const mock = await startMermaidMock()
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--inline', 'graph TD; A-->B',
          '--output-dir', dir,
          '--scale', '3',
          '--width', '2000'
        ], { env: { MERMAID_INK_URL: mock.url } })

        assert.equal(exitCode, 0)
        const imgReq = mock.requests.find((r) => r.url && r.url.startsWith('/img/'))
        assert.match(imgReq.url, /[?&]width=2000/)
        assert.match(imgReq.url, /[?&]scale=3/)
      })
    } finally {
      await mock.close()
    }
  })

  it('--scale 越界（如 5）报错退出', async () => {
    await withTempDir(async (dir) => {
      const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
        '--inline', 'graph TD; A-->B',
        '--output-dir', dir,
        '--scale', '5'
      ], { env: { MERMAID_INK_URL: 'http://127.0.0.1:1' } })

      assert.equal(exitCode, 1)
      assert.equal(lastJsonLine.ok, false)
      assert.match(lastJsonLine.error.message, /scale/i)
    })
  })

  it('SVG 输出不带 width/scale 查询参数', async () => {
    const mock = await startMermaidMock()
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--inline', 'graph TD; A-->B',
          '--output-dir', dir,
          '--format', 'svg'
        ], { env: { MERMAID_INK_URL: mock.url } })

        assert.equal(exitCode, 0)
        const svgReq = mock.requests.find((r) => r.url && r.url.startsWith('/svg/'))
        assert.ok(svgReq)
        assert.ok(!svgReq.url.includes('?'), 'svg 不应带查询参数')
      })
    } finally {
      await mock.close()
    }
  })

  it('base64url 编码正确：mock 端能 decode 回原文', async () => {
    const mock = await startMermaidMock()
    try {
      await withTempDir(async (dir) => {
        const inline = 'graph TD\n  A[Start]-->B[End]'
        const { exitCode } = await runScript(SCRIPT, [
          '--inline', inline,
          '--output-dir', dir
        ], { env: { MERMAID_INK_URL: mock.url } })

        assert.equal(exitCode, 0)
        // 找到 /img/ 请求并断言解码回的原文等于 inline
        const imgReq = mock.requests.find((r) => r.url && r.url.startsWith('/img/'))
        assert.ok(imgReq, '应当至少有一次 /img/ 请求')
        // 剥离查询串再解码（高清参数化后 URL 形如 /img/<b64>?type=png&width=...&scale=...）
        const afterPrefix = imgReq.url.slice('/img/'.length)
        const qIdx = afterPrefix.indexOf('?')
        const segmentRaw = qIdx === -1 ? afterPrefix : afterPrefix.slice(0, qIdx)
        const segment = decodeURIComponent(segmentRaw)
        const std = segment.replace(/-/g, '+').replace(/_/g, '/')
        const padded = std + '=='.slice((std.length + 2) % 4)
        const decoded = Buffer.from(padded, 'base64').toString('utf8')
        assert.equal(decoded, inline, 'base64url 解码应得到原文')
      })
    } finally {
      await mock.close()
    }
  })
})
