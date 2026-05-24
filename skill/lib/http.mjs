// HTTP 封装：超时 + 指数退避重试 + 规范化错误
export class HttpError extends Error {
  constructor(message, { status, url, code } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.url = url
    this.code = code || 'HTTP_ERROR'
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// 是否对该状态码进行重试
function isRetryableStatus(status) {
  if (status >= 500) return true
  if (status === 408 || status === 429) return true
  return false
}

export async function fetchWithRetry(
  url,
  options = {},
  { retries = 3, timeout = 30000, retryDelayMs = 1000 } = {}
) {
  let lastErr = null
  // attempt 从 0 开始，最多尝试 retries 次
  for (let attempt = 0; attempt < Math.max(1, retries); attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < retries - 1) {
          lastErr = new HttpError(`HTTP ${res.status} from ${url}`, {
            status: res.status,
            url,
            code: 'HTTP_STATUS'
          })
          await sleep(retryDelayMs * Math.pow(2, attempt))
          continue
        }
        throw new HttpError(`HTTP ${res.status} from ${url}`, {
          status: res.status,
          url,
          code: 'HTTP_STATUS'
        })
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      // 已经是 HttpError 且不可重试 → 直接抛
      if (err instanceof HttpError && !isRetryableStatus(err.status)) {
        throw err
      }
      lastErr = err
      // 还有剩余次数则退避后重试
      if (attempt < retries - 1) {
        await sleep(retryDelayMs * Math.pow(2, attempt))
        continue
      }
      // 用尽次数，抛规范化错误
      if (err.name === 'AbortError') {
        throw new HttpError(`请求超时（${timeout}ms）：${url}`, {
          url,
          code: 'HTTP_TIMEOUT'
        })
      }
      if (err instanceof HttpError) throw err
      throw new HttpError(`网络请求失败：${err.message}`, {
        url,
        code: 'HTTP_NETWORK'
      })
    }
  }
  // 理论不会到这里
  throw lastErr || new HttpError('未知 HTTP 错误', { url, code: 'HTTP_UNKNOWN' })
}
