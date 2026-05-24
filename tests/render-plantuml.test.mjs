// PlantUML 渲染脚本测试
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { stat, readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { runScript, withTempDir, mockHttpServer, TINY_PNG, TINY_SVG } from './helpers.mjs'

const SCRIPT = 'skill/scripts/render-plantuml.mjs'

async function startPlantumlMock({ status = 200, body = TINY_PNG, svgBody = TINY_SVG } = {}) {
  // 路由：/png/~h<HEX> 或 /svg/~h<HEX>
  function handlePng(req, res) {
    res.statusCode = status
    if (status >= 400) return res.end(`mock fail ${status}`)
    res.setHeader('content-type', 'image/png')
    res.end(body)
  }
  function handleSvg(req, res) {
    res.statusCode = status
    if (status >= 400) return res.end(`mock fail ${status}`)
    res.setHeader('content-type', 'image/svg+xml')
    res.end(svgBody)
  }
  return await mockHttpServer({
    routes: {
      '/png/': handlePng,
      '/svg/': handleSvg
    }
  })
}

function decodeHexFromPath(reqUrl) {
  // 形如 /png/~h<HEX>
  const m = /\/~h([0-9a-fA-F]+)/.exec(reqUrl)
  if (!m) return null
  return Buffer.from(m[1], 'hex').toString('utf8')
}

describe('render-plantuml.mjs', () => {
  it('--inline 走通成功路径，返回 .puml 源码文件', async () => {
    const mock = await startPlantumlMock()
    try {
      await withTempDir(async (dir) => {
        const inline = '@startuml\nAlice -> Bob\n@enduml'
        const { exitCode, lastJsonLine, stderr } = await runScript(SCRIPT, [
          '--inline', inline,
          '--output-dir', dir,
          '--format', 'png'
        ], { env: { PLANTUML_SERVER_URL: mock.url } })

        assert.equal(exitCode, 0, `stderr=${stderr}`)
        assert.equal(lastJsonLine.ok, true)
        assert.equal(lastJsonLine.engine, 'plantuml')
        const st = await stat(lastJsonLine.path)
        assert.ok(st.size > 0)
        assert.ok(lastJsonLine.sourcePath && lastJsonLine.sourcePath.endsWith('.puml'))
        const srcText = await readFile(lastJsonLine.sourcePath, 'utf8')
        assert.ok(srcText.includes('Alice -> Bob'))
      })
    } finally {
      await mock.close()
    }
  })

  it('~h<HEX> 编码正确：mock 端能 decode 回原文', async () => {
    const mock = await startPlantumlMock()
    try {
      await withTempDir(async (dir) => {
        const inline = '@startuml\nA -> B\n@enduml'
        const { exitCode } = await runScript(SCRIPT, [
          '--inline', inline,
          '--output-dir', dir
        ], { env: { PLANTUML_SERVER_URL: mock.url } })

        assert.equal(exitCode, 0)
        const pngReq = mock.requests.find((r) => r.url && r.url.startsWith('/png/~h'))
        assert.ok(pngReq, '应当至少有一次 /png/~h 请求')
        const decoded = decodeHexFromPath(pngReq.url)
        assert.ok(decoded, '能解析出 hex')
        assert.ok(decoded.includes('A -> B'), `解码应包含原 PlantUML 代码，实际 ${decoded}`)
      })
    } finally {
      await mock.close()
    }
  })

  it('包含 !include 的复杂 PlantUML 也能传过去', async () => {
    const mock = await startPlantumlMock()
    try {
      await withTempDir(async (dir) => {
        const inline = '@startuml\n!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml\nPerson(u, "User")\n@enduml'
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--inline', inline,
          '--output-dir', dir
        ], { env: { PLANTUML_SERVER_URL: mock.url } })

        assert.equal(exitCode, 0)
        assert.equal(lastJsonLine.ok, true)
        const pngReq = mock.requests.find((r) => r.url && r.url.startsWith('/png/~h'))
        const decoded = decodeHexFromPath(pngReq.url)
        assert.ok(decoded.includes('!include'), '!include 应当被正确传递')
        assert.ok(decoded.includes('C4_Container.puml'))
      })
    } finally {
      await mock.close()
    }
  })

  it('mock 返回 500：错误码以 PLANTUML_ 开头', async () => {
    const mock = await startPlantumlMock({ status: 500 })
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--inline', '@startuml\nA -> B\n@enduml',
          '--output-dir', dir
        ], { env: { PLANTUML_SERVER_URL: mock.url } })

        assert.equal(exitCode, 1)
        assert.equal(lastJsonLine.ok, false)
        assert.ok(/^PLANTUML_/.test(lastJsonLine.error.code), `错误码应当 PLANTUML_ 开头，实际 ${lastJsonLine.error.code}`)
      })
    } finally {
      await mock.close()
    }
  })

  it('默认 PNG 自动注入 skinparam dpi 200 提升清晰度', async () => {
    const mock = await startPlantumlMock()
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--inline', '@startuml\nA -> B\n@enduml',
          '--output-dir', dir
        ], { env: { PLANTUML_SERVER_URL: mock.url } })

        assert.equal(exitCode, 0)
        const pngReq = mock.requests.find((r) => r.url && r.url.startsWith('/png/~h'))
        const decoded = decodeHexFromPath(pngReq.url)
        assert.match(decoded, /skinparam\s+dpi\s+200/, '应自动注入 skinparam dpi 200')
        // 保存的 .puml 也应含 dpi 行（方便用户重现）
        const srcText = await readFile(lastJsonLine.sourcePath, 'utf8')
        assert.match(srcText, /skinparam\s+dpi\s+200/)
      })
    } finally {
      await mock.close()
    }
  })

  it('--dpi 400 透传到注入', async () => {
    const mock = await startPlantumlMock()
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--inline', '@startuml\nA -> B\n@enduml',
          '--output-dir', dir,
          '--dpi', '400'
        ], { env: { PLANTUML_SERVER_URL: mock.url } })

        assert.equal(exitCode, 0)
        const pngReq = mock.requests.find((r) => r.url && r.url.startsWith('/png/~h'))
        const decoded = decodeHexFromPath(pngReq.url)
        assert.match(decoded, /skinparam\s+dpi\s+400/)
      })
    } finally {
      await mock.close()
    }
  })

  it('用户源码已含 skinparam dpi 时不重复注入', async () => {
    const mock = await startPlantumlMock()
    try {
      await withTempDir(async (dir) => {
        const inline = '@startuml\nskinparam dpi 150\nA -> B\n@enduml'
        const { exitCode } = await runScript(SCRIPT, [
          '--inline', inline,
          '--output-dir', dir
        ], { env: { PLANTUML_SERVER_URL: mock.url } })

        assert.equal(exitCode, 0)
        const pngReq = mock.requests.find((r) => r.url && r.url.startsWith('/png/~h'))
        const decoded = decodeHexFromPath(pngReq.url)
        const matches = decoded.match(/skinparam\s+dpi\s+\d+/g) || []
        assert.equal(matches.length, 1, '应当只有用户的一行 dpi 设定，不重复注入')
        assert.match(matches[0], /150/)
      })
    } finally {
      await mock.close()
    }
  })

  it('SVG 输出不注入 dpi（矢量天然清晰）', async () => {
    const mock = await startPlantumlMock()
    try {
      await withTempDir(async (dir) => {
        const { exitCode } = await runScript(SCRIPT, [
          '--inline', '@startuml\nA -> B\n@enduml',
          '--output-dir', dir,
          '--format', 'svg'
        ], { env: { PLANTUML_SERVER_URL: mock.url } })

        assert.equal(exitCode, 0)
        const svgReq = mock.requests.find((r) => r.url && r.url.startsWith('/svg/~h'))
        const decoded = decodeHexFromPath(svgReq.url)
        assert.doesNotMatch(decoded, /skinparam\s+dpi/, 'svg 模式不应注入 dpi')
      })
    } finally {
      await mock.close()
    }
  })

  it('支持 --format svg', async () => {
    const mock = await startPlantumlMock()
    try {
      await withTempDir(async (dir) => {
        const { exitCode, lastJsonLine } = await runScript(SCRIPT, [
          '--inline', '@startuml\nA -> B\n@enduml',
          '--output-dir', dir,
          '--format', 'svg'
        ], { env: { PLANTUML_SERVER_URL: mock.url } })

        assert.equal(exitCode, 0)
        assert.ok(lastJsonLine.path.endsWith('.svg'))
        const svgReq = mock.requests.find((r) => r.url && r.url.startsWith('/svg/~h'))
        assert.ok(svgReq)
      })
    } finally {
      await mock.close()
    }
  })
})
