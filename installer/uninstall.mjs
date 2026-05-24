import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  getSkillInstallDir,
  getEnvPath,
  getEnvBackupPath,
} from './paths.mjs';

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function isoTimestampForFilename() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
    .replace('T', '-')
    .replace('Z', '');
}

export default async function runUninstall() {
  const installDir = getSkillInstallDir();
  const envPath = getEnvPath();

  if (!(await pathExists(installDir))) {
    console.log(`未检测到已安装的 Skill：${installDir}`);
    return;
  }

  console.log(`将卸载 Skill 目录：${installDir}`);
  if (await pathExists(envPath)) {
    console.log('  你的 .env 配置会先备份再删除。');
  }
  console.log('');

  const rl = readline.createInterface({ input, output });
  let answer = '';
  try {
    answer = (await rl.question('确认卸载？输入 yes 继续: ')).trim().toLowerCase();
  } finally {
    rl.close();
  }

  if (answer !== 'yes') {
    console.log('已取消。');
    return;
  }

  // 备份 .env
  let backupPath = null;
  if (await pathExists(envPath)) {
    const content = await fs.readFile(envPath, 'utf8');
    backupPath = getEnvBackupPath(isoTimestampForFilename());
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, content, 'utf8');
  }

  // 删除目录
  await fs.rm(installDir, { recursive: true, force: true });

  console.log('');
  console.log('✓ 已卸载。');
  if (backupPath) {
    console.log(`  .env 备份保留在：${backupPath}`);
  }
}
