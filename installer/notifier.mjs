// 新版本提醒器：每次跑 CLI 命令时，在命令前打一条简短提示（如果缓存里
// 已知有新版本），在命令后用最长 1.5s 的超时悄悄刷新一次缓存供下次使用。
//
// 设计目标：
// 1. 零延迟感——同步段只读本地 JSON 文件，毫秒级；异步段只在缓存过期
//    那次跑命令时多花 ≤1.5s，且失败静默
// 2. 零网络浪费——24h 才查一次 npm registry
// 3. 零依赖——纯 Node 内置 fetch + fs
// 4. 可禁用——UNIVERSAL_IMAGE_SKIP_UPDATE_NOTIFIER=1 或 CI=true

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { PACKAGE_NAME } from './paths.mjs'
import { compareSemver } from './update.mjs'

// 缓存放在 ~/.claude/ 下，跟 skills/ 同级，方便用户排查/清理
// lazy 计算：让测试可以通过覆盖 HOME / USERPROFILE 重定向到临时目录
function getCachePath() {
  return path.join(os.homedir(), '.claude', 'universal-image-cache.json')
}
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24h
const FETCH_TIMEOUT_MS = 1500

// npm registry URL 也允许测试覆盖（指向 mockHttpServer）
function getRegistryUrl() {
  return process.env.UNIVERSAL_IMAGE_REGISTRY_URL || 'https://registry.npmjs.org'
}

function isDisabled() {
  return process.env.UNIVERSAL_IMAGE_SKIP_UPDATE_NOTIFIER === '1'
    || process.env.CI === 'true'
}

async function readCache() {
  try {
    const raw = await fs.readFile(getCachePath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function writeCache(data) {
  try {
    const p = getCachePath()
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

async function fetchLatestVersion() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${getRegistryUrl()}/${PACKAGE_NAME}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'universal-image-skill-cli',
      },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const latest = data?.['dist-tags']?.latest
    if (!latest) throw new Error('no latest tag')
    return latest
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 命令开始前调用：根据缓存比对版本，如有新版本则打一条提示。
 * 只读本地文件，不发请求，瞬时返回。
 */
export async function showNotificationIfAvailable(currentVersion) {
  if (isDisabled()) return
  if (!currentVersion) return
  const cache = await readCache()
  if (!cache?.latestVersion) return
  if (compareSemver(cache.latestVersion, currentVersion) > 0) {
    console.log('')
    console.log(`ℹ 新版本可用: v${currentVersion} → v${cache.latestVersion}`)
    console.log(`  运行 \`universal-image-skill update\` 一键升级`)
    console.log('')
  }
}

/**
 * 命令结束后调用：缓存过期才发请求查 registry。失败/超时静默忽略。
 * 即便 await 也最多多花 1.5s（FETCH_TIMEOUT_MS）。
 */
export async function refreshCacheIfStale() {
  if (isDisabled()) return
  const cache = await readCache()
  if (cache && Number.isFinite(cache.lastCheck)
      && Date.now() - cache.lastCheck < CHECK_INTERVAL_MS) {
    return
  }
  try {
    const latest = await fetchLatestVersion()
    await writeCache({ lastCheck: Date.now(), latestVersion: latest })
  } catch {
    // 静默忽略，等下一次跑命令时再试
  }
}

/**
 * 让别的模块（如 update 命令）查到 latest 后顺手喂给缓存，
 * 这样后续 refreshCacheIfStale 就不会再触发一次重复请求。
 */
export async function recordLatestVersion(latestVersion) {
  if (!latestVersion) return
  await writeCache({ lastCheck: Date.now(), latestVersion })
}

// 测试用：暴露 lazy getter 让测试断言缓存路径
export const __test = { getCachePath, CHECK_INTERVAL_MS, FETCH_TIMEOUT_MS }
