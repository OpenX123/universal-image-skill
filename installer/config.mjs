import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import {
  getSkillInstallDir,
  getEnvPath,
} from './paths.mjs';

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析 .env 文本为 { key: value } 对象。
 * 支持注释行(#)、空行、值不带引号或带成对引号。
 */
function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * 把 { key: value } 序列化为 .env 文本，附带注释分组。
 */
function serializeEnv(env) {
  const lines = [];
  lines.push('# 万能生图 Skill 配置');
  lines.push('# 由 universal-image-skill config 生成');
  lines.push('');
  lines.push('# === AI 生图（GPT-Image 中转站）===');
  lines.push(`IMAGE_API_BASE_URL=${env.IMAGE_API_BASE_URL ?? ''}`);
  lines.push(`IMAGE_API_KEY=${env.IMAGE_API_KEY ?? ''}`);
  lines.push(`IMAGE_MODEL=${env.IMAGE_MODEL ?? 'gpt-image-2'}`);
  lines.push('');
  lines.push('# === Mermaid 服务 ===');
  lines.push(`MERMAID_INK_URL=${env.MERMAID_INK_URL ?? 'https://mermaid.ink'}`);
  lines.push('');
  lines.push('# === PlantUML 服务 ===');
  lines.push(
    `PLANTUML_SERVER_URL=${env.PLANTUML_SERVER_URL ?? 'https://www.plantuml.com/plantuml'}`,
  );
  lines.push('');
  lines.push('# === 输出 ===');
  lines.push(`OUTPUT_DIR=${env.OUTPUT_DIR ?? './output'}`);
  lines.push(`DEFAULT_FORMAT=${env.DEFAULT_FORMAT ?? 'png'}`);
  lines.push('');
  return lines.join('\n');
}

function maskSecret(s) {
  if (!s) return '';
  if (s.length <= 6) return '*'.repeat(s.length);
  return s.slice(0, 3) + '*'.repeat(Math.max(4, s.length - 6)) + s.slice(-3);
}

const CHAR_CTRL_C = '\x03';
const CHAR_CR = '\r';
const CHAR_LF = '\n';
const CHAR_BACKSPACE = '\x08';
const CHAR_DEL = '\x7f';

/**
 * 隐藏式输入（用 * 回显）。基于 raw mode 逐字读 stdin。
 * 失败回退到普通明文输入。
 */
async function readSecret(promptText) {
  process.stdout.write(promptText);

  // 非 TTY 直接走 readline，无法做隐藏
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    const rl = readline.createInterface({ input, output });
    try {
      const v = await rl.question('');
      return v;
    } finally {
      rl.close();
    }
  }

  return new Promise((resolve) => {
    let buf = '';
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    const cleanup = () => {
      input.removeListener('data', onData);
      input.setRawMode(wasRaw ?? false);
      input.pause();
    };

    const onData = (chunk) => {
      // 可能是多字节粘贴，逐字符处理
      for (const ch of chunk) {
        if (ch === CHAR_CTRL_C) {
          cleanup();
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === CHAR_CR || ch === CHAR_LF) {
          cleanup();
          process.stdout.write('\n');
          resolve(buf);
          return;
        }
        if (ch === CHAR_BACKSPACE || ch === CHAR_DEL) {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        // 跳过其他控制字符
        if (ch < ' ') continue;
        buf += ch;
        process.stdout.write('*');
      }
    };

    input.on('data', onData);
  });
}

async function ask(rl, promptText, defaultValue) {
  const hint = defaultValue ? ` [${defaultValue}]` : '';
  const ans = (await rl.question(`${promptText}${hint}: `)).trim();
  if (!ans) return defaultValue ?? '';
  return ans;
}

/**
 * 跑烟测：spawn 子进程跑 render 脚本，解析最后一行 JSON。
 */
function smokeTest(scriptPath, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGTERM'); } catch {}
      resolve({ ok: false, error: `超时（${timeoutMs}ms）` });
    }, timeoutMs);

    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });

    child.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });

    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? '';
      try {
        const parsed = JSON.parse(last);
        if (parsed && parsed.ok === true) {
          resolve({ ok: true });
        } else {
          const msg = parsed?.error?.message
            || parsed?.error
            || `退出码 ${code}`;
          resolve({ ok: false, error: msg });
        }
      } catch {
        resolve({
          ok: false,
          error: stderr.trim().split(/\r?\n/).pop() || `退出码 ${code}`,
        });
      }
    });
  });
}

