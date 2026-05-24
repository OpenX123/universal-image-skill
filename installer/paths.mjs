import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_NAME = 'universal-image';
export const PACKAGE_NAME = '@openx123/universal-image-skill';

/**
 * Claude Code 的 skills 根目录，跨平台统一为 ~/.claude/skills
 * Windows: %USERPROFILE%\.claude\skills
 * macOS/Linux: ~/.claude/skills
 */
export function getClaudeSkillsDir() {
  return path.join(os.homedir(), '.claude', 'skills');
}

/**
 * 当前 Skill 的安装目标目录
 */
export function getSkillInstallDir() {
  return path.join(getClaudeSkillsDir(), SKILL_NAME);
}

/**
 * 已安装 Skill 的 .env 文件路径
 */
export function getEnvPath() {
  return path.join(getSkillInstallDir(), '.env');
}

/**
 * 已安装 Skill 的 version.json 文件路径
 */
export function getVersionJsonPath() {
  return path.join(getSkillInstallDir(), 'version.json');
}

/**
 * 当前 npm 包的根目录（包含 package.json 的目录）
 * installer/paths.mjs 位于 <pkgRoot>/installer/paths.mjs
 */
export function getPackageRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // here = <pkgRoot>/installer
  return path.resolve(here, '..');
}

/**
 * npm 包内随发布的 skill/ 源目录
 */
export function getPackageSkillSourceDir() {
  return path.join(getPackageRoot(), 'skill');
}

/**
 * 当前 npm 包的 package.json 路径
 */
export function getPackageJsonPath() {
  return path.join(getPackageRoot(), 'package.json');
}

/**
 * .env 在卸载时的备份路径（位于 skills 根目录而非已删除的 skill 目录）
 */
export function getEnvBackupPath(timestamp) {
  return path.join(
    getClaudeSkillsDir(),
    `${SKILL_NAME}.env.backup-${timestamp}`,
  );
}

/**
 * 旧版本目录的备份路径（升级时把现有目录改名）
 */
export function getOldDirBackupPath(oldVersion, timestamp) {
  const ver = oldVersion || 'unknown';
  return path.join(
    getClaudeSkillsDir(),
    `${SKILL_NAME}.bak-${ver}-${timestamp}`,
  );
}
