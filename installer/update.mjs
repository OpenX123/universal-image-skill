import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
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

  // 6. 提示用户怎么升
  console.log('');
  console.log('→ 当前 CLI 进程运行的是已安装版本，无法就地替换自身。');
  console.log('  请按以下两步完成升级：');
  console.log('');
  console.log(`  1. npm install -g ${PACKAGE_NAME}@latest`);
  console.log('  2. universal-image-skill install');
  console.log('');
  console.log('升级流程会自动备份 .env 与旧版本目录，不会丢配置。');
}
