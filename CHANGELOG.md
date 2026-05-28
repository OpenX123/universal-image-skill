# Changelog

本项目变更日志，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.4.1] - 2026-05-28

### 修复：自动改写废弃的 PlantUML 着色语法

plantuml.com 已废弃 `:foo; #FFE0B2` 这种把裸 hex 颜色直接放在 `;` 之后的活动着色写法，现在要求 `:foo;<<#FFE0B2>>`。服务端命中废弃语法时**不会报错中断**，而是在图顶部追加一个警告块，每条废弃用法占一行 `This syntax is deprecated, you must add <<#…>>…`——LLM 在生成多色 step 配色（如 Material 橙色渐变）时反复踩这个坑。

- `render-plantuml.mjs` 新增 `sanitizeDeprecatedColors()`：发请求前扫源码，把 `;<空白>#hex` 末尾结构自动改写成 `;<<#hex>>`，并在 stderr 报告 `[plantuml] auto-fixed N deprecated color directive(s): #FFE0B2, ...`
- 保存到本地的 `.puml` 文件也是修复后的版本，方便用户复用
- SKILL.md 4.1 节加上着色铁律说明，把 sanitizer 标注为兜底安全网
- 新增 3 个测试：废弃语法被改写 / 已正确 `<<#hex>>` 不被双重包裹 / 颜色前置写法 `#FFE0B2:文字;` 不被误伤

partition / 分区着色暂不在 sanitizer 覆盖范围，文档已注明需手写 `partition "名称" <<#FFE0B2>> { … }`。

## [0.4.0] - 2026-05-27

### 破坏性变更：移除 Mermaid 引擎

Mermaid 出图质量偏低，本版本**彻底移除 Mermaid 引擎**，由三引擎收敛为两引擎（PlantUML / AI 生图）。

- 删除 `render-mermaid.mjs` 及其测试、`MERMAID_INK_URL` 配置项、.env / installer 中的 Mermaid 部分
- 之前由 Mermaid 承担的**流程图 / 状态机 / 甘特图**改由 **PlantUML** 渲染
- **思维导图**归 PlantUML（mindmap 语法）
- **用户旅程图 / git 分支图**归 AI 生图（不在 PlantUML 清单内）

### 路由规则（更新后）

- **PlantUML**：流程图、时序图、状态机、类图、甘特图、用例/组件/部署/对象/ER 图、C4、云架构（AWS/Azure/GCP/K8s）、思维导图
- **AI 生图（默认）**：照片、插画、海报、封面、Logo、原型图、示意图、用户旅程图、git 分支图，以及所有模糊「画一张」请求
- **第 0 优先级不变**：用户明示引擎（「用 plantuml / 用 image2 画」）严格按指定，绝不偷换；明示词集合移除 mermaid

### 文档模式：控制配图高度

- 给博客/文章配图时，避免"瘦高"图影响阅读：AI 生图默认走横版 `16:9`（而非 `1:1`），不再默认竖版
- PlantUML 流程图/活动图/状态机/类图在文档模式下主动加 `left to right direction` 压扁高度
- 时序图过长（>12 条消息）时提示用户拆分

### 迁移说明

- 旧 `.env` 中的 `MERMAID_INK_URL` 会被忽略，重新运行 `config` 后该字段不再写入
- 如仍需 Mermaid，请固定使用 0.3.x 版本

## [0.3.5] - 2026-05-24

### 重要：路由策略反转

之前默认走 Mermaid（视觉一般），且用户明示「用 image2 画」时还会被关键词路由偷换成 Mermaid。
现在：

- **第 0 优先级**：用户明示引擎（「用 image2 画」「用 mermaid 画」「用 plantuml 画」）→ 严格按指定，**绝不偷换**
- **第 1 优先级**：用户没指定时，只有「流程图 / 时序图 / 类图 / UML / 状态机 / 用例图 / 架构图 / 甘特图 / 思维导图」等明确**工程图表**才走 Mermaid/PlantUML
- **默认**：其他所有视觉需求（照片、插画、海报、封面、原型、示意图、模糊「画一张」请求）都走 AI 生图
- 不再「反问用户用哪个引擎」，模糊场景直接用 AI 生图（视觉效果好）

### 改进：清晰度

之前 Mermaid/PlantUML 出图都有点糊，现在调清晰度参数为默认行为：

- **Mermaid**：URL 自动带 `?width=1600&scale=2`，PNG 出图 3200 宽，清晰度约 4x
- **PlantUML**：自动在 `@startuml` 后注入 `skinparam dpi 200`，PNG 像素约 2x（默认 dpi 96）
- 用户已在源码自己写过 `skinparam dpi` 时不重复注入
- SVG 输出（`--format svg`）天然矢量清晰，不做这些处理

新增 CLI 参数：

- Mermaid: `--scale 1|2|3` 默认 `2`、`--width <100-4000>` 默认 `1600`
- PlantUML: `--dpi <50-600>` 默认 `200`

### 守则

- 新增守则 #11：**用户明示引擎绝不偷换**（违例时 Claude 必须按用户指定执行，再事后委婉提醒）
- 新增守则 #12：清晰度参数已设合理默认，不要主动调小

## [0.3.4] - 2026-05-24

### 新增

- AI 生图新增 `--ratio` + `--tier` 两个用户友好参数：
  - 支持 6 个比例预设：`1:1` / `16:9` / `9:16` / `4:3` / `3:4` / `2:3`
  - 三档分辨率：`1k`（草图/测速）/ `2k`（主流推荐，默认）/ `4k`（画册/壁纸）
  - 用户不再需要记忆像素，Claude 也不会再因「不知道哪个尺寸合适」而走偏
