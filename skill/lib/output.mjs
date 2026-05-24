// 输出管理：路径、文件名、写入
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join, isAbsolute } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'

export function resolveOutputDir(override, config = {}) {
  const target = override || config.OUTPUT_DIR || './output'
  const abs = isAbsolute(target) ? target : resolve(process.cwd(), target)
  return abs
}

export async function ensureDir(absDir) {
  await mkdir(absDir, { recursive: true })
  return absDir
}

// 时间戳：YYYYMMDD-HHMMSS（本地时间）
function makeTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`
}

export function makeFilename(engine, ext, hashSeed) {
  const ts = makeTimestamp()
  let hex
  if (hashSeed) {
    hex = createHash('sha256').update(String(hashSeed)).digest('hex').slice(0, 4)
  } else {
    hex = randomBytes(2).toString('hex')
  }
  const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext
  return `img-${ts}-${engine}-${hex}.${cleanExt}`
}

export async function saveBuffer(absDir, filename, buffer) {
  await ensureDir(absDir)
  const full = join(absDir, filename)
  await writeFile(full, buffer)
  return full
}

// 把源码写到同目录、同名（仅扩展名不同）文件
export async function saveSource(absDir, baseImageFilename, sourceText, sourceExt) {
  if (!sourceText) return null
  const cleanExt = sourceExt.startsWith('.') ? sourceExt.slice(1) : sourceExt
  // 去掉原扩展名
  const dot = baseImageFilename.lastIndexOf('.')
  const stem = dot === -1 ? baseImageFilename : baseImageFilename.slice(0, dot)
  const filename = `${stem}.${cleanExt}`
  const full = join(absDir, filename)
  await writeFile(full, sourceText, 'utf8')
  return full
}
