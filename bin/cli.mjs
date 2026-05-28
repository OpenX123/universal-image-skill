#!/usr/bin/env node
import fs from 'node:fs/promises';
import {
  getPackageJsonPath,
  getVersionJsonPath,
  getSkillInstallDir,
} from '../installer/paths.mjs';
import {
  showNotificationIfAvailable,
  refreshCacheIfStale,
} from '../installer/notifier.mjs';

const HELP_TEXT = `万能生图 Skill - CLI

用法:
  universal-image-skill <command>

命令:
  install      安装 Skill 到 ~/.claude/skills/universal-image/
  update       检查 npm 上的最新版本并提示如何升级
  config       交互式配置 .env（中转站 / API Key / 服务地址 等）
  uninstall    卸载 Skill，保留 .env 备份
  version      显示 CLI 版本与已安装 Skill 版本
  help, -h, --help    显示此帮助

文档与源码:
  https://github.com/openx123/universal-image-skill
`;

async function readJsonSafe(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function runVersion() {
  const pkg = await readJsonSafe(getPackageJsonPath());
  const cliVersion = pkg?.version ?? '0.0.0';
  console.log(`CLI 版本:     ${cliVersion}`);

  const installed = await readJsonSafe(getVersionJsonPath());
  if (!installed) {
    console.log(`已安装版本: 未安装（${getSkillInstallDir()}）`);
    return;
  }
  const installedAt = installed.installedAt ? ` (${installed.installedAt})` : '';
  console.log(`已安装版本: ${installed.version ?? 'unknown'}${installedAt}`);
}

function printHelp() {
  process.stdout.write(HELP_TEXT);
}

// 不在 help / update 命令里跑前置提示：
// - help：用户只是在查命令，提示会干扰
// - update：命令本身就会主动查并展示更新信息，再加前置提示是冗余
const SKIP_PRE_NOTIFIER = new Set(['help', '-h', '--help', 'update']);

async function dispatch(argv) {
  const cmd = argv[0];

  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    printHelp();
    return 0;
  }

  // 前置：根据缓存打提示（瞬时；缓存为空时跳过）
  if (!SKIP_PRE_NOTIFIER.has(cmd)) {
    const pkg = await readJsonSafe(getPackageJsonPath());
    await showNotificationIfAvailable(pkg?.version);
  }

  switch (cmd) {
    case 'install': {
      const { default: runInstall } = await import('../installer/install.mjs');
      await runInstall();
      return process.exitCode ?? 0;
    }
    case 'update': {
      const { default: runUpdate } = await import('../installer/update.mjs');
      await runUpdate();
      return process.exitCode ?? 0;
    }
    case 'config': {
      const { default: runConfig } = await import('../installer/config.mjs');
      await runConfig();
      return process.exitCode ?? 0;
    }
    case 'uninstall': {
      const { default: runUninstall } = await import('../installer/uninstall.mjs');
      await runUninstall();
      return process.exitCode ?? 0;
    }
    case 'version':
    case '--version':
    case '-v': {
      await runVersion();
      return 0;
    }
    default: {
      console.error(`未知命令: ${cmd}\n`);
      printHelp();
      return 1;
    }
  }
}

async function main() {
  try {
    const code = await dispatch(process.argv.slice(2));
    // 后置：缓存过期才发请求查 registry，最多多花 1.5s，失败静默
    await refreshCacheIfStale();
    process.exit(code);
  } catch (err) {
    console.error('✗ 执行失败：');
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  }
}

main();
