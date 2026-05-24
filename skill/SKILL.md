---
name: universal-image
description: 万能生图 Skill。根据用户意图自动选用 Mermaid / PlantUML / AI 生图三种引擎之一生成图片，保存到本地并以 Markdown 形式呈现。触发词：生成流程图、画时序图、画状态图、画类图、画甘特图、画思维导图、UML 图、用例图、组件图、部署图、ER 图、画云架构、画 AWS 架构、画 Azure 架构、画 C4 架构、生成海报、生成卡片、生成插图、AI 画图、生成示意图、做张图、画一张、render diagram、draw architecture。
---

# 万能生图 Skill

本 Skill 提供三个渲染脚本，按用户意图选用其一即可生成图片。脚本位于
`~/.claude/skills/universal-image/scripts/`（Windows 为 `%USERPROFILE%\.claude\skills\universal-image\scripts\`）。

---

## 1. 何时触发本 Skill

用户消息包含以下意图之一时启用：

- 画图相关动词：画一张 / 做张图 / 生成 / 渲染 / draw / render / generate
- 图类型名词：流程图、时序图、状态图、类图、甘特图、思维导图、用例图、组件图、部署图、ER 图、架构图、海报、卡片、插图、示意图、封面
- 显式指明引擎：用 mermaid、用 plantuml、用 AI 画
- 上下文中已有源码（mermaid / plantuml 代码块）需要渲染成图

---

## 2. 路由决策表（关键）

按下表匹配，优先级从上到下，命中即停。

| 用户意图关键词                                                                         | 引擎          | 脚本                       |
| -------------------------------------------------------------------------------------- | ------------- | -------------------------- |
| 流程图、时序图、状态机、状态图、类图、甘特图、思维导图、用户旅程图、git 分支图         | **Mermaid**   | `render-mermaid.mjs`       |
| 用例图、组件图、部署图、ER 图、复杂时序图（含 alt/loop/par）、对象图、活动图、思维导图（带样式） | **PlantUML**  | `render-plantuml.mjs`      |
| 云架构（AWS / Azure / GCP / K8s）、C4 架构（系统/容器/组件/代码）、系统架构图（带图标） | **PlantUML + include** | `render-plantuml.mjs` |
| 真实照片、写实、插画、艺术、油画、赛博朋克、产品概念图、海报、营销素材、封面、Logo、IP 形象 | **AI 生图**   | `render-image.mjs`         |
| 模糊：「画个图」「来张图」未指明类型                                                   | **反问用户**  | —                          |

**反例（错误路由，禁止）**：

- 不要用 Mermaid 画 ER 图：Mermaid 的 ER 语法太弱，应用 PlantUML
- 不要用 PlantUML 画海报/营销图：PlantUML 没有写实样式，应用 AI 生图
- 不要用 AI 生图画精确的流程图/UML：不可控、文字会乱、关系会错，应用 Mermaid / PlantUML
- 不要用 Mermaid 画云架构图：缺少官方图标库，应用 PlantUML + AWS/Azure Icons

---

## 3. 调用契约（所有脚本统一）

### CLI 参数

| 参数                  | 适用脚本                          | 含义                                     |
| --------------------- | --------------------------------- | ---------------------------------------- |
| `--input <file>`      | mermaid / plantuml                | 从文件读源码                             |
| `--inline "<src>"`    | mermaid / plantuml                | 内联传源码（短源码用，含特殊字符需转义） |
| `--stdin`             | mermaid / plantuml                | 从标准输入读源码（**推荐**长源码用此方式）|
| `--prompt "<text>"`   | image                             | AI 生图的文字描述（必填）                |
| `--output-dir <dir>`           | 全部                              | 图片输出目录，默认 `./output`            |
| `--source-dir <dir>`           | mermaid / plantuml                | 源码（.mmd/.puml）输出目录，默认同 `--output-dir`。文档模式专用 |
| `--format png\|svg`            | mermaid / plantuml                | 输出格式，默认 png                       |
| `--format png\|jpeg\|webp`     | image                             | 输出格式，默认 png                       |
| `--ratio <ratio>`              | image                             | **推荐用这个**，6 个比例预设（见 4.5 节比例表） |
| `--tier 1k\|2k\|4k`            | image                             | 配合 `--ratio` 选档位，默认 `2k`（主流推荐） |
| `--size WxH`                   | image                             | 直接指定像素，宽高须 16 的倍数、单边 ≤3840。优先级高于 `--ratio` |
| `--quality low\|medium\|high`  | image                             | 质量档位，省略由模型默认（通常 medium）  |
| `--background transparent\|opaque\|auto` | image                  | 背景，transparent 仅 png/webp 可用，jpeg 无透明通道 |
| `--filename <name>`            | 全部                              | 自定义文件名（含扩展名）                 |

### 返回值（stdout 最后一行 JSON）

成功：

```json
{
  "ok": true,
  "engine": "mermaid",
  "path": "/abs/path/to/output/img-20260524-103045-mermaid-a3f7.png",
  "sourceCode": "graph TD\n  A-->B",
  "sourcePath": "/abs/path/to/output/img-20260524-103045-mermaid-a3f7.mmd",
  "size": null,
  "durationMs": 1340
}
```

失败：

```json
{
  "ok": false,
  "engine": "mermaid",
  "error": {
    "code": "MERMAID_HTTP_FAILED",
    "message": "Upstream returned 500",
    "httpStatus": 500
  }
}
```

退出码：成功 0，失败 1。stderr 是 debug 日志，**不要解析**。

---

## 4. 调用示例

### 4.1 Mermaid 流程图（推荐 stdin 方式）

用户：「画一张用户注册流程图」

构造 Mermaid 源码后用 Bash 调用：

```bash
echo 'graph TD
  A[访问注册页] --> B{已注册?}
  B -->|是| C[跳转登录]
  B -->|否| D[填写表单]
  D --> E[发送验证码]
  E --> F[完成注册]' | node ~/.claude/skills/universal-image/scripts/render-mermaid.mjs --stdin
