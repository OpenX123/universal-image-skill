# @openx123/universal-image-skill

[![npm version](https://img.shields.io/npm/v/@openx123/universal-image-skill.svg)](https://www.npmjs.com/package/@openx123/universal-image-skill)
[![license](https://img.shields.io/npm/l/@openx123/universal-image-skill.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@openx123/universal-image-skill.svg)](https://nodejs.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/openx123/universal-image-skill/ci.yml?branch=main&label=CI)](https://github.com/openx123/universal-image-skill/actions/workflows/ci.yml)

Claude Code 万能生图 Skill — 让 Claude 自动选用 PlantUML / AI 生图两种引擎之一生成图片。


---

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [升级 / 更新](#升级--更新)
- [使用示例](#使用示例)
- [双引擎对比](#双引擎对比)
- [配置说明](#配置说明)
- [命令清单](#命令清单)
- [隐私与数据](#隐私与数据)
- [故障排查](#故障排查)
- [开发与贡献](#开发与贡献)
- [License](#license)

---

## 特性

- **双引擎自动路由**：Claude 读 `SKILL.md` 中的决策表，根据你的自然语言意图自动挑选合适引擎，模糊场景默认走 AI 生图而不是瞎画。
- **零本地依赖**：纯在线 API 调用，不需要安装 Java、Chromium、Graphviz、jar 包。npm 包体积 < 100KB，安装时间 < 5 秒。
- **跨平台**：Windows / macOS / Linux 行为完全一致，路径解析、shell 命令均经过实测。
- **npm 一键安装**：`npx @openx123/universal-image-skill install` 即装即用。
- **备份式更新**：升级时旧目录改名为 `.bak-<旧版本>`，自动保护用户 `.env`，永远不会静默覆盖你的配置。
- **PlantUML 高质量增强**：内置 C4-PlantUML / AWS / Azure 图标库 `!include` 速查表，Claude 会在画云架构时主动用上官方图标，告别"无图标的纯方框"。

---

## 快速开始

### 1. 前置要求

- Node.js >= 20
- Claude Code（任意桌面端，已能识别 `~/.claude/skills/` 目录）
- 一个 OpenAI 兼容协议的中转站（仅 AI 生图引擎需要）

### 2. 安装与配置

```bash
# 安装 Skill 到 ~/.claude/skills/universal-image/
npx @openx123/universal-image-skill install

# 交互式填入中转站地址、密钥、模型名等
npx @openx123/universal-image-skill config

# 重启 Claude Code，让它加载新 Skill
```

### 3. 试一句

重启后对 Claude 说一句：

> /universal-image 帮我画一个claude web端多agents对话的原型图

Claude 会自动调用生图引擎，把图片写到当前工作目录的 `./output/` 下，并在回复中用 Markdown 引用。

---

## 升级 / 更新

### 推荐：一键升级（0.4.2+ 起可用）

如果你当前已安装版本 ≥ 0.4.2，直接：

```bash
universal-image-skill update
```

它会：
1. 查 npm registry 比对版本，展示新版 changelog
2. 输入 `y` 确认后，自动 spawn `npm install -g @openx123/universal-image-skill@latest` 拉新包（stdio 透传，能实时看进度）
3. 再自动 spawn `npx -y @openx123/universal-image-skill@<新版> install` 把新版 skill 文件部署到 `~/.claude/skills/universal-image/`
4. 任一步失败会优雅退化到下面的"手动两步"提示，不会半挂

升级会自动备份 `.env` 与旧版本目录到 `~/.claude/universal-image-backups/`，不会丢配置。

### 手动两步：当前 < 0.4.2 时必须走

0.4.0 / 0.4.1 用户跑 `update` 仍然执行旧逻辑（只提示不自动执行），必须手动完成：

```bash
# 1. 升级全局 npm 包到最新（这一步是关键，不能跳）
npm install -g @openx123/universal-image-skill@latest

# 2. 把新版 skill 文件部署到 ~/.claude/skills/
universal-image-skill install
```

升到 0.4.2 之后，以后任何版本（0.4.3 / 0.5.0 …）都可以走"推荐"那条一键路径。

### 不要踩这个坑

```bash
# ❌ 这样做装出来还是旧版本
npx @openx123/universal-image-skill install
```

`npx` 默认行为是**优先用本地缓存里已有的包**，不主动联网查最新。如果你之前装过 0.4.0，缓存里就有 0.4.0，再跑这条命令拿到的还是 0.4.0 的 install 脚本，复制出去的 skill 文件也是 0.4.0 的。

强制 npx 拉最新版需要加 `@latest`：

```bash
# ✅ 强制 npx 走 registry 拉最新版
npx -y @openx123/universal-image-skill@latest install
```

`-y` 跳过 npx 的"是否安装这个包"提示，`@latest` 绕开本地缓存。

### 验证当前版本

```bash
universal-image-skill version
# 或
npx @openx123/universal-image-skill version
```

输出会同时显示**本地已安装版本**与**npm registry 上的最新版本**，对不上就说明你装的不是最新的。

---
## 效果预览
<img width="1144" height="700" alt="PixPin_2026-05-24_07-45-08" src="https://github.com/user-attachments/assets/813e5885-b66b-4bcd-a7ae-90cb09d8ba6a" />

<img width="949" height="553" alt="PixPin_2026-05-24_07-45-52" src="https://github.com/user-attachments/assets/300982b1-fcf3-4047-ad30-0c896c0f4615" />

## 使用示例

下面这些一句话指令都能稳定触发对应引擎，不需要你显式指定引擎名。

### PlantUML（流程 / 时序 / 状态机 / 类图 / 甘特 / UML / 云架构 / 思维导图）

```text
你：画一张用户注册的流程图，包含校验邮箱、发送验证码、写库三个步骤。
Claude：[调用 render-plantuml.mjs] → 输出 ./output/img-...-plantuml-xxxx.png
```

```text
你：给我画一个微服务下单的时序图，参与者有客户端、订单服务、库存服务、支付服务。
Claude：[PlantUML sequence] → 输出 png
```

```text
你：画一个 AWS 上的微服务部署架构图，包含 ALB、ECS Fargate、RDS、ElastiCache、S3。
Claude：[PlantUML + aws-icons-for-plantuml] → 输出带官方 AWS 图标的 png
```

```text
你：用 C4 模型画我们订单系统的容器图，包含 Web 前端、API 网关、订单服务、库存服务、Postgres。
Claude：[PlantUML + C4_Container.puml] → 输出标准 C4 容器图
```

```text
你：画一张电商订单表和商品表的 ER 图，订单包含多条订单项。
Claude：[PlantUML ER] → 输出 png（结构精确，AI 生图画不准 ER 图）
```

### AI 生图（写实 / 插画 / 营销素材）

```text
你：生成一张赛博朋克风格的城市夜景，霓虹灯反射在湿漉漉的街道上，电影质感。
Claude：[调用 render-image.mjs，模型走 IMAGE_MODEL] → 输出 png
```

```text
你：帮我生成一张产品发布会的横版海报背景，深蓝色科技感，留白给标题。
Claude：[AI 生图] → 输出 png
```

### 模糊场景默认走 AI 生图

```text
你：给我做张图。
Claude：[默认走 AI 生图，给出好看的视觉成品]
       （如果你要的是流程/时序/UML 之类的结构图，说一句"画流程图/时序图"即可走 PlantUML）
```

---

## 双引擎对比

| 引擎         | 适用场景                                                                  | 后端                                | 速度 | 可控性 | 写实度 |
| ------------ | ------------------------------------------------------------------------- | ----------------------------------- | ---- | ------ | ------ |
| **PlantUML** | 流程图、时序图、状态机、类图、甘特图、用例/组件/部署/对象/ER 图、C4、云架构（AWS/Azure/GCP/K8s）、思维导图 | `plantuml.com` 官方 / 自建 Kroki    | 中   | 高     | 无     |
| **AI 生图**  | 真实照片、插画、艺术风、产品概念图、营销素材、海报封面、原型图、用户旅程图  | OpenAI 兼容协议中转站               | 慢   | 中     | 高     |

### 路由决策表

Claude 内部的判断逻辑（写在 `SKILL.md` 给它读）：

```
用户意图
├─ 流程 / 时序 / 状态机 / 类图 / 甘特 / UML / 云架构 / 思维导图 → PlantUML
├─ 真实 / 照片 / 插画 / 艺术 / 海报 / 封面 / 原型 / 旅程图       → AI 生图
└─ 模糊场景                                                       → 默认 AI 生图
```

### 反例（Claude 也被显式告知不要做）

- 不用 AI 生图画 ER 图 / 云架构（不可控、不精确，改用 PlantUML）
- 不用 PlantUML 画海报 / 营销图（无写实样式，改用 AI 生图）
- 用户明示引擎时绝不偷换（如"用 image2 画流程图"就老实走 AI 生图）

---

## 配置说明

执行 `npx @openx123/universal-image-skill config` 会交互式生成 `~/.claude/skills/universal-image/.env`。你也可以手动编辑，字段如下：

### AI 生图（启用 AI 生图时必填）

| 字段                 | 必填 | 默认值          | 说明                                                                                                       |
| -------------------- | ---- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `IMAGE_API_BASE_URL` | 是   | —              | 中转站的 OpenAI 兼容 API 地址，需含 `/v1`，例：`https://your-proxy.com/v1`                                |
| `IMAGE_API_KEY`      | 是   | —              | 中转站密钥，通常以 `sk-` 开头                                                                              |
| `IMAGE_MODEL`        | 否   | `gpt-image-2`  | 调用的模型名，可换成中转站支持的其他生图模型                                                               |

### PlantUML（可选）

| 字段                  | 必填 | 默认值                                  | 说明                                                                  |
| --------------------- | ---- | --------------------------------------- | --------------------------------------------------------------------- |
| `PLANTUML_SERVER_URL` | 否   | `https://www.plantuml.com/plantuml`     | PlantUML 渲染服务地址，可换成自建 PlantUML server 或 Kroki 实例       |

### 输出

| 字段             | 必填 | 默认值     | 说明                                                                |
| ---------------- | ---- | ---------- | ------------------------------------------------------------------- |
| `OUTPUT_DIR`     | 否   | `./output` | 图片输出目录，默认相对当前工作目录                                  |
| `DEFAULT_FORMAT` | 否   | `png`      | 默认输出格式，可选 `png` / `jpg` / `svg`（依各引擎支持情况而定） |

### `.env` 示例

```bash
# AI 生图
IMAGE_API_BASE_URL=https://your-proxy.com/v1
IMAGE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
IMAGE_MODEL=gpt-image-2

# PlantUML
PLANTUML_SERVER_URL=https://www.plantuml.com/plantuml

# 输出
OUTPUT_DIR=./output
DEFAULT_FORMAT=png
```

---

## 命令清单

所有命令均可通过 `npx @openx123/universal-image-skill <command>` 调用。

| 命令        | 作用                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| `install`   | 把 `skill/` 整目录复制到 `~/.claude/skills/universal-image/`，若已存在则备份旧版本    |
| `config`    | 交互式生成或编辑 `.env`，并对每个引擎做一次烟测，报告可用性                          |
| `update`    | 查 npm registry 比对版本，展示 changelog，确认后**自动**完成 `npm i -g` + `install` 两步（0.4.2+） |
| `uninstall` | 移除 `~/.claude/skills/universal-image/` 目录（备份目录保留，可手动清理）            |
| `version`   | 显示当前已安装版本与 npm 上的最新版本                                                |
| `--help`    | 显示帮助                                                                              |

详细的升级流程见上面的[升级 / 更新](#升级--更新)章节。

---

## 隐私与数据

本 Skill 的两个引擎都会把数据上行到对应服务，请根据你的合规要求选择使用。

| 引擎     | 上行内容                       | 默认目的地                            | 自建建议                                                   |
| -------- | ------------------------------ | ------------------------------------- | ---------------------------------------------------------- |
| PlantUML | 你的 PlantUML 源码             | `plantuml.com`（官方公共服务）       | 自建 [PlantUML server](https://plantuml.com/zh/server) 或 [Kroki](https://kroki.io/) 并设置 `PLANTUML_SERVER_URL` |
| AI 生图  | 你的 prompt 与生成参数         | 你在 `.env` 中配置的中转站           | 中转站本身由你选择和负责，建议优先用合规的官方服务         |

**任何包含商业机密、个人隐私、内部架构敏感信息的内容，强烈建议先自建服务再使用**。本仓库代码不会主动收集任何用户数据。

---

## 故障排查

### 安装后 Claude 不识别 Skill

1. 确认目录已存在：
   - Windows：`%USERPROFILE%\.claude\skills\universal-image\SKILL.md`
   - macOS / Linux：`~/.claude/skills/universal-image/SKILL.md`
2. 完全退出 Claude Code 后再启动（重新加载 Skill 索引）。
3. 用 `npx @openx123/universal-image-skill version` 确认本地版本与 npm 上的版本一致。

### 升级后装出来还是旧版本

最常见的原因是 **npx 缓存陷阱**。如果你用 `npx @openx123/universal-image-skill install`（**不带** `@latest`），npx 会优先用本地缓存里已有的包——缓存里是哪个版本就装哪个版本。强制拉最新版需要加 `@latest`：

```bash
npx -y @openx123/universal-image-skill@latest install
```

升级后跑 `universal-image-skill version` 确认两边版本号一致；如果本地版本号比 npm 最新版本号低，说明这次升级没真正完成，重做一遍上面那条命令。

### AI 生图返回 401 / 403

- 检查 `.env` 中 `IMAGE_API_KEY` 是否复制完整、是否还在有效期内。
- 确认 `IMAGE_API_BASE_URL` 末尾是 `/v1` 这种 OpenAI 兼容路径，而非中转站首页 URL。
- 用 `npx @openx123/universal-image-skill config` 再跑一次烟测看错误详情。

### PlantUML 渲染超时

- 公共服务（`plantuml.com`）会限速，长时间不可用时可切换到自建实例。
- 检查防火墙 / 代理是否拦截了出站 HTTPS 请求。
- 内置 `lib/http.mjs` 已自带 3 次重试 + 30s 超时，仍然失败说明远端确实有问题。

### Windows 路径报错

- 所有内部路径都用 `path.join` 拼接，正常不应该出现路径分隔符问题。
- 若你手动改了 `OUTPUT_DIR`，避免使用反斜杠转义（用正斜杠或 `\\`）。
- 若仍异常，请带上完整错误堆栈到 Issues 提交。

### `output/` 目录里图片越来越多

本 Skill 不会自动清理 `./output/`，请在你的工作流里自行归档或定期删除。

---

## 开发与贡献

欢迎 Issue 与 PR。本地开发流程：

```bash
git clone https://github.com/openx123/universal-image-skill.git
cd universal-image-skill

# 零运行时依赖，但用 npm install 准备好 .npmrc 等
npm install

# 跑 Node 内置测试
npm test

# 本地链接，方便联调
npm link
universal-image-skill --help

# 改完想看效果，直接 install 到本机 Claude
universal-image-skill install
```

### 项目结构

```
universal-image-skill/
├── bin/                # npx 入口
├── installer/          # install / update / config / paths
├── skill/              # 真正部署到 ~/.claude/skills/ 的内容
│   ├── SKILL.md        # 给 Claude 读的路由说明（项目最关键的文件）
│   ├── scripts/        # 两个引擎的 render-*.mjs
│   └── lib/            # config / http / output 通用工具
├── tests/              # node --test
├── .github/workflows/  # CI + Release
├── package.json
├── README.md
├── LICENSE
└── CHANGELOG.md
```

### 提交规范

- 提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`
- 新引擎或修改 `.env` 字段时同步更新 README 的"配置说明"和 `SKILL.md` 的路由表
- PR 自动跑 CI（Linux / macOS / Windows × Node 20 / 22），全绿后再合并

### 发布流程

维护者：

```bash
# 1. 更新 CHANGELOG.md，bump package.json 版本
npm version patch     # 或 minor / major

# 2. 推 tag 触发自动 release
git push --follow-tags
```

`.github/workflows/release.yml` 会自动 `npm publish` 并创建 GitHub Release。

---

## License

[MIT](./LICENSE) © 2026 OpenX123
