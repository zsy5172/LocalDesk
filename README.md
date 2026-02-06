<div align="center">

# ValeDesk

**Versatile Almost Local, Eventually Reasonable Assistant**

[![Version](https://img.shields.io/github/v/tag/followcat/ValeDesk?sort=semver)](https://github.com/followcat/ValeDesk/releases)
[![Platform](https://img.shields.io/badge/platform-%20Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/followcat/ValeDesk)
[![License](https://img.shields.io/badge/license-Community-blue.svg)](LICENSE)

**支持本地模型的桌面 AI 助手**

[English](README_en.md) | [中文](README.md)

</div>

---


https://github.com/user-attachments/assets/a8c54ce0-2fe0-40c3-8018-026cab9d7483


## ✨ 功能特性

### 核心能力
- ✅ **并行执行** — 同时运行多个模型（共识模式或并行任务）
- ✅ **灵活的供应商管理** — 并排管理多个 API 供应商（OpenAI, OpenRouter, Z.AI, 本地模型）
- ✅ **任务规划** — 可视化的待办事项面板，带进度跟踪，按会话持久化
- ✅ **计划任务** — 创建提醒和定期任务，支持自动执行
- ✅ **OpenAI SDK** — 完整的 API 控制，兼容任何 OpenAI 兼容的端点
- ✅ **本地模型** — 支持 vLLM, Ollama, LM Studio
- ✅ **代码沙箱** — 支持 JavaScript (Node.js vm) 和 Python (系统子进程) 执行
- ✅ **文档支持** — PDF 和 DOCX 文本提取（内置功能，开箱即用）
- ✅ **网页能力** — 集成 Tavily / Z.AI 搜索，支持 `fetch_*` 直连抓取与浏览器自动化
- ✅ **会话治理** — Charter（目标/约束/DoD）与 ADR（决策记录）双系统
- ✅ **合规闸门** — 工具执行前执行 Charter 合规检查（软告警 / 硬阻断）
- ✅ **会话启动校验** — 自动校验 Charter 与 ADR 链完整性（含循环/引用检查）
- ✅ **安全性** — 目录沙箱机制，确保文件操作安全
- ✅ **跨平台** — Windows, macOS, Linux，支持正确的 shell 命令

### UI/UX 特性
- ✅ **现代界面** — React + Tauri，流畅的自动滚动和流式传输
- ✅ **界面主题** — Interface 选项卡支持 `light / dark / auto`，自动模式按本地时间切换
- ✅ **文件差异与回滚** — 内置文件变更的可视化差异查看器，支持一键回滚
- ✅ **变更预览审批** — 文件写入/编辑支持预览面板（approve/edit/skip）
- ✅ **消息编辑** — 编辑并重新发送消息，支持历史记录截断
- ✅ **会话持久化** — 会话在应用重启后保留（基于 SQLite）
- ✅ **会话管理** — 置顶、搜索、克隆会话，支持 CharterPanel / ADRPanel 可视化
- ✅ **键盘快捷键** — Cmd+Enter/Ctrl+Enter 发送消息
- ✅ **拼写检查** — 内置拼写检查，支持上下文菜单建议
- ✅ **权限系统** — 工具执行的询问/默认模式控制

### 高级功能
- ✅ **技能系统** — 通过[技能市场](https://vakovalskii.github.io/ValeDesk-Skills/)扩展能力
- ✅ **记忆系统** — 在 `~/.valera/memory.md` 中持久存储用户偏好
- ✅ **Token 追踪** — 显示输入/输出 Token 数量和 API 耗时
- ✅ **优化的流式传输** — 基于 requestAnimationFrame 的 UI 更新（60fps）
- ✅ **停止生成** — 随时中断 LLM 响应
- ✅ **循环检测** — 自动检测死循环工具调用（连续 5 次以上相同的工具调用）
- ✅ **请求超时** — LLM 请求 5 分钟超时并自动重试
- ✅ **会话日志** — 在 `~/.valera/logs/sessions/` 中记录完整的请求/响应 JSON 日志

## 🤔 为什么选择 ValeDesk？

### 开放架构与完全控制
ValeDesk 不仅仅是另一个 AI 助手 — **它是一个你拥有的框架**。基于 TypeScript 和 Tauri 构建，每个组件都是透明且可修改的：

- **可读的代码库** — 结构良好、文档齐全的代码，易于理解
- **易于定制** — 添加新工具、修改提示词、更改 UI，没有黑盒
- **你的规则** — 调整行为、安全限制和工作流以匹配你的需求
- **无供应商锁定** — 适用于任何 OpenAI 兼容的 API (vLLM, Ollama, LM Studio)

### 100% 本地与隐私
一切都在**你的机器上**运行：

- **本地推理** — 使用 Ollama, vLLM 或 LM Studio 获得完全隐私
- **无数据收集** — 你的对话永远不会离开你的电脑
- **离线可用** — 无需互联网即可工作（网络搜索工具除外）
- **沙箱执行** — 安全的 JavaScript 沙箱和文件操作限制

### 实验与迭代
非常适合开发者、研究人员和 AI 爱好者：

- **测试本地模型** — 比较 Qwen, Llama, DeepSeek 等模型
- **调试 API 调用** — 每次交互都有完整的请求/响应日志
- **原型工具** — 几分钟内添加自定义函数
- **监控性能** — 追踪 Token、时间和资源使用情况

### 实际用例
```bash
# 本地运行 Ollama（免费，100% 隐私）
ollama serve
# 配置 ValeDesk: http://localhost:11434/v1

# 或者使用 vLLM 进行更快的推理
vllm serve Qwen/Qwen2.5-14B-Instruct --port 8000
# 配置 ValeDesk: http://localhost:8000/v1
```

**简而言之：** ValeDesk 让你拥有 **ChatGPT/Claude 的能力**，同时享受 **开源的自由** 和 **本地执行的隐私**。

## 🚀 快速开始

### 先决条件

- **Rust** 1.74+ ([安装](https://rustup.rs/))
- **Node.js** 20+ 
- **Python 3** (用于 `execute_python` 工具)

### 开发（跨平台）

```bash
# 克隆并进入目录
git clone https://github.com/followcat/ValeDesk.git
cd ValeDesk

# 安装依赖
npm install

# 运行开发模式（推荐）
npm run dev

# 或者使用 Makefile（macOS/Linux）
make dev
```

### 测试

```bash
npm run test
```

### 构建应用包

```bash
# 自动检查依赖并构建应用包
make bundle

# 产物位于 src-tauri/target/release/bundle/
```

### 手动构建步骤

```bash
# 1. 构建前端
npm run build

# 2. 构建 sidecar（Unix）
./scripts/build_sidecar.sh

# 3. 构建 Tauri 应用
cd src-tauri && cargo tauri build
```

### 发布平台

当前 Release workflow 默认构建以下平台：
- `macos-arm64`
- `linux-x64`
- `windows-x64`

### 配置

1. 点击应用中的 **设置** (⚙️)
2. 配置你的 API：
   - **API Key** — 你的密钥（如果是本地模型则为 `dummy-key`）
   - **Base URL** — API 端点（必须包含 `/v1`）
   - **Model Name** — 模型标识符
   - **Temperature** — 0.0-2.0 (默认: 0.3)
   - **Interface Theme** — `light / dark / auto`
   - **Preview Mode** — `always / ask / never`
   - **Language** — `auto / English / 简体中文`
3. 点击 **保存设置**

### 配置示例

**本地 vLLM:**
```json
{
  "apiKey": "dummy-key",
  "baseUrl": "http://localhost:8000/v1",
  "model": "qwen3-30b-a3b-instruct-2507"
}
```

**OpenAI:**
```json
{
  "apiKey": "sk-...",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4"
}
```

## 🎯 技能市场

浏览并安装 ValeDesk 的验证技能：**[技能市场](https://vakovalskii.github.io/ValeDesk-Skills/)**

<img width="974" height="1123" alt="image" src="https://github.com/user-attachments/assets/8c7fa387-599d-48ab-999a-d5b9c5f811f7" />


## 🛠️ 可用工具

所有工具遵循 `snake_case` 命名约定（`动词_名词` 模式）：

### 文件与工作区
| 工具 | 描述 |
|------|-------------|
| `run_command` | 执行 Shell 命令 (PowerShell/bash) |
| `read_file` | 读取文本文件内容 |
| `write_file` | 创建新文件 |
| `edit_file` | 修改文件（查找并替换） |
| `search_files` | 通过 glob 模式查找文件 (`*.pdf`, `src/**/*.ts`) |
| `search_text` | 在文件中搜索文本内容 (grep) |
| `read_document` | 提取 PDF/DOCX 文本（最大 10MB） |
| `attach_image` | 附加本地图片供多模态模型分析 |

### 代码执行
| 工具 | 描述 |
|------|-------------|
| `execute_js` | 在安全的 Node.js vm 沙箱中运行 JavaScript |
| `execute_python` | 运行 Python 代码（系统 Python，支持 pip 包） |

### 搜索与网页读取
| 工具 | 描述 |
|------|-------------|
| `search_web` | 搜索互联网 (Tavily/Z.AI) |
| `extract_page` | 提取完整页面内容 (仅 Tavily) |
| `read_page` | 读取网页内容 (Z.AI Reader) |
| `search` | DuckDuckGo 通用搜索 |
| `search_news` | DuckDuckGo 新闻搜索 |
| `search_images` | DuckDuckGo 图片搜索 |
| `fetch_html` | 直接抓取网页/URL 文本内容 |
| `fetch_json` | 请求并解析 JSON API |
| `download_file` | 下载远程文件到工作区 |

> `render_page` 已随 Electron 依赖移除；动态页面请使用下方 `browser_*` 工具。

### 浏览器自动化（Playwright）
| 工具 | 描述 |
|------|-------------|
| `browser_navigate` | 打开页面（浏览器自动化入口） |
| `browser_click` | 点击页面元素 |
| `browser_type` | 输入文本 |
| `browser_select` | 选择下拉项 |
| `browser_hover` | 悬停元素 |
| `browser_scroll` | 滚动页面 |
| `browser_press_key` | 键盘操作 |
| `browser_wait_for` | 等待元素/超时 |
| `browser_snapshot` | 获取可访问性快照 |
| `browser_screenshot` | 截图到工作区 |
| `browser_execute_script` | 在页面执行脚本 |

### Git 工具
| 工具 | 描述 |
|------|-------------|
| `git_status` | 查看仓库状态 |
| `git_log` | 查看提交历史 |
| `git_diff` | 查看文件差异 |
| `git_branch` | 分支查看/管理 |
| `git_checkout` | 切换分支或提交 |
| `git_add` | 暂存文件 |
| `git_commit` | 创建提交 |
| `git_push` | 推送远程 |
| `git_pull` | 拉取远程 |
| `git_reset` | 重置状态 |
| `git_show` | 查看对象详情 |

### 任务管理

![photo_2026-01-19_00-55-13](https://github.com/user-attachments/assets/5d7c2122-9023-4e8a-be0d-e63b666cea7b)


| 工具 | 描述 |
|------|-------------|
| `manage_todos` | 创建/更新任务计划，带可视化进度跟踪 |
| `schedule_task` | 创建、列出、更新、删除计划任务 |

### 会话治理（新增）
| 工具 | 描述 |
|------|-------------|
| `manage_charter` | 管理会话 Charter（Goal / Non-Goals / DoD / Constraints / Invariants） |
| `manage_adr` | 管理 ADR 决策记录（create/list/get/update_status） |

文档：[`docs/charter-system.md`](docs/charter-system.md) / [`docs/adr-guide.md`](docs/adr-guide.md)

特性：
- **自动 ADR** — Charter 变更自动生成 `charter-change` ADR
- **合规检查** — 执行工具前先做合规闸门（硬约束可阻断）
- **一次性提醒** — "30分钟后提醒我"
- **重复任务** — 每分钟、每小时、每天、每周、每月
- **自动执行** — 带有提示词的任务会自动开始新的聊天会话
- **原生通知** — 系统通知（macOS / Windows / Linux）
- **默认模型** — 设置计划任务的首选模型

### 记忆与技能
| 工具 | 描述 |
|------|-------------|
| `manage_memory` | 存储/读取持久化用户偏好 |
| `load_skill` | 读取技能指令与技能文件资源 |

### 多模态
| 工具 | 描述 |
|------|-------------|
| `transcribe_audio` | 音频转写（Whisper，最大 25MB） |
| `generate_image` | 图像生成/编辑（DALL-E） |

> **安全性：** 所有文件操作都沙箱化限制在工作区文件夹内。

## 📦 构建

### 推荐方式
```bash
# 自动检查依赖并完成前端/sidecar/Tauri 打包
make bundle
```

### 手动方式（Unix）
```bash
# 1) 构建前端
npm run build

# 2) 构建 sidecar
./scripts/build_sidecar.sh

# 3) 构建 Tauri
cd src-tauri && cargo tauri build
```

### 手动方式（Windows PowerShell）
```powershell
# 1) 构建前端
npm run build

# 2) 构建 sidecar
./scripts/build_sidecar.ps1

# 3) 构建 Tauri
cd src-tauri
cargo tauri build
```

## 🔐 数据存储

### 应用数据
- **Windows:** `C:\Users\YourName\AppData\Roaming\ValeDesk\`
- **macOS:** `~/Library/Application Support/ValeDesk/`
- **Linux:** `~/.config/ValeDesk/`

文件：
- `sessions.db` — SQLite 数据库，包含聊天记录、待办事项、计划任务和设置
- `api-settings.json` — API 配置
- `skills-settings.json` — 技能市场配置
- `llm-providers-settings.json` — LLM 供应商配置

### 全局数据
- `~/.valera/memory.md` — 持久化记忆存储
- `~/.valera/logs/sessions/{session-id}/` — 每个会话的 API 日志：
  - `turn-001-request.json` — 完整请求（模型、消息、工具、温度）
  - `turn-001-response.json` — 完整响应（使用情况、内容、工具调用）

## 🛠️ 贡献

查看 [CURSOR.md](CURSOR.md) 了解开发指南和项目架构。

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=followcat/ValeDesk&type=Date)](https://star-history.com/#followcat/ValeDesk&Date)

## 📄 许可证

**ValeDesk 社区许可证** — 个人和年收入低于 100 万美元的公司免费使用。大型组织需要商业许可证。

查看 [LICENSE](LICENSE) 了解完整条款。

---
