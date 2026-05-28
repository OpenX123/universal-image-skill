import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import {
  getVersionJsonPath,
  getPackageJsonPath,
  PACKAGE_NAME,
} from './paths.mjs';

async function readJsonSafe(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 简易 semver 比较：返回 1 / 0 / -1
 * 只比较 major.minor.patch，prerelease/build 元数据忽略。
 */
export function compareSemver(a, b) {
  const normalize = (v) => {
    const core = String(v).split('+')[0].split('-')[0];
    const parts = core.split('.').map((x) => parseInt(x, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
  };
  const pa = normalize(a);
  const pb = normalize(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function fetchJsonWithTimeout(url, timeoutMs = 8000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'universal-image-skill-cli',
        ...headers,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLatestVersion() {
  const url = `https://registry.npmjs.org/${PACKAGE_NAME}`;
  const data = await fetchJsonWithTimeout(url, 8000);
  const latest = data?.['dist-tags']?.latest;
  if (!latest) {
    throw new Error('npm registry 响应缺少 dist-tags.latest');
  }
  return latest;
}

async function fetchChangelog() {
  // openx123/universal-image-skill
  const url = `https://api.github.com/repos/openx123/universal-image-skill/releases/latest`;
  try {
    const data = await fetchJsonWithTimeout(url, 6000, {
      'Accept': 'application/vnd.github+json',
    });
    return {
      tag: data?.tag_name ?? '',
      body: data?.body ?? '',
    };
  } catch {
    return null;
  }
}

async function confirm(question) {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * spawn 一个子进程并把 stdio 透传给当前终端，让用户实时看到 npm/npx 的输出。
 * Windows 下 npm/npx 实际是 .cmd 文件，需要 shell:true 才能被 spawn 找到。
 * 返回 { ok, code }。
 */
function runStreaming(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32', // npm.cmd / npx.cmd 必须经 shell
    });
    child.on('error', (err) => {
      console.error(`✗ 启动 ${command} 失败: ${err.message}`);
      resolve({ ok: false, code: -1 });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, code });
    });
  });
}

/**
 * 当用户确认升级后，尝试一键完成：npm i -g 拉新包 + 跑新包的 install。
 * 任一步骤失败则退化到提示用户手动跑两步。
 * 注意：当前 Node 进程的源码即便被 npm 覆盖也不会崩——Node 已把模块载入内存。
 * install 必须 spawn 子进程跑，子进程会重新加载磁盘上的新版 CLI；如果在
 * 当前进程内 import './install.mjs'，用的还是内存里的旧版函数。
 */
async function performAutoUpgrade(latestVersion) {
  console.log('');
  console.log(`→ 正在拉取 ${PACKAGE_NAME}@${latestVersion} ...`);
  console.log(`  执行: npm install -g ${PACKAGE_NAME}@latest`);
  console.log('');
  const step1 = await runStreaming('npm', ['install', '-g', `${PACKAGE_NAME}@latest`]);
  if (!step1.ok) {
    console.log('');
    console.error(`✗ npm install -g 失败（退出码 ${step1.code}）。`);
    return false;
  }

  console.log('');
  console.log('→ 部署新版 skill 文件到 ~/.claude/skills/universal-image ...');
  console.log('  执行: universal-image-skill install');
  console.log('');
  // 用 npx 调起最新版的 bin，避免 PATH 指向旧 shim 或全局未链接的问题。
  // --no-install 防止它又去拉一遍包；-y 跳过 npx 的 install prompt。
  const step2 = await runStreaming(
    'npx',
    ['-y', `${PACKAGE_NAME}@${latestVersion}`, 'install'],
  );
  if (!step2.ok) {
    console.log('');
    console.error(`✗ install 步骤失败（退出码 ${step2.code}）。`);
    return false;
  }

  console.log('');
  console.log(`✓ 已升级到 v${latestVersion}。重启 Claude Code 后生效。`);
  return true;
}

export default async function runUpdate() {
  // 1. 读本地版本
  const localMeta = await readJsonSafe(getVersionJsonPath());
  if (!localMeta) {
    console.error('✗ 未检测到已安装的 Skill。请先运行：');
    console.error('  universal-image-skill install');
    process.exitCode = 1;
    return;
  }
  const localVersion = localMeta.version ?? '0.0.0';
  console.log(`本地已安装版本: ${localVersion}`);

  // 2. 拉 npm registry
  let latestVersion;
  try {
    console.log('→ 查询 npm registry 中的最新版本 ...');
    latestVersion = await fetchLatestVersion();
  } catch (err) {
    console.error(`✗ 查询 npm 失败：${err.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`npm 最新版本:   ${latestVersion}`);
  // 顺手喂给 notifier 的缓存，避免 cli.mjs 后置再发一次请求。
  // 动态 import 避免 update.mjs 和 notifier.mjs 互相依赖。
  try {
    const { recordLatestVersion } = await import('./notifier.mjs');
    await recordLatestVersion(latestVersion);
  } catch {
    // 静默，无关主流程
  }

  // 3. 比较
  const cmp = compareSemver(latestVersion, localVersion);
  if (cmp <= 0) {
    console.log('');
    console.log(`✓ 已是最新版本 v${localVersion}`);
    return;
  }

  // 4. 拉 changelog
  console.log('');
  console.log(`→ 发现新版本 v${latestVersion}`);
  const changelog = await fetchChangelog();
  if (changelog && changelog.body) {
    console.log('');
    console.log('--- Changelog ---');
    console.log(changelog.body.trim());
    console.log('-----------------');
  }

  // 5. 确认
  console.log('');
  const ok = await confirm('是否升级到该版本？(y/N): ');
  if (!ok) {
    console.log('已取消。');
    return;
  }

  // 6. 自动一键升级；失败则退化到手动两步提示
  const upgraded = await performAutoUpgrade(latestVersion);
  if (upgraded) return;

  console.log('');
  console.log('→ 自动升级未完成，请按以下两步手动完成：');
  console.log('');
  console.log(`  1. npm install -g ${PACKAGE_NAME}@latest`);
  console.log('  2. universal-image-skill install');
  console.log('');
  console.log('升级流程会自动备份 .env 与旧版本目录，不会丢配置。');
  process.exitCode = 1;
}
