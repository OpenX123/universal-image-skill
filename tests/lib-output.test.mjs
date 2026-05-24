// skill/lib/output.mjs 测试
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { stat, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { Buffer } from 'node:buffer'
import {
  resolveOutputDir,
  makeFilename,
  saveBuffer,
  saveSource
} from '../skill/lib/output.mjs'
import { withTempDir, withEnv } from './helpers.mjs'

describe('skill/lib/output.mjs', () => {
  it('resolveOutputDir(undefined)：OUTPUT_DIR 未设时回退到 ./output（基于 cwd 的绝对路径）', async () => {
    await withEnv({ OUTPUT_DIR: undefined }, async () => {
      const dir = resolveOutputDir(undefined)
      assert.ok(isAbsolute(dir), '返回应是绝对路径')
      assert.ok(dir.endsWith('output') || dir.includes('output'), `应当含 output，实际 ${dir}`)
    })
  })

  it('resolveOutputDir(custom) 接受自定义路径', async () => {
    await withTempDir(async (tmp) => {
      const result = resolveOutputDir(tmp)
      assert.equal(result, tmp)
    })
  })

  it("makeFilename('mermaid','png') 匹配规范命名", () => {
    const name = makeFilename('mermaid', 'png')
    const re = /^img-\d{8}-\d{6}-mermaid-[0-9a-f]{4,8}\.png$/
    assert.ok(re.test(name), `命名不符合期望：${name}`)
  })

  it("makeFilename 支持带点的扩展名 '.svg' 并 hash 种子稳定", () => {
    const a = makeFilename('plantuml', '.svg', 'seed-x')
    const b = makeFilename('plantuml', 'svg', 'seed-x')
    // a 和 b 时间戳可能相同也可能差 1 秒；至少都得能解析正常
    assert.ok(/\.svg$/.test(a))
    assert.ok(/\.svg$/.test(b))
    // hash 段是稳定的（去掉时间戳前缀比较）
    const hashA = a.split('-').pop().replace(/\.svg$/, '')
    const hashB = b.split('-').pop().replace(/\.svg$/, '')
    assert.equal(hashA, hashB, '相同 seed 应得相同 hash')
  })

  it('saveBuffer 写入后文件存在且 size > 0', async () => {
    await withTempDir(async (tmp) => {
      const buf = Buffer.from('hello-test-output')
      const full = await saveBuffer(tmp, 'demo.png', buf)
      assert.ok(existsSync(full))
      const st = await stat(full)
      assert.ok(st.size > 0)
      assert.equal(st.size, buf.length)
    })
  })

  it('saveSource：写入文本与传入一致，基于图片 basename 但扩展不同', async () => {
    await withTempDir(async (tmp) => {
      const imageName = 'img-20260524-103045-mermaid-a3f7.png'
      const sourceText = 'graph TD\n  A-->B'
      const full = await saveSource(tmp, imageName, sourceText, 'mmd')
      assert.ok(full && full.endsWith('.mmd'))
      const text = await readFile(full, 'utf8')
      assert.equal(text, sourceText)
      // 同目录、同 basename
      assert.equal(full, join(tmp, 'img-20260524-103045-mermaid-a3f7.mmd'))
    })
  })

  it('saveSource：源文本为空时返回 null（不写文件）', async () => {
    await withTempDir(async (tmp) => {
      const result = await saveSource(tmp, 'x.png', '', 'mmd')
      assert.equal(result, null)
    })
  })
})
