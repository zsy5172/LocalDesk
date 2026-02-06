<div align="center">

# ValeDesk

**Versatile Almost Local, Eventually Reasonable Assistant**

[![Version](https://img.shields.io/github/v/tag/followcat/ValeDesk?sort=semver)](https://github.com/followcat/ValeDesk/releases)
[![Platform](https://img.shields.io/badge/platform-%20Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/followcat/ValeDesk)
[![License](https://img.shields.io/badge/license-Community-blue.svg)](LICENSE)

**Desktop AI Assistant with Local Model Support**

[English](README_en.md) | [中文](README.md)

</div>

---


https://github.com/user-attachments/assets/a8c54ce0-2fe0-40c3-8018-026cab9d7483


## ✨ Features

### Core Capabilities
- ✅ **Parallel Execution** — Run multiple models simultaneously (Consensus Mode or Parallel Tasks)
- ✅ **Flexible Providers** — Manage multiple API providers (OpenAI, OpenRouter, Z.AI, Local) side-by-side
- ✅ **Task Planning** — Visual todo panel with progress tracking, persisted per session
- ✅ **Scheduled Tasks** — Create reminders and recurring tasks with auto-execution
- ✅ **OpenAI SDK** — Full API control, compatible with any OpenAI-compatible endpoint
- ✅ **Local Models** — vLLM, Ollama, LM Studio support
- ✅ **Code Sandboxes** — JavaScript (Node.js vm) and Python (system subprocess) execution
- ✅ **Document Support** — PDF and DOCX text extraction (bundled, works out of the box)
- ✅ **Web Capabilities** — Tavily / Z.AI search, direct `fetch_*` retrieval, and browser automation
- ✅ **Session Governance** — Charter (scope) + ADR (decision records)
- ✅ **Compliance Gate** — Charter-aware tool checks before execution (soft warnings / hard blocks)
- ✅ **Session Startup Validation** — Automatic Charter/ADR integrity checks (refs + cycle checks)
- ✅ **Security** — Directory sandboxing for safe file operations
- ✅ **Cross-platform** — Windows, macOS, Linux with proper shell commands

### UI/UX Features
- ✅ **Modern Interface** — React + Tauri with smooth auto-scroll and streaming
- ✅ **Interface Theme Tab** — `light / dark / auto` theme mode, with time-based auto switching
- ✅ **File Diff & Rollback** — Built-in visual diff viewer for file changes with one-click rollback
- ✅ **Preview Approval Flow** — Review file writes/edits before execution (approve/edit/skip)
- ✅ **Message Editing** — Edit and resend messages with history truncation
- ✅ **Session Persistence** — Sessions survive app restart (SQLite backed)
- ✅ **Session Management** — Pin, search, clone sessions, plus CharterPanel / ADRPanel
- ✅ **Keyboard Shortcuts** — Cmd+Enter/Ctrl+Enter to send messages
- ✅ **Spell Check** — Built-in spell checking with context menu suggestions
- ✅ **Permission System** — Ask/default modes for tool execution control

### Advanced Features
- ✅ **Skills System** — Extensible capabilities via a [Skills Marketplace](https://vakovalskii.github.io/ValeDesk-Skills/)
- ✅ **Memory System** — Persistent storage of user preferences in `~/.valera/memory.md`
- ✅ **Token Tracking** — Display input/output tokens and API duration
- ✅ **Optimized Streaming** — requestAnimationFrame-based UI updates (60fps)
- ✅ **Stop Streaming** — Interrupt LLM responses at any time
- ✅ **Loop Detection** — Automatic detection of stuck tool call loops (5+ sequential same-tool calls)
- ✅ **Request Timeouts** — 5-minute timeout with auto-retry for LLM requests
- ✅ **Session Logging** — Full request/response JSON logs per iteration in `~/.valera/logs/sessions/`

## 🤔 Why ValeDesk?

### Open Architecture & Full Control
ValeDesk isn't just another AI assistant — **it's a framework you own**. Built with TypeScript and Tauri, every component is transparent and modifiable:

- **Readable codebase** — Well-structured, documented code you can understand
- **Easy customization** — Add new tools, modify prompts, change UI without black boxes
- **Your rules** — Adjust behavior, safety limits, and workflows to match your needs
- **No vendor lock-in** — Works with any OpenAI-compatible API (vLLM, Ollama, LM Studio)

### 100% Local & Private
Everything runs **on your machine**:

- **Local inference** — Use Ollama, vLLM, or LM Studio for complete privacy
- **No data collection** — Your conversations never leave your computer
- **Offline capable** — Works without internet (except web search tools)
- **Sandboxed execution** — Secure JavaScript sandbox and file operation restrictions

### Experiment & Iterate
Perfect for developers, researchers, and AI enthusiasts:

- **Test local models** — Compare Qwen, Llama, DeepSeek, and others
- **Debug API calls** — Full request/response logs for every interaction
- **Prototype tools** — Add custom functions in minutes
- **Monitor performance** — Track tokens, timing, and resource usage

### Real Use Cases
```bash
# Run Ollama locally (free, 100% private)
ollama serve
# Configure ValeDesk: http://localhost:11434/v1

# Or use vLLM for faster inference
vllm serve Qwen/Qwen2.5-14B-Instruct --port 8000
# Configure ValeDesk: http://localhost:8000/v1
```

**TL;DR:** ValeDesk gives you the **power of ChatGPT/Claude** with the **freedom of open source** and **privacy of local execution**.

## 🚀 Quick Start

### Prerequisites

- **Rust** 1.74+ ([install](https://rustup.rs/))
- **Node.js** 20+ 
- **Python 3** (for `execute_python` tool)

### Development (Cross-platform)

```bash
# Clone and enter
git clone https://github.com/followcat/ValeDesk.git
cd ValeDesk

# Install dependencies
npm install

# Run in development mode (recommended)
npm run dev

# Or use Makefile (macOS/Linux)
make dev
```

### Tests

```bash
npm run test
```

### Build App Bundles

```bash
# Auto-check deps and build app bundles
make bundle

# Artifacts: src-tauri/target/release/bundle/
```

### Manual Build Steps

```bash
# 1. Build frontend
npm run build

# 2. Build sidecar (Unix)
./scripts/build_sidecar.sh

# 3. Build Tauri app
cd src-tauri && cargo tauri build
```

### Release Targets

The current Release workflow builds:
- `macos-arm64`
- `linux-x64`
- `windows-x64`

### Configuration

1. Click **Settings** (⚙️) in the app
2. Configure your API:
   - **API Key** — Your key (or `dummy-key` for local models)
   - **Base URL** — API endpoint (must include `/v1`)
   - **Model Name** — Model identifier
   - **Temperature** — 0.0-2.0 (default: 0.3)
   - **Interface Theme** — `light / dark / auto`
   - **Preview Mode** — `always / ask / never`
   - **Language** — `auto / English / 简体中文`
3. Click **Save Settings**

### Example Configurations

**Local vLLM:**
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

## 🎯 Skills Marketplace

Browse and install verified skills for ValeDesk: **[Skills Marketplace](https://vakovalskii.github.io/ValeDesk-Skills/)**

<img width="974" height="1123" alt="image" src="https://github.com/user-attachments/assets/8c7fa387-599d-48ab-999a-d5b9c5f811f7" />


## 🛠️ Available Tools

All tools follow `snake_case` naming convention (`verb_noun` pattern):

### File & Workspace
| Tool | Description |
|------|-------------|
| `run_command` | Execute shell commands (PowerShell/bash) |
| `read_file` | Read text file contents |
| `write_file` | Create new files |
| `edit_file` | Modify files (search & replace) |
| `search_files` | Find files by glob pattern (`*.pdf`, `src/**/*.ts`) |
| `search_text` | Search text content in files (grep) |
| `read_document` | Extract text from PDF/DOCX (max 10MB) |
| `attach_image` | Attach local images for multimodal models |

### Code Execution
| Tool | Description |
|------|-------------|
| `execute_js` | Run JavaScript in secure Node.js vm sandbox |
| `execute_python` | Run Python code (system Python with pip packages) |

### Search & Web Retrieval
| Tool | Description |
|------|-------------|
| `search_web` | Search the internet (Tavily/Z.AI) |
| `extract_page` | Extract full page content (Tavily only) |
| `read_page` | Read web page content (Z.AI Reader) |
| `search` | DuckDuckGo general search |
| `search_news` | DuckDuckGo news search |
| `search_images` | DuckDuckGo image search |
| `fetch_html` | Fetch readable page content from URLs |
| `fetch_json` | Fetch and parse JSON APIs |
| `download_file` | Download remote files into workspace |

> `render_page` was removed with Electron-only dependencies; use `browser_*` tools for dynamic pages.

### Browser Automation (Playwright)
| Tool | Description |
|------|-------------|
| `browser_navigate` | Open a page (automation entry point) |
| `browser_click` | Click an element |
| `browser_type` | Type text |
| `browser_select` | Select dropdown values |
| `browser_hover` | Hover an element |
| `browser_scroll` | Scroll page |
| `browser_press_key` | Keyboard interactions |
| `browser_wait_for` | Wait for element/timeout |
| `browser_snapshot` | Accessibility snapshot |
| `browser_screenshot` | Save page screenshot to workspace |
| `browser_execute_script` | Execute script in page context |

### Git Tools
| Tool | Description |
|------|-------------|
| `git_status` | Repository status |
| `git_log` | Commit history |
| `git_diff` | File diffs |
| `git_branch` | Branch listing/management |
| `git_checkout` | Switch branch or commit |
| `git_add` | Stage files |
| `git_commit` | Create commit |
| `git_push` | Push to remote |
| `git_pull` | Pull from remote |
| `git_reset` | Reset repository state |
| `git_show` | Show object details |

### Task Management

![photo_2026-01-19_00-55-13](https://github.com/user-attachments/assets/5d7c2122-9023-4e8a-be0d-e63b666cea7b)


| Tool | Description |
|------|-------------|
| `manage_todos` | Create/update task plans with visual progress tracking |
| `schedule_task` | Create, list, update, delete scheduled tasks |

### Session Governance (New)
| Tool | Description |
|------|-------------|
| `manage_charter` | Manage session Charter (Goal / Non-Goals / DoD / Constraints / Invariants) |
| `manage_adr` | Manage ADR decision records (create/list/get/update_status) |

Docs: [`docs/charter-system.md`](docs/charter-system.md) / [`docs/adr-guide.md`](docs/adr-guide.md)

Features:
- **Auto ADR generation** — Charter updates create `charter-change` ADR entries
- **Compliance checks** — Charter-aware gate runs before tool execution
- **One-time reminders** — "remind me in 30 minutes"
- **Recurring tasks** — every minute, hour, day, week, month
- **Auto-execution** — tasks with prompts automatically start new chat sessions
- **Native notifications** — system notifications (macOS / Windows / Linux)
- **Default model** — set preferred model for scheduled tasks

### Memory & Skills
| Tool | Description |
|------|-------------|
| `manage_memory` | Store/read persistent user preferences |
| `load_skill` | Load skill instructions and skill resources |

### Multimodal
| Tool | Description |
|------|-------------|
| `transcribe_audio` | Audio transcription (Whisper, up to 25MB) |
| `generate_image` | Image generation/editing (DALL-E) |

> **Security:** All file operations are sandboxed to the workspace folder only.

## 📦 Building

### Recommended
```bash
# Auto-check deps and build frontend/sidecar/Tauri bundle
make bundle
```

### Manual (Unix)
```bash
# 1) Build frontend
npm run build

# 2) Build sidecar
./scripts/build_sidecar.sh

# 3) Build Tauri app
cd src-tauri && cargo tauri build
```

### Manual (Windows PowerShell)
```powershell
# 1) Build frontend
npm run build

# 2) Build sidecar
./scripts/build_sidecar.ps1

# 3) Build Tauri app
cd src-tauri
cargo tauri build
```

## 🔐 Data Storage

### Application Data
- **Windows:** `C:\Users\YourName\AppData\Roaming\ValeDesk\`
- **macOS:** `~/Library/Application Support/ValeDesk/`
- **Linux:** `~/.config/ValeDesk/`

Files:
- `sessions.db` — SQLite database with chat history, todos, scheduled tasks, and settings
- `api-settings.json` — API configuration
- `skills-settings.json` — Skills marketplace configuration
- `llm-providers-settings.json` — LLM providers configuration

### Global Data
- `~/.valera/memory.md` — persistent memory storage
- `~/.valera/logs/sessions/{session-id}/` — per-session API logs:
  - `turn-001-request.json` — full request (model, messages, tools, temperature)
  - `turn-001-response.json` — full response (usage, content, tool_calls)

## 🛠️ Contributing

See [CURSOR.md](CURSOR.md) for development guidelines and project architecture.

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=followcat/ValeDesk&type=Date)](https://star-history.com/#followcat/ValeDesk&Date)

## 📄 License

**ValeDesk Community License** — free for individuals and companies with revenue under $1M/year. Commercial license required for larger organizations.

See [LICENSE](LICENSE) for full terms.

---

<div align="center">

**Made with ❤️ by [Valerii Kovalskii](https://github.com/vakovalskii)**

</div>
