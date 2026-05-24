# Changelog

本项目变更日志，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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

[Unreleased]: https://github.com/openx123/universal-image-skill/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/openx123/universal-image-skill/releases/tag/v0.3.0
