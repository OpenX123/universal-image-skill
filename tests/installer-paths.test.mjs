// installer/paths.mjs 路径模块测试
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sep } from 'node:path'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  getClaudeSkillsDir,
  getSkillInstallDir,
  getEnvPath,
  getVersionJsonPath,
  getPackageRoot,
  getBackupRootDir,
  getOldDirBackupPath,
  getEnvBackupPath,
  SKILL_NAME
} from '../installer/paths.mjs'

describe('installer/paths.mjs', () => {
  it('SKILL_NAME 是 universal-image', () => {
    assert.equal(SKILL_NAME, 'universal-image')
  })

  it('getClaudeSkillsDir 含 .claude 和 skills', () => {
    const dir = getClaudeSkillsDir()
    assert.ok(typeof dir === 'string' && dir.length > 0)
    if (process.platform === 'win32') {
      // Windows 下应当含 .claude\skills（或路径分隔符同 sep）
      const tail = `.claude${sep}skills`
      assert.ok(dir.endsWith(tail) || dir.includes(tail), `应包含 ${tail}，实际 ${dir}`)
    } else {
      // posix 下应当以 /.claude/skills 结尾
      assert.ok(dir.endsWith('/.claude/skills'), `posix 路径应 /.claude/skills 结尾，实际 ${dir}`)
    }
  })

  it('getSkillInstallDir 结尾是 universal-image', () => {
    const dir = getSkillInstallDir()
    assert.ok(dir.endsWith(SKILL_NAME), `应当 ${SKILL_NAME} 结尾，实际 ${dir}`)
  })

  it('getEnvPath 结尾是 .env', () => {
    const p = getEnvPath()
    assert.ok(p.endsWith('.env'), `应当以 .env 结尾，实际 ${p}`)
    // 且位于 SKILL_NAME 目录下
    assert.ok(p.includes(SKILL_NAME))
  })

  it('getVersionJsonPath 结尾是 version.json', () => {
    const p = getVersionJsonPath()
    assert.ok(p.endsWith('version.json'))
    assert.ok(p.includes(SKILL_NAME))
  })

  it('getPackageRoot 目录下存在 package.json', () => {
    const root = getPackageRoot()
    assert.ok(existsSync(join(root, 'package.json')), `package.json 应在 ${root}`)
  })

  it('getBackupRootDir 在 skills/ 之外（避免被当幽灵 Skill）', () => {
    const backup = getBackupRootDir()
    const skills = getClaudeSkillsDir()
    assert.ok(
      !backup.startsWith(skills),
      `备份根 ${backup} 不能位于 skills 根 ${skills} 之下`,
    )
    assert.ok(
      backup.endsWith(`${SKILL_NAME}-backups`),
      `备份根应以 ${SKILL_NAME}-backups 结尾，实际 ${backup}`,
    )
  })

  it('getOldDirBackupPath 在备份根下，含版本号与时间戳', () => {
    const p = getOldDirBackupPath('0.3.0', '20260524-120000')
    assert.ok(p.startsWith(getBackupRootDir()))
    assert.ok(p.endsWith('0.3.0-20260524-120000'))
  })

  it('getEnvBackupPath 在备份根下，含时间戳', () => {
    const p = getEnvBackupPath('20260524-120000')
    assert.ok(p.startsWith(getBackupRootDir()))
    assert.ok(p.endsWith('20260524-120000.bak'))
  })
})
