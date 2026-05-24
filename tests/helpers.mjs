// 测试公共工具：子进程、临时目录、环境、mock HTTP 服务
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 项目根目录（tests/ 的父目录）
export const PROJECT_ROOT = resolve(__dirname, '..')

/**
 * 解析项目内任何相对路径
 */
export function projectPath(...parts) {
  return resolve(PROJECT_ROOT, ...parts)
}

/**
 * 在子进程中跑一个 .mjs 脚本
 *
 * @param {string} scriptPath - 绝对路径或项目相对路径
 * @param {string[]} args - 命令行参数
 * @param {object} [opts]
 * @param {string} [opts.stdin] - 写入 stdin 的字符串
 * @param {Record<string,string>} [opts.env] - 追加 / 覆盖环境变量
 * @param {string} [opts.cwd] - 工作目录
 * @param {number} [opts.timeout=10000] - 超时毫秒
 * @returns {Promise<{stdout:string, stderr:string, exitCode:number, lastJsonLine:object|null}>}
 */
export function runScript(scriptPath, args = [], opts = {}) {
  const { stdin, env = {}, cwd = PROJECT_ROOT, timeout = 10000 } = opts
  const fullPath = resolve(PROJECT_ROOT, scriptPath)
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [fullPath, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdoutBuf = ''
    let stderrBuf = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGKILL') } catch {}
    }, timeout)

    child.stdout.on('data', (c) => { stdoutBuf += c.toString('utf8') })
    child.stderr.on('data', (c) => { stderrBuf += c.toString('utf8') })

    child.on('close', (code) => {
      clearTimeout(timer)
      const exitCode = timedOut ? -1 : (typeof code === 'number' ? code : 1)
      resolveP({
        stdout: stdoutBuf,
        stderr: stderrBuf,
        exitCode,
        lastJsonLine: parseLastJsonLine(stdoutBuf)
      })
    })

    child.on('error', () => {
      clearTimeout(timer)
      resolveP({
        stdout: stdoutBuf,
        stderr: stderrBuf,
        exitCode: -2,
        lastJsonLine: parseLastJsonLine(stdoutBuf)
      })
    })

    if (stdin !== undefined) {
      child.stdin.write(stdin)
    }
    child.stdin.end()
  })
}

/**
 * 解析 stdout 最后一行 JSON
 */
export function parseLastJsonLine(text) {
  if (!text) return null
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if ((line.startsWith('{') && line.endsWith('}')) || (line.startsWith('[') && line.endsWith(']'))) {
      try {
        return JSON.parse(line)
      } catch {
        // 继续向前找
      }
    }
  }
  return null
}

/**
 * 在临时目录中执行 fn，结束后递归删
 */
export async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'uis-test-'))
  try {
    return await fn(dir)
  } finally {
    try {
      await rm(dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

/**
 * 临时替换 process.env，执行 fn 后恢复
 */
export async function withEnv(overrides, fn) {
  const saved = {}
  const sentinel = Symbol('UNSET')
  for (const k of Object.keys(overrides)) {
    saved[k] = Object.prototype.hasOwnProperty.call(process.env, k) ? process.env[k] : sentinel
    if (overrides[k] === undefined || overrides[k] === null) {
      delete process.env[k]
    } else {
      process.env[k] = String(overrides[k])
    }
  }
  try {
    return await fn()
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === sentinel) {
        delete process.env[k]
      } else {
        process.env[k] = saved[k]
      }
    }
  }
}

/**
 * 启动一个本地 HTTP mock 服务（随机端口）
 *
 * routes: { [pathPrefix]: (req, res, body) => void }
 * - body 是已经收齐的 Buffer
 * - 匹配规则：最长前缀匹配；若无匹配 → 404
 *
 * 返回：{ url, close, requests }
 *   - url 是 http://127.0.0.1:<port>（无尾部斜杠）
 *   - requests 数组按时间顺序记录每个收到的请求 {method, url, headers, body(Buffer)}
 */
export async function mockHttpServer({ routes = {} } = {}) {
  const requests = []
  const sortedPrefixes = Object.keys(routes).sort((a, b) => b.length - a.length)

  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const record = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body
      }
      requests.push(record)
      const handler = sortedPrefixes.find((p) => req.url && req.url.startsWith(p))
      if (handler) {
        try {
          routes[handler](req, res, body)
        } catch (err) {
          res.statusCode = 500
          res.end(`mock handler error: ${err.message}`)
        }
      } else {
        res.statusCode = 404
        res.end(`no mock route for ${req.url}`)
      }
    })
    req.on('error', () => {
      res.statusCode = 400
      res.end('req error')
    })
  })

  await new Promise((resolveP) => server.listen(0, '127.0.0.1', resolveP))
  const addr = server.address()
  const url = `http://127.0.0.1:${addr.port}`

  return {
    url,
    requests,
    async close() {
      await new Promise((resolveP) => server.close(() => resolveP()))
    }
  }
}

/**
 * 一个最小可用的 1x1 PNG（用于 mock 响应体）
 */
export const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
)

/**
 * 一个最小 SVG（用于 mock 响应体）
 */
export const TINY_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
  'utf8'
)