```

Windows PowerShell 写法（用 `--inline` 或临时文件更稳）：

```powershell
'graph TD
  A[访问] --> B[注册]' | node "$env:USERPROFILE\.claude\skills\universal-image\scripts\render-mermaid.mjs" --stdin
```

解析返回值中的 `path` 字段后，向用户回复：

```markdown
已生成流程图：

![用户注册流程](./output/img-20260524-103045-mermaid-a3f7.png)

源码已同步保存到 `./output/img-20260524-103045-mermaid-a3f7.mmd`，你可以基于它继续微调。
```

### 4.2 PlantUML 时序图

```bash
cat <<'EOF' | node ~/.claude/skills/universal-image/scripts/render-plantuml.mjs --stdin
@startuml
participant 用户 as U
participant 前端 as F
participant 后端 as B
participant 数据库 as DB
U -> F: 提交表单
F -> B: POST /api/login
B -> DB: 查询用户
DB --> B: 用户数据
B --> F: JWT token
F --> U: 跳转首页
@enduml
EOF
```

### 4.3 PlantUML + C4 架构图（云架构必加 include！）

用户：「画一个微服务的容器图」

```bash
cat <<'EOF' | node ~/.claude/skills/universal-image/scripts/render-plantuml.mjs --stdin
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(user, "用户")
System_Boundary(c1, "电商平台") {
  Container(web, "Web 应用", "Next.js", "用户浏览界面")
  Container(api, "API 网关", "Node.js", "路由与鉴权")
  Container(order, "订单服务", "Go", "下单与履约")
  ContainerDb(db, "数据库", "PostgreSQL", "订单与用户数据")
}
Rel(user, web, "HTTPS")
Rel(web, api, "JSON/HTTPS")
Rel(api, order, "gRPC")
Rel(order, db, "SQL")
@enduml
EOF
```

### 4.4 PlantUML + AWS 架构图

用户：「画一个 AWS 上的 Web 应用部署」

```bash
cat <<'EOF' | node ~/.claude/skills/universal-image/scripts/render-plantuml.mjs --stdin
@startuml
!include https://raw.githubusercontent.com/awslabs/aws-icons-for-plantuml/main/dist/AWSCommon.puml
!include https://raw.githubusercontent.com/awslabs/aws-icons-for-plantuml/main/dist/NetworkingContentDelivery/CloudFront.puml
!include https://raw.githubusercontent.com/awslabs/aws-icons-for-plantuml/main/dist/Compute/EC2.puml
!include https://raw.githubusercontent.com/awslabs/aws-icons-for-plantuml/main/dist/Database/RDS.puml

