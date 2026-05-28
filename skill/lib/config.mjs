// 配置加载模块：从 .env 和环境变量加载配置
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 已知字段集合（值字符串化后输出）
const KNOWN_FIELDS = Object.freeze([
  'PLANTUML_SERVER_URL',
  'IMAGE_API_BASE_URL',
  'IMAGE_API_KEY',
  'IMAGE_MODEL',
  'OUTPUT_DIR',
  'DEFAULT_FORMAT'
])

// 默认值（仅对零依赖也能跑的字段提供）
const DEFAULTS = Object.freeze({
  PLANTUML_SERVER_URL: 'https://www.plantuml.com/plantuml',
  IMAGE_MODEL: 'gpt-image-2',
  DEFAULT_FORMAT: 'png'
})

export class ConfigError extends Error {
  constructor(message, { missing = [] } = {}) {
    super(message)
    this.name = 'ConfigError'
    this.code = 'CONFIG_MISSING'
    this.missing = missing
  }
}

// 极简 .env 解析：忽略 # 注释和空行，KEY=value 形式，value 去首尾引号
function parseEnvText(text) {
  const out = {}
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!key) continue
    let value = line.slice(eq + 1).trim()
    // 去除行尾注释（仅当 # 前有空格时，避免破坏 URL 里的 #）
    const hashIdx = value.indexOf(' #')
    if (hashIdx !== -1) value = value.slice(0, hashIdx).trim()
    // 去首尾引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

// 候选 .env 路径列表：脚本所在 skill 目录 → cwd
function candidateEnvPaths() {
  const paths = []
  // skill/lib/config.mjs → skill/.env
  const skillDirEnv = resolve(__dirname, '..', '.env')
  paths.push(skillDirEnv)
  // 当前工作目录
  paths.push(resolve(process.cwd(), '.env'))
  return paths
}

export function loadConfig() {
  const fileValues = {}
  for (const p of candidateEnvPaths()) {
    if (!existsSync(p)) continue
    try {
      const text = readFileSync(p, 'utf8')
      const parsed = parseEnvText(text)
      Object.assign(fileValues, parsed)
      break // 找到第一个就停止，优先 skill 目录的 .env
    } catch {
      // 忽略读取错误，继续候选路径
    }
  }

  const config = {}
  for (const key of KNOWN_FIELDS) {
    // 优先级：process.env > .env 文件 > 默认值
    const fromEnv = process.env[key]
    const fromFile = fileValues[key]
    const fromDefault = DEFAULTS[key]
    const value = fromEnv ?? fromFile ?? fromDefault
    config[key] = value === undefined || value === '' ? undefined : value
  }
  return config
}

export function requireFields(config, fields) {
  const missing = fields.filter((f) => !config[f])
  if (missing.length > 0) {
    throw new ConfigError(
      `缺少必填配置项：${missing.join(', ')}。请运行 npx @openx123/universal-image-skill config 完成配置。`,
      { missing }
    )
  }
}

export { KNOWN_FIELDS, DEFAULTS }
