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
 * 备份根目录：~/.claude/universal-image-backups/
 * 故意放在 skills/ 之外，避免备份的 SKILL.md 被 Claude Code 当成新 Skill 加载
 */
export function getBackupRootDir() {
  return path.join(os.homedir(), '.claude', `${SKILL_NAME}-backups`);
}

/**
 * .env 在卸载时的备份路径
 */
export function getEnvBackupPath(timestamp) {
  return path.join(getBackupRootDir(), `env-${timestamp}.bak`);
}

/**
 * 旧版本目录的备份路径（升级时把现有目录改名）
 */
export function getOldDirBackupPath(oldVersion, timestamp) {
  const ver = oldVersion || 'unknown';
  return path.join(getBackupRootDir(), `${ver}-${timestamp}`);
}

/**
 * 历史遗留备份目录（0.3.0 及更早版本放在 skills/ 下）
 * 升级时迁移到新位置，避免 Claude 误识别为 Skill
 */
export function getLegacyBackupGlob() {
  return {
    dir: getClaudeSkillsDir(),
    prefix: `${SKILL_NAME}.bak-`,
    envPrefix: `${SKILL_NAME}.env.backup-`,
  };
}
