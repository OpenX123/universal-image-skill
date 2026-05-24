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
        // path 形如 /img/<base64url>
        const segment = decodeURIComponent(req.url.slice('/img/'.length))
        // 把 base64url 还原成 base64
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
        const segment = decodeURIComponent(imgReq.url.slice('/img/'.length))
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