CloudFront(cdn, "CloudFront", "全球 CDN")
EC2(ec2, "EC2 集群", "应用服务器")
RDS(rds, "RDS PostgreSQL", "主数据库")
cdn --> ec2
ec2 --> rds
@enduml
EOF
```

### 4.5 AI 生图（GPT-Image）

用户：「生成一张赛博朋克风格的城市夜景」

```bash
node ~/.claude/skills/universal-image/scripts/render-image.mjs \
  --prompt "Cyberpunk city at night, neon lights reflecting on wet streets, flying cars, cinematic lighting, ultra detailed, 8k" \
  --ratio 16:9
```

#### 比例 + 档位（强烈优先用 `--ratio`，不要直接拼像素）

按用户意图选比例，按需求精度选档位。**调用后不要因网络失败就降级比例或档位**（参见守则 #9）。

| 比例   | 1K 草图/测速   | **2K 主流（默认）** | 4K 画册/壁纸    | 适用场景                                  |
| ------ | -------------- | ------------------- | --------------- | ----------------------------------------- |
| `1:1`  | 1024×1024      | **2048×2048**       | 2880×2880       | 头像、社交配图、电商主图                  |
| `16:9` | 1024×576       | **2048×1152**       | 3840×2160       | 电脑壁纸、网页 banner、视频封面           |
| `9:16` | 576×1024       | **1152×2048**       | 2160×3840       | 手机壁纸、海报、抖音/小红书竖版封面       |
| `4:3`  | 1024×768       | **2048×1536**       | 3072×2304       | 演示文稿、iPad 适配图                     |
| `3:4`  | 768×1024       | **1536×2048**       | 2304×3072       | 小红书封面、Pinterest 配图                |
| `2:3`  | 1024×1536      | **1360×2048**       | 2336×3520       | 书籍封面、冲印照片、人像写真              |

**档位选择启发**：

- 用户没说精度 / 只是想看看 → 用默认 `2k`
- 用户说「快速试一下」「先看看效果」「批量预览」 → 加 `--tier 1k --quality low`
- 用户说「画册级」「印刷」「壁纸」「高清」「最终交付」 → 加 `--tier 4k --quality high`

**调用样板**：

```bash
# 默认：2K + medium 质量
node ... --prompt "..." --ratio 16:9

# 草图模式：1K + low 质量（快、省钱）
node ... --prompt "..." --ratio 9:16 --tier 1k --quality low

# 画册模式：4K + high 质量（慢、贵、精细）
node ... --prompt "..." --ratio 16:9 --tier 4k --quality high

# 透明 logo（必须 png 或 webp）
node ... --prompt "..." --ratio 1:1 --background transparent --format png

# 非常规比例：直接 --size，注意宽高须 16 倍数、单边 ≤3840
node ... --prompt "..." --size 1920x800
```

#### 回复用户的样式

把英文 prompt 也回显出来，便于用户说「改一下」：

```markdown
已生成图片（prompt: `Cyberpunk city at night...`，2048×1152 / 16:9）：

