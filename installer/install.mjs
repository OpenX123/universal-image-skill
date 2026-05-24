import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getClaudeSkillsDir,
  getSkillInstallDir,
  getEnvPath,
  getVersionJsonPath,
  getPackageSkillSourceDir,
  getPackageJsonPath,
  getOldDirBackupPath,
  getBackupRootDir,
  getLegacyBackupGlob,
  PACKAGE_NAME,
} from './paths.mjs';

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 把 ~/.claude/skills/universal-image.bak-* 这种遗留备份移到新位置。
 * 0.3.0 之前的 installer 把备份放在 skills/ 下，会被 Claude Code
 * 当成 Skill 加载（"幽灵 Skill"），这里一次性清理。
 */
async function migrateLegacyBackups() {
  const { dir, prefix, envPrefix } = getLegacyBackupGlob();
  const backupRoot = getBackupRootDir();
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const isDirBackup = name.startsWith(prefix);
    const isEnvBackup = name.startsWith(envPrefix);
    if (!isDirBackup && !isEnvBackup) continue;
    const src = path.join(dir, name);
    const dst = path.join(backupRoot, isEnvBackup ? `legacy-${name}` : `legacy-${name.slice(prefix.length)}`);
    try {
      await fs.rename(src, dst);
      console.log(`→ 迁移遗留备份：${name} -> ${path.relative(backupRoot, dst) || dst}`);
    } catch (e) {
      // 迁移失败不阻塞主流程
      console.log(`  (跳过遗留备份 ${name}：${e.message})`);
    }
  }
}

function isoTimestampForFilename() {
  // 2026-05-24T10:30:00Z -> 20260524-103000
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
    .replace('T', '-')
    .replace('Z', '');
}

export default async function runInstall() {
  const skillsRoot = getClaudeSkillsDir();
  const installDir = getSkillInstallDir();
  const sourceDir = getPackageSkillSourceDir();
  const envPath = getEnvPath();
  const versionJsonPath = getVersionJsonPath();

  // 1. 校验源 skill/ 目录
  if (!(await pathExists(sourceDir))) {
    console.error(`✗ 源 skill 目录不存在：${sourceDir}`);
    console.error('  请确认 npm 包完整，或在仓库根目录下执行。');
    process.exitCode = 1;
    return;
  }

  // 读取要安装的版本号
  const pkg = await readJsonSafe(getPackageJsonPath());
  const newVersion = pkg?.version ?? '0.0.0';

  // 2. 准备目录（安装根 + 备份根）
  await fs.mkdir(skillsRoot, { recursive: true });
  await fs.mkdir(getBackupRootDir(), { recursive: true });

  // 2b. 迁移 0.3.0 之前的遗留备份（之前放在 skills/ 下会被当幽灵 Skill）
  await migrateLegacyBackups();

  // 3. 备份现有安装
  let envBackup = null;
  if (await pathExists(installDir)) {
    const oldVersionMeta = await readJsonSafe(versionJsonPath);
    const oldVersion = oldVersionMeta?.version ?? 'unknown';

    if (await pathExists(envPath)) {
      envBackup = await fs.readFile(envPath, 'utf8');
    }

    const backupDir = getOldDirBackupPath(oldVersion, isoTimestampForFilename());
    console.log(`→ 检测到已安装版本 ${oldVersion}，备份旧目录到：`);
    console.log(`  ${backupDir}`);
    await fs.rename(installDir, backupDir);
  }

  // 4. 复制 skill/ -> install dir
  console.log(`→ 复制 skill 文件到 ${installDir} ...`);
  await fs.cp(sourceDir, installDir, { recursive: true });

  // 5. 写回 .env 备份
  if (envBackup !== null) {
    await fs.writeFile(envPath, envBackup, 'utf8');
    console.log('→ 已恢复用户 .env 配置');
  }

  // 6. 写 version.json
  const versionMeta = {
    version: newVersion,
    installedAt: new Date().toISOString(),
    source: PACKAGE_NAME,
    channel: 'stable',
  };
  await fs.writeFile(
    versionJsonPath,
    JSON.stringify(versionMeta, null, 2) + '\n',
    'utf8',
  );

  // 7. 提示
  console.log('');
  console.log('✓ 安装完成。重启 Claude Code 后即可使用。');
  console.log(`  安装路径：${installDir}`);
  console.log(`  版本：${newVersion}`);

  if (envBackup === null) {
    console.log('');
    console.log('→ 还未配置 API 凭据。请运行：');
    console.log('  universal-image-skill config');
  }
}
