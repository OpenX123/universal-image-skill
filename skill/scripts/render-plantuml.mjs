#!/usr/bin/env node
// PlantUML 渲染器：调用 plantuml.com，使用 ~h 明文 hex 编码（零依赖）
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { loadConfig } from '../lib/config.mjs'
import { fetchWithRetry, HttpError } from '../lib/http.mjs'
import { resolveOutputDir, resolveSourceDir, makeFilename, saveBuffer, saveSource } from '../lib/output.mjs'

const ENGINE = 'plantuml'

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    } else {
      args._.push(a)
    }
  }
  return args
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on('data', (c) => chunks.push(c))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', reject)
  })
}

async function loadSource(args) {
  if (args.input) return await readFile(args.input, 'utf8')
  if (args.inline) {
    if (typeof args.inline !== 'string') {
      throw new Error('--inline 需要跟一段源码字符串')
    }
    return args.inline
  }
  if (args.stdin) return await readStdin()
  throw new Error('必须指定 --input <file> / --inline "<source>" / --stdin')
}

// 把不带 @startuml/@enduml 的源码补全（PlantUML 服务端要求）
function ensureUmlWrappers(source) {
  const trimmed = source.trim()
  if (/^@start[a-z]+/i.test(trimmed)) return source
  // 默认包裹 uml
  return `@startuml\n${source}\n@enduml\n`
}

// 在 @startuml 之后第一行注入 skinparam dpi（如果用户没自己写），提升 PNG 清晰度
// PlantUML 默认 dpi 96，提到 200 可让线条/文字明显更清晰，svg 不需要
function injectDpi(source, dpi) {
  if (!dpi || dpi === 96) return source
  // 用户已经显式设过就不动
  if (/^\s*skinparam\s+dpi\s+\d+/im.test(source)) return source
  return source.replace(
    /(@start[a-z]+[^\n]*\n)/i,
    `$1skinparam dpi ${dpi}\n`,
  )
}

async function main() {
  const start = Date.now()
  const args = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  const base = (config.PLANTUML_SERVER_URL || 'https://www.plantuml.com/plantuml').replace(/\/$/, '')
  const format = (args.format || config.DEFAULT_FORMAT || 'png').toLowerCase()
  if (!['png', 'svg'].includes(format)) {
    throw new Error(`PlantUML 仅支持 png / svg，收到：${format}`)
  }

  const rawSource = await loadSource(args)
  if (!rawSource || !rawSource.trim()) {
    throw new Error('PlantUML 源码为空')
  }
  // dpi 默认 200（约 2x 清晰度）；svg 输出不需要 dpi（矢量天然清晰）
  const dpi = args.dpi ? Number(args.dpi) : 200
  if (!Number.isFinite(dpi) || dpi < 50 || dpi > 600) {
    throw new Error(`--dpi 需要 50-600 之间的整数，收到：${args.dpi}`)
  }
  const wrapped = ensureUmlWrappers(rawSource)
  const source = format === 'svg' ? wrapped : injectDpi(wrapped, dpi)

  // ~h<HEX> 是 PlantUML 服务端官方支持的明文 hex 编码
  const hex = Buffer.from(source, 'utf8').toString('hex')
  const path = format === 'svg' ? `/svg/~h${hex}` : `/png/~h${hex}`
  const url = `${base}${path}`

  process.stderr.write(`[plantuml] GET ${base}${path.slice(0, 40)}... (len=${hex.length})\n`)
  const res = await fetchWithRetry(url, { method: 'GET' }, { retries: 3, timeout: 30000 })
  const arrBuf = await res.arrayBuffer()
  const buffer = Buffer.from(arrBuf)

  const absDir = resolveOutputDir(args['output-dir'], config)
  const sourceDir = resolveSourceDir(args['source-dir'], absDir)
  const filename = args.filename || makeFilename(ENGINE, format, source)
  const fullPath = await saveBuffer(absDir, filename, buffer)
  const sourcePath = await saveSource(sourceDir, filename, source, 'puml')

  process.stdout.write(JSON.stringify({
    ok: true,
    engine: ENGINE,
    path: fullPath,
    sourceCode: source,
    sourcePath,
    size: null,
    durationMs: Date.now() - start
  }) + '\n')
}

main().catch((err) => {
  const errOut = {
    ok: false,
    engine: ENGINE,
    error: {
      code: err.code || 'PLANTUML_FAILED',
      message: err.message || String(err),
      httpStatus: err.status || undefined
    }
  }
  if (err instanceof HttpError) {
    errOut.error.code = err.code === 'HTTP_TIMEOUT'
      ? 'PLANTUML_TIMEOUT'
      : err.code === 'HTTP_NETWORK'
      ? 'PLANTUML_NETWORK'
      : 'PLANTUML_HTTP_FAILED'
  }
  process.stderr.write(`[plantuml] error: ${err.stack || err.message || err}\n`)
  process.stdout.write(JSON.stringify(errOut) + '\n')
  process.exit(1)
})