![赛博朋克城市](./output/img-20260524-103045-image-b8e1.png)
```

---

## 4.6 文档模式（写博客/文档时强烈推荐）

**触发条件**——满足任一即启用：

- 当前 `cwd` 下有 `README.md` / `docs/` / `posts/` / `articles/` / `content/` / `_posts/` 任一个
- 当前 `cwd` 是常见静态站点项目根（含 `hexo.config.yml` / `_config.yml` / `vitepress` / `docusaurus.config.js` / `mkdocs.yml` / `astro.config.*`）
- 用户**正在编辑** `.md` / `.mdx` 文件
- 用户明确说「插入到文档/博客」「写入到 images」「和文档放一起」「保存到当前目录的 images」

**调用方式**——给所有 render 脚本统一加这两个参数：

```bash
--output-dir images --source-dir images/code
```

效果：
- 图片落到 `./images/<filename>.png`
- 源码落到 `./images/code/<filename>.mmd` 或 `.puml`（AI 生图无源码，跳过）

**回复用户的 Markdown 写法**（路径必须是 `images/...` 这种 docs 相对路径，能直接被 Markdown 渲染）：

```markdown
![用户注册流程](images/img-20260524-103045-mermaid-a3f7.png)
```

如果用户需要后续微调，告诉他源码在 `images/code/img-20260524-103045-mermaid-a3f7.mmd`。

**文档模式示例（完整）**：

用户在博客项目下说「画一张登录时序图，插到文档里」：

```bash
cat <<'EOF' | node ~/.claude/skills/universal-image/scripts/render-plantuml.mjs --stdin --output-dir images --source-dir images/code
@startuml
participant User
participant Frontend
participant Backend
User -> Frontend: 登录
Frontend -> Backend: POST /login
Backend --> Frontend: JWT
Frontend --> User: 跳转首页
@enduml
EOF
```

回复用户：

```markdown
已生成时序图，可直接粘到你的 Markdown：

![登录时序图](images/img-20260524-103045-plantuml-b8e1.png)

源码在 `images/code/img-20260524-103045-plantuml-b8e1.puml`，要改的话告诉我。
```

**注意**：AI 生图（`render-image.mjs`）只支持 `--output-dir`，没有源码，所以文档模式下也只传 `--output-dir images`。

---

## 5. PlantUML 增强：include 速查表

**当用户描述任何架构/系统图时，主动加入合适的 include，不要画无图标的纯框框。**

| 场景                                 | 必加的 include 路径                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 软件架构（系统/容器/组件/代码）      | `!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml`（按层级换 C4_Container/Component）        |
| AWS 云架构                           | `!include https://raw.githubusercontent.com/awslabs/aws-icons-for-plantuml/main/dist/AWSCommon.puml` + 具体服务图标的 include             |
| Azure 云架构                         | `!include https://raw.githubusercontent.com/plantuml-stdlib/Azure-PlantUML/master/dist/AzureCommon.puml`                                  |
| GCP 云架构                           | `!include https://raw.githubusercontent.com/davidholsgrove/gcp-icons-for-plantuml/master/dist/GCPCommon.puml`                             |
| Kubernetes 架构                      | `!include https://raw.githubusercontent.com/dcasati/kubernetes-PlantUML/master/dist/kubernetes_Common.puml`                              |
| 通用 IT 图标（数据库/服务器/设备）   | `!include <office/Servers/database_server>` 或 `!include <tupadr3/devicons/nodejs>`（plantuml-stdlib 内置，无需联网）                     |
| 主题美化                             | `!theme cerulean` / `spacelab` / `sketchy-outline` / `bluegray` 等                                                                       |

**提示**：PlantUML 服务端会自动拉取远程 include，无需本地准备。

---

## 6. 错误处理

当返回 `{ "ok": false }` 时，**不要继续呈现图片**，而是按 `error.code` 分类处理。

