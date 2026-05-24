#!/usr/bin/env node
// AI 生图渲染器：调用 OpenAI 兼容的 /images/generations
import { Buffer } from 'node:buffer'
import { loadConfig, requireFields, ConfigError } from '../lib/config.mjs'
import { fetchWithRetry, HttpError } from '../lib/http.mjs'
import { resolveOutputDir, makeFilename, saveBuffer } from '../lib/output.mjs'

const ENGINE = 'image'

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

// 拼接 endpoint：如果 base 已含 /v1 不再追加
function buildEndpoint(base) {
  const clean = base.replace(/\/$/, '')
  if (/\/v\d+$/.test(clean)) {
    return `${clean}/images/generations`
  }
  return `${clean}/v1/images/generations`
}

function inferExt(format) {
  const f = (format || 'png').toLowerCase()
  if (f === 'jpg' || f === 'jpeg') return 'jpg'
  return 'png'
}

async function fetchUrlAsBuffer(url) {
  const res = await fetchWithRetry(url, { method: 'GET' }, { retries: 3, timeout: 60000 })
  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}

async function main() {
  const start = Date.now()
  const args = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  requireFields(config, ['IMAGE_API_BASE_URL', 'IMAGE_API_KEY'])

  const prompt = args.prompt
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('必须指定 --prompt "<text>"')
  }
  const size = args.size || '1024x1024'
  const format = inferExt(args.format || config.DEFAULT_FORMAT)
  const model = config.IMAGE_MODEL || 'gpt-image-2'

  const endpoint = buildEndpoint(config.IMAGE_API_BASE_URL)
  const body = {
    model,
    prompt,
    n: 1,
    size,
    response_format: 'b64_json'
  }

  process.stderr.write(`[image] POST ${endpoint} model=${model} size=${size}\n`)
  const res = await fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.IMAGE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    },
    { retries: 3, timeout: 120000 }
  )

  const json = await res.json()
  const item = json?.data?.[0]
  if (!item) {
    throw new Error(`AI 服务返回缺少 data[0]，原始响应：${JSON.stringify(json).slice(0, 300)}`)
  }

  let buffer = null
  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64')
  } else if (item.url) {
    process.stderr.write(`[image] 二次下载 ${item.url}\n`)
    buffer = await fetchUrlAsBuffer(item.url)
  } else {
    throw new Error('AI 服务返回既无 b64_json 也无 url')
  }

  const absDir = resolveOutputDir(args['output-dir'], config)
  const filename = args.filename || makeFilename(ENGINE, format, prompt)
  const fullPath = await saveBuffer(absDir, filename, buffer)

  process.stdout.write(JSON.stringify({
    ok: true,
    engine: ENGINE,
    path: fullPath,
    sourceCode: prompt,
    sourcePath: null,
    size: null,
    durationMs: Date.now() - start
  }) + '\n')
}

main().catch((err) => {
  const errOut = {
    ok: false,
    engine: ENGINE,
    error: {
      code: err.code || 'IMAGE_FAILED',
      message: err.message || String(err),
      httpStatus: err.status || undefined
    }
  }
  if (err instanceof ConfigError) {
    errOut.error.code = 'IMAGE_CONFIG_MISSING'
    errOut.error.missing = err.missing
  } else if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403) errOut.error.code = 'IMAGE_AUTH_FAILED'
    else if (err.code === 'HTTP_TIMEOUT') errOut.error.code = 'IMAGE_TIMEOUT'
    else if (err.code === 'HTTP_NETWORK') errOut.error.code = 'IMAGE_NETWORK'
    else errOut.error.code = 'IMAGE_HTTP_FAILED'
  }
  process.stderr.write(`[image] error: ${err.stack || err.message || err}\n`)
  process.stdout.write(JSON.stringify(errOut) + '\n')
  process.exit(1)
})
