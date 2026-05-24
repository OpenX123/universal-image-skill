#!/usr/bin/env node
// Mermaid 渲染器：调用 mermaid.ink，PNG 或 SVG
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { loadConfig } from '../lib/config.mjs'
import { fetchWithRetry, HttpError } from '../lib/http.mjs'
import { resolveOutputDir, makeFilename, saveBuffer, saveSource } from '../lib/output.mjs'

const ENGINE = 'mermaid'

// 解析 CLI 参数（小工具，避免引外部库）
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
  if (args.input) {
    return await readFile(args.input, 'utf8')
  }
  if (args.inline) {
    if (typeof args.inline !== 'string') {
      throw new Error('--inline 需要跟一段源码字符串')
    }
    return args.inline
  }
  if (args.stdin) {
    return await readStdin()
  }
  throw new Error('必须指定 --input <file> / --inline "<source>" / --stdin')
}

function emit(result) {
  // 契约：最后一行 JSON 到 stdout
  process.stdout.write(JSON.stringify(result) + '\n')
}

async function main() {
  const start = Date.now()
  const args = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  const base = (config.MERMAID_INK_URL || 'https://mermaid.ink').replace(/\/$/, '')
  const format = (args.format || config.DEFAULT_FORMAT || 'png').toLowerCase()
  if (!['png', 'svg'].includes(format)) {
    throw new Error(`Mermaid 仅支持 png / svg，收到：${format}`)
  }

  const source = await loadSource(args)
  if (!source || !source.trim()) {
    throw new Error('Mermaid 源码为空')
  }

  // mermaid.ink: /img/<BASE64URL> 或 /svg/<BASE64URL>
  const b64url = Buffer.from(source, 'utf8').toString('base64url')
  const path = format === 'svg' ? `/svg/${b64url}` : `/img/${b64url}`
  const url = `${base}${path}`

  process.stderr.write(`[mermaid] GET ${url}\n`)
  const res = await fetchWithRetry(url, { method: 'GET' }, { retries: 3, timeout: 30000 })
  const arrBuf = await res.arrayBuffer()
  const buffer = Buffer.from(arrBuf)

  const absDir = resolveOutputDir(args['output-dir'], config)
  const filename = args.filename || makeFilename(ENGINE, format, source)
  const fullPath = await saveBuffer(absDir, filename, buffer)
  const sourcePath = await saveSource(absDir, filename, source, 'mmd')

  emit({
    ok: true,
    engine: ENGINE,
    path: fullPath,
    sourceCode: source,
    sourcePath,
    size: null,
    durationMs: Date.now() - start
  })
}

main().catch((err) => {
  const errOut = {
    ok: false,
    engine: ENGINE,
    error: {
      code: err.code || 'MERMAID_FAILED',
      message: err.message || String(err),
      httpStatus: err.status || undefined
    }
  }
  // 把更明确的子类型映射出来
  if (err instanceof HttpError) {
    errOut.error.code = err.code === 'HTTP_TIMEOUT'
      ? 'MERMAID_TIMEOUT'
      : err.code === 'HTTP_NETWORK'
      ? 'MERMAID_NETWORK'
      : 'MERMAID_HTTP_FAILED'
  }
  process.stderr.write(`[mermaid] error: ${err.stack || err.message || err}\n`)
  process.stdout.write(JSON.stringify(errOut) + '\n')
  process.exit(1)
})