- AI 生图新增 `--quality low|medium|high`，对应 gpt-image 的官方质量档位（影响速度与价格）
- AI 生图新增 `--background transparent|opaque|auto`，可生成透明背景 logo（需配合 png/webp）
- AI 生图 `--format` 扩展支持 `webp`（之前仅 png/jpg）

### 改进

- **修正 v0.3.2 的错误描述**：gpt-image-2 实际支持远多于 3 档的尺寸（最高 3840 边、需 16 倍数），SKILL.md 之前错误声称「只支持 3 个 preset」
- `--size` 现在接受任意符合服务端约束的 `WxH`（宽高都是 16 倍数、单边 ≤3840、≥16），优先级高于 `--ratio`
- 守则 #9 反例更新为新参数命名（避免悄悄从 `--ratio 9:16` 降级到 `--ratio 1:1`、从 `--tier 4k` 降级到 `--tier 2k`）

## [0.3.3] - 2026-05-24

### 新增

- **文档模式**：Mermaid / PlantUML 新增 `--source-dir` 参数，让源码（.mmd / .puml）可以与图片分目录存放。常见用法 `--output-dir images --source-dir images/code`，图片直接放进博客/文档项目，源码归档到子目录。AI 生图无源码不受影响
- SKILL.md 新增 4.6 节「文档模式」：列出触发条件（cwd 下有 `README.md` / `docs/` / `_posts/` 等、用户编辑 `.md` 文件、用户明示「插到文档」等），并给出完整调用示例和 Markdown 回复模板

### 改进

- `saveSource()` 现在会自动 `mkdir` 源码目录（之前假设与图片同目录无需建），支持源码独立路径

## [0.3.2] - 2026-05-24

### 改进

- **SKILL.md 增加尺寸选择表**：明确手机/原型/竖版用 `1024x1536`、横幅/壁纸用 `1536x1024`、默认 `1024x1024`，避免 Claude 因为不清楚比例选错
- **SKILL.md 强化重试规则**：明文要求 Claude 遇到 `*_NETWORK` / `*_TIMEOUT` / 5xx 时**原样重试 1 次**，禁止悄悄降级 `--size` / `--prompt` / source 主体（前者会导致原型图比例错乱、后者改变用户原意）
- 错误处理表为每个 error.code 标注「是否重试 / 怎么重试」，新增 `PLANTUML_NETWORK` / `PLANTUML_TIMEOUT` / `IMAGE_NETWORK` 三行
- 操作守则新增第 9、10 条，要求 Claude 在第一次网络失败时主动告知用户「正在自动重试一次」

## [0.3.1] - 2026-05-24

### 修复

- `config` 命令烟测超时时间过短：AI 生图 15s → 180s（gpt-image 实测 30-90s），PlantUML 8s → 45s（公共服务有时偏慢），Mermaid 8s → 20s
- `config` 烟测在 AI 生图开始前提示「通常 30-90 秒，请耐心等待」，并在每项结果后显示实际耗时
- 备份目录位置从 `~/.claude/skills/universal-image.bak-*` 改到 `~/.claude/universal-image-backups/`，避免 Claude Code 误把备份目录加载为「幽灵 Skill」
- `install` 命令首次运行时自动迁移历史遗留备份到新位置
- 防止 `skill/.env` 被打包到 npm tarball（`.npmignore` 增加 `**/.env` 深度通配）
- 修正 `package.json` 字段格式：`bin` 路径去掉 `./` 前缀、`repository.url` 加 `git+` 与 `.git`，消除 npm publish 警告
- CI 工作流移除 `cache: npm`（零依赖项目无 lockfile，缓存设置必失败），并修正 `node --test tests/` 在 Node 22 下只匹配 1 个测试的问题

## [0.3.0] - 2026-05-24

### 新增

- Mermaid 渲染引擎（基于 `mermaid.ink`），支持流程图、时序图、状态机、类图、甘特图、思维导图等
- PlantUML 渲染引擎（基于 `plantuml.com`），内置 C4-PlantUML / AWS / Azure 图标库 `!include` 速查表
- AI 生图引擎，兼容 OpenAI 协议，默认模型 `gpt-image-2`，可对接任意中转站
- CLI 命令：`install` / `config` / `update` / `uninstall` / `version` / `--help`
- 跨平台路径解析，兼容 Windows / macOS / Linux 下的 `~/.claude/skills/` 目录
- 备份式更新机制：旧目录改名为 `universal-image.bak-<旧版本>`，自动保护用户 `.env`
- 基于 Node `node --test` 的内置测试套件，零运行时依赖
- GitHub Actions：PR / push 触发 CI，tag 触发 npm publish 与 GitHub Release

### 已知问题

- `update` 命令本身不会就地升级已全局安装的 npm 包，需手动 `npm install -g @openx123/universal-image-skill@latest` 后再次执行 `install`
- Mermaid / PlantUML 源码会上传至各自公共服务，敏感场景请通过 `MERMAID_INK_URL` / `PLANTUML_SERVER_URL` 切换到自建实例

[Unreleased]: https://github.com/openx123/universal-image-skill/compare/v0.3.5...HEAD
[0.3.5]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.5
[0.3.4]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.4
[0.3.3]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.3
[0.3.2]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.2
[0.3.1]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.1
[0.3.0]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.0
