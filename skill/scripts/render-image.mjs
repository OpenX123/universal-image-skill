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

// 把 CLI --format 值映射到：API output_format 值 与 本地文件扩展名
function resolveFormat(raw) {
  const f = String(raw || 'png').toLowerCase()
  if (f === 'jpg' || f === 'jpeg') return { apiFormat: 'jpeg', ext: 'jpg' }
  if (f === 'webp') return { apiFormat: 'webp', ext: 'webp' }
  return { apiFormat: 'png', ext: 'png' }
}

// 比例 + 档位 -> 具体像素尺寸表（数值取自 gpt-image-2 实测可用规格）
// 1K 档位：草图/测速；2K 档位：主流推荐；4K 档位：画册/壁纸
const RATIO_TABLE = {
  '1:1':  { '1k': '1024x1024', '2k': '2048x2048', '4k': '2880x2880' }, // 头像/社交配图/电商主图
  '16:9': { '1k': '1024x576',  '2k': '2048x1152', '4k': '3840x2160' }, // 电脑壁纸/网页 banner/视频封面
  '9:16': { '1k': '576x1024',  '2k': '1152x2048', '4k': '2160x3840' }, // 手机壁纸/海报/抖音封面
  '4:3':  { '1k': '1024x768',  '2k': '2048x1536', '4k': '3072x2304' }, // 演示文稿/iPad 适配图
  '3:4':  { '1k': '768x1024',  '2k': '1536x2048', '4k': '2304x3072' }, // 小红书/Pinterest 配图
  '2:3':  { '1k': '1024x1536', '2k': '1360x2048', '4k': '2336x3520' }, // 书籍封面/冲印照片
}
const VALID_RATIOS = Object.keys(RATIO_TABLE)
const VALID_TIERS = ['1k', '2k', '4k']
const DEFAULT_TIER = '2k'

const VALID_QUALITY = ['low', 'medium', 'high', 'auto']
const VALID_BACKGROUND = ['transparent', 'opaque', 'auto']

// 校验 --size 直接传入的像素规格（gpt-image-2 服务端约束）
function validateRawSize(size) {
  if (size === 'auto') return
  const m = /^(\d+)x(\d+)$/.exec(size)
  if (!m) {
    throw new Error(`size 格式必须 WxH（例如 1024x1536），或 auto。收到：${size}`)
  }
  const w = parseInt(m[1], 10)
  const h = parseInt(m[2], 10)
  if (w % 16 !== 0 || h % 16 !== 0) {
    throw new Error(`size 的宽高必须是 16 的倍数（${w}x${h} 不符）`)
  }
  if (w > 3840 || h > 3840) {
    throw new Error(`size 的单边不能超过 3840（${w}x${h} 不符）`)
  }
  if (w < 16 || h < 16) {
    throw new Error(`size 的宽高必须 >= 16（${w}x${h} 不符）`)
  }
}

// 解析最终尺寸：优先级 --size > --ratio(+--tier) > 默认 1024x1024
function resolveSizeFromArgs(args) {
  if (args.size) {
    validateRawSize(args.size)
    return args.size
  }
  if (args.ratio) {
    const ratio = String(args.ratio).toLowerCase()
    if (!VALID_RATIOS.includes(ratio)) {
      throw new Error(
        `不支持的 ratio：${ratio}。仅支持 ${VALID_RATIOS.join(' / ')}`,
      )
    }
    const tier = String(args.tier || DEFAULT_TIER).toLowerCase()
    if (!VALID_TIERS.includes(tier)) {
      throw new Error(`不支持的 tier：${tier}。仅支持 ${VALID_TIERS.join(' / ')}`)
    }
    return RATIO_TABLE[ratio][tier]
  }
  return '1024x1024'
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

  // size：支持 --ratio + --tier 或直传 --size WxH（详见 RATIO_TABLE 与 validateRawSize）
  const size = resolveSizeFromArgs(args)

  // format -> 文件扩展名 + API 字段 output_format
  const { apiFormat, ext } = resolveFormat(args.format || config.DEFAULT_FORMAT)

  // quality（可选，默认不传由模型用 medium）
  const quality = args.quality
  if (quality && !VALID_QUALITY.includes(quality)) {
    throw new Error(`不支持的 quality：${quality}。仅支持 ${VALID_QUALITY.join(' / ')}`)
  }

  // background（可选，默认不传由模型用 auto）
  const background = args.background
  if (background && !VALID_BACKGROUND.includes(background)) {
    throw new Error(`不支持的 background：${background}。仅支持 ${VALID_BACKGROUND.join(' / ')}`)
  }
  if (background === 'transparent' && apiFormat === 'jpeg') {
    throw new Error('transparent 背景仅支持 png 或 webp 格式，jpeg 无透明通道')
  }

  const model = config.IMAGE_MODEL || 'gpt-image-2'
  const endpoint = buildEndpoint(config.IMAGE_API_BASE_URL)

  // 组装请求体：仅传用户显式给出的可选参数，避免 proxy 不认识时整体 400
  const body = {
    model,
    prompt,
    n: 1,
    size,
    response_format: 'b64_json',
    output_format: apiFormat,
  }
  if (quality) body.quality = quality
  if (background) body.background = background

  process.stderr.write(
    `[image] POST ${endpoint} model=${model} size=${size} format=${apiFormat}` +
      (quality ? ` quality=${quality}` : '') +
      (background ? ` background=${background}` : '') +
      '\n',
  )
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
  const filename = args.filename || makeFilename(ENGINE, ext, prompt)
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