**首要原则**：`*_NETWORK` / `*_TIMEOUT` / `*_HTTP_FAILED`（5xx）都是**瞬时错误**。
脚本内部已经做过 3 次自动重试，但跨网络长链路偶发失败是常态。**遇到这三类错误时，先原样重试 1 次**（参数完全不动，不要改 prompt、不要改 size、不要改 source），失败两次以上再向用户说明并请示。

| error.code               | 含义                          | 处理动作                                                                                    |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `CONFIG_MISSING`         | .env 缺必填字段               | **不重试**。请用户运行 `npx @openx123/universal-image-skill config` 配置                    |
| `MERMAID_HTTP_FAILED`    | mermaid.ink 服务异常          | 5xx 原样重试 1 次；4xx 检查源码语法。多次失败建议自建并设置 `MERMAID_INK_URL`               |
| `MERMAID_TIMEOUT`        | Mermaid 超时                  | **原样重试 1 次**。再失败考虑简化图表                                                       |
| `MERMAID_NETWORK`        | 网络异常                      | **原样重试 1 次**。再失败请用户检查本机网络/代理                                            |
| `PLANTUML_HTTP_FAILED`   | plantuml.com 服务异常         | 同 Mermaid 同名规则                                                                         |
| `PLANTUML_TIMEOUT`       | PlantUML 超时                 | **原样重试 1 次**                                                                           |
| `PLANTUML_NETWORK`       | 网络异常                      | **原样重试 1 次**                                                                           |
| `IMAGE_HTTP_FAILED`      | 中转站异常                    | 5xx 原样重试 1 次；401/403 不重试，让用户检查 `IMAGE_API_KEY`；429 等 10s 再重试            |
| `IMAGE_TIMEOUT`          | AI 生图超时                   | **原样重试 1 次**（中转站排队是常见原因，不是 prompt 问题）                                 |
| `IMAGE_NETWORK`          | 网络异常                      | **原样重试 1 次**。AI 生图响应大（200KB-2MB），断流概率比小图高                             |
| 其他                     | 未分类错误                    | 不重试，把 `error.message` 原文展示给用户                                                   |

---

## 7. 操作守则（给 Claude 的硬约束）

1. **绝不**在没有跑脚本的情况下虚构图片路径回复用户
2. **绝不**用 markdown 内嵌 base64 数据 URI（图片太大会污染对话），始终用本地文件路径
3. **始终**把生成的 `path` 用相对路径（基于用户的 `cwd`）写到 Markdown 里，便于用户点击查看
4. **始终**把 sourceCode 或 prompt 简要回显给用户，便于他们说「改一下」
5. 用户说「再画一张但是 X 改成 Y」时，从对话上下文取上次的源码，改 X 后再调一次脚本，而不是重头让用户重述
6. 用户说「保存到桌面」「保存到 ./diagrams」时，传 `--output-dir` 参数
7. Windows 用户的路径要用 `%USERPROFILE%` 或绝对路径，不要假设 shell 是 bash
8. 跨平台一律用 `node <script-path>` 显式调用，不依赖 .mjs 的可执行位
9. **绝不**在网络/超时失败后悄悄降级关键参数（`--ratio` / `--tier` / `--size` / `--prompt` 的语义部分 / source 主体），那会改变用户的原始意图。
   正确做法：参数原样重试 1 次；仍失败如实告知用户并请示，让用户决定是「再试一次」还是「换参数」。
   反例：用户要 `--ratio 9:16` 手机原型，网络失败后改成 `--ratio 1:1` → 出来的图比例错了，原型图不可用。
   反例：用户要 `--tier 4k` 壁纸，超时后改成 `--tier 2k` → 分辨率不够，无法当壁纸用。
10. **网络瞬时错误是常态，不是 bug**。`*_NETWORK` / `*_TIMEOUT` / 5xx 出现一次时：
    - 第一反应：**「这通常是中转站排队或网络抖动，正在自动重试一次」**（一句话告知用户）
    - 然后用**完全相同的命令**再调一次脚本
    - 仍失败再展示错误细节并征求用户意见，**不要**第二次就改参数或换引擎