export default async function runConfig() {
  const installDir = getSkillInstallDir();
  const envPath = getEnvPath();

  if (!(await pathExists(installDir))) {
    console.error('✗ 尚未安装 Skill。请先运行：');
    console.error('  universal-image-skill install');
    process.exitCode = 1;
    return;
  }

  // 读取现有配置
  let current = {};
  if (await pathExists(envPath)) {
    const text = await fs.readFile(envPath, 'utf8');
    current = parseEnv(text);
  }

  console.log('');
  console.log('=== 万能生图 Skill 配置 ===');
  console.log('');

  const rl = readline.createInterface({ input, output });
  const answers = {};
  try {
    console.log('AI 生图（GPT-Image 中转站）');
    answers.IMAGE_API_BASE_URL = await ask(
      rl,
      '  中转站 base URL（如 https://your-proxy.com/v1）',
      current.IMAGE_API_BASE_URL || '',
    );

    // API Key：用隐藏输入
    const currentMasked = maskSecret(current.IMAGE_API_KEY || '');
    const keyHint = currentMasked ? ` [当前: ${currentMasked}，回车保留]` : '';
    rl.pause(); // 让 readSecret 直接接管 stdin
    const keyInput = await readSecret(`  API Key（输入将隐藏）${keyHint}: `);
    rl.resume();
    answers.IMAGE_API_KEY = keyInput.trim()
      ? keyInput.trim()
      : (current.IMAGE_API_KEY || '');

    answers.IMAGE_MODEL = await ask(
      rl,
      '  模型名',
      current.IMAGE_MODEL || 'gpt-image-2',
    );

    console.log('');
    answers.MERMAID_INK_URL = await ask(
      rl,
      'Mermaid 服务',
      current.MERMAID_INK_URL || 'https://mermaid.ink',
    );
    answers.PLANTUML_SERVER_URL = await ask(
      rl,
      'PlantUML 服务',
      current.PLANTUML_SERVER_URL || 'https://www.plantuml.com/plantuml',
    );
    answers.OUTPUT_DIR = await ask(
      rl,
      '输出目录',
      current.OUTPUT_DIR || './output',
    );
    answers.DEFAULT_FORMAT = await ask(
      rl,
      '默认格式',
      current.DEFAULT_FORMAT || 'png',
    );
  } finally {
    rl.close();
  }

  // 写入 .env
  const envText = serializeEnv(answers);
  await fs.writeFile(envPath, envText, 'utf8');
  console.log('');
  console.log(`→ 已写入 ${envPath}`);

  // 烟测
  console.log('');
  console.log('→ 跑烟测 ...');

  const scriptsDir = path.join(installDir, 'scripts');
  const mermaidScript = path.join(scriptsDir, 'render-mermaid.mjs');
  const plantumlScript = path.join(scriptsDir, 'render-plantuml.mjs');
  const imageScript = path.join(scriptsDir, 'render-image.mjs');

  // Mermaid
  if (await pathExists(mermaidScript)) {
    const r = await smokeTest(
      mermaidScript,
      ['--inline', 'graph TD; A-->B'],
      8000,
    );
    console.log(r.ok ? '  ✓ Mermaid: OK' : `  ✗ Mermaid: ${r.error}`);
  } else {
    console.log('  - Mermaid: 脚本不存在，跳过');
  }

  // PlantUML
  if (await pathExists(plantumlScript)) {
    const r = await smokeTest(
      plantumlScript,
      ['--inline', '@startuml\nA -> B\n@enduml'],
      8000,
    );
    console.log(r.ok ? '  ✓ PlantUML: OK' : `  ✗ PlantUML: ${r.error}`);
  } else {
    console.log('  - PlantUML: 脚本不存在，跳过');
  }

  // AI 生图
  if (!answers.IMAGE_API_BASE_URL || !answers.IMAGE_API_KEY) {
    console.log('  - AI 生图: 未配置 base URL 或 API Key，跳过');
  } else if (await pathExists(imageScript)) {
    const r = await smokeTest(
      imageScript,
      ['--prompt', 'a tiny red dot', '--smoke'],
      15000,
    );
    console.log(r.ok ? '  ✓ AI 生图: OK' : `  ✗ AI 生图: ${r.error}`);
  } else {
    console.log('  - AI 生图: 脚本不存在，跳过');
  }

  console.log('');
  console.log('完成。');
}
