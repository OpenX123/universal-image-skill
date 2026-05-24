# Changelog

本项目变更日志，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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

[Unreleased]: https://github.com/openx123/universal-image-skill/compare/v0.3.3...HEAD
[0.3.3]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.3
[0.3.2]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.2
[0.3.1]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.1
[0.3.0]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.0
