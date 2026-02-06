# ValeDesk — Полный список возможностей

> Desktop AI Assistant with Local Model Support

---

## 🏗️ Архитектура

| Компонент | Технология | Описание |
|-----------|------------|----------|
| Desktop | **Tauri 2.x (Rust)** | Легковесный (~10MB vs Electron ~150MB) |
| Backend | **Node.js Sidecar** | LLM логика и инструменты, bundled с `pkg` |
| Frontend | **React 19 + Zustand** | Современный UI с Tailwind CSS |
| Database | **SQLite** | Сессии, сообщения, todos, scheduled_tasks |
| IPC | **JSON Events** | Rust ↔ Node ↔ React |

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri App (Rust)                         │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │  main.rs    │───▶│  SQLite DB   │    │   Scheduler   │   │
│  │  (IPC hub)  │    │  sessions.db │    │   Service     │   │
│  └─────────────┘    └──────────────┘    └───────────────┘   │
│         │                                       │           │
│         │ JSON Events                          │ stdin/out  │
│         ▼                                       ▼           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Node.js Sidecar (pkg binary)           │    │
│  │  ┌──────────────┐  ┌───────────┐  ┌─────────────┐   │    │
│  │  │ LLM Runner   │  │  Tools    │  │  Session    │   │    │
│  │  │ (OpenAI SDK) │  │ Executor  │  │  Store      │   │    │
│  │  └──────────────┘  └───────────┘  └─────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ WebView
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    React UI (Vite)                          │
│  ┌───────────────┐  ┌────────────┐  ┌──────────────┐        │
│  │  useAppStore  │  │ Components │  │  Tauri IPC   │        │
│  │  (Zustand)    │  │            │  │  Bridge      │        │
│  └───────────────┘  └────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🤖 LLM & Модели

### Поддерживаемые провайдеры
- ✅ **Локальные**: vLLM, Ollama, LM Studio
- ✅ **Облачные**: OpenAI, OpenRouter, Z.AI, любой OpenAI-compatible API
- ✅ **Кастомные**: любой endpoint с `/v1` API

### Возможности
- OpenAI SDK совместимость
- Настройка temperature (0.0-2.0)
- Streaming с 60fps обновлением UI
- Stop streaming в любой момент
- Token tracking (input/output + duration)
- 5-минутный timeout с auto-retry

---

## 🛠️ Инструменты

### 📁 Файловые операции

| Tool | Описание |
|------|----------|
| `read_file` | Чтение текстовых файлов (до 5MB) |
| `write_file` | Создание новых файлов |
| `edit_file` | Редактирование (search & replace) |
| `search_files` | Поиск по glob (`*.pdf`, `src/**/*.ts`) |
| `search_text` | Grep-like поиск в содержимом |
| `read_document` | PDF/DOCX extraction (до 10MB) |
| `attach_image` | Прикрепление изображений для vision моделей |

### 💻 Выполнение кода

| Tool | Описание |
|------|----------|
| `execute_python` ⭐ | Полный Python 3 + все pip пакеты |
| `execute_js` | Node.js vm sandbox (безопасный) |
| `run_command` | Bash/PowerShell команды |

**Python sandbox возможности:**
- Полная stdlib (json, os, re, datetime, sqlite3...)
- Любые pip пакеты (numpy, pandas, requests, pillow...)
- Файловый I/O в пределах workspace

**JS sandbox ограничения:**
- Нет `require()`, `import`
- Нет `fetch()`, `async/await`
- Нет `setTimeout`, `setInterval`

### 🌐 Web инструменты

| Tool | Описание |
|------|----------|
| `search_web` | Интернет поиск (Tavily/Z.AI) |
| `extract_page` | Полное содержимое страницы (Tavily) |
| `read_page` | Z.AI Reader |
| `search` | Поиск DuckDuckGo (общий) |
| `search_news` | Поиск новостей DuckDuckGo |
| `search_images` | Поиск изображений DuckDuckGo |
| `fetch_html` | Чтение URL/HTML как текста |
| `fetch_json` | Загрузка и парсинг JSON API |
| `download_file` | Скачивание файлов в workspace |

> `render_page` удален вместе с Electron-only зависимостями. Для динамических сайтов используйте `browser_*`.

### 🌍 Browser Automation

| Tool | Описание |
|------|----------|
| `browser_navigate` | Переход по URL |
| `browser_click` | Клик по элементу |
| `browser_type` | Ввод текста |
| `browser_select` | Выбор значения в `<select>` |
| `browser_hover` | Наведение мыши |
| `browser_press_key` | Нажатие клавиш |
| `browser_wait_for` | Ожидание элемента/таймаута |
| `browser_snapshot` | Accessibility snapshot страницы |
| `browser_screenshot` | Скриншот страницы |
| `browser_scroll` | Прокрутка |
| `browser_execute_script` | Выполнение JS в контексте страницы |

Полная автоматизация через Playwright.

### 📝 Git операции

| Tool | Описание |
|------|----------|
| `git_status` | Статус репозитория |
| `git_log` | История коммитов |
| `git_diff` | Изменения файлов |
| `git_add` | Добавление файлов в индекс |
| `git_commit` | Создание коммита |
| `git_push` | Отправка в remote |
| `git_pull` | Получение изменений |
| `git_branch` | Управление ветками |
| `git_checkout` | Переключение веток |
| `git_reset` | Сброс состояния репозитория |
| `git_show` | Просмотр деталей объекта Git |

### 🧠 Память & Задачи

| Tool | Описание |
|------|----------|
| `manage_memory` | Персистентные настройки пользователя |
| `manage_todos` | Визуальный todo-panel с прогрессом |
| `load_skill` | Загрузка специализированных инструкций |

### 🎙️ Мультимодальность

| Tool | Описание |
|------|----------|
| `transcribe_audio` | Транскрибация аудио (Whisper, до 25MB) |
| `generate_image` | Генерация/редактирование изображений (DALL-E) |

### 📋 Charter & ADR (Session Themed Workspace)

| Tool | Описание |
|------|----------|
| `manage_charter` | Управление Charter (цели, ограничения, DoD) |
| `manage_adr` | Архитектурные решения (ADR) |

**Charter** — определяет границы сессии:
- Goal, Non-Goals, Definition of Done
- Constraints (soft) и Invariants (hard)
- Glossary терминов

**ADR** — записи архитектурных решений:
- Автоматически создаются при изменении Charter
- Типы: architectural, technical, process, charter-change, constraint-override, user-override
- Статусы: proposed → accepted/rejected/deprecated/superseded

**Compliance Gate & Validation:**
- Перед запуском инструментов выполняется проверка на соответствие Charter
- Нарушение Invariants может блокировать выполнение (hard fail)
- При старте сессии валидируются целостность Charter/ADR-связей и циклы supersedes

См. [docs/charter-system.md](docs/charter-system.md) и [docs/adr-guide.md](docs/adr-guide.md).

---

## 🗓️ Scheduler

### Возможности
- **One-time reminders** — "напомни через 30 минут"
- **Recurring tasks** — каждую минуту/час/день/неделю/месяц
- **Auto-execution** — задачи с prompt автоматически запускают новый чат
- **Native notifications** — системные уведомления (macOS/Windows/Linux)
- **Default model** — выбор предпочитаемой модели для scheduled tasks

### Технические детали
- Хранение в SQLite (Rust backend)
- Background thread проверяет due tasks
- `tauri-plugin-notification` для нативных уведомлений

### Примеры использования
```
"Напомни мне через 30 минут проверить почту"
"Каждый день в 9:00 присылай сводку новостей"
"Раз в час парси сайт и сообщай об изменениях"
```

---

## 🎨 UI/UX

### Интерфейс
- ✅ Современный дизайн (React + Tailwind)
- ✅ Streaming сообщений с плавным автоскроллом
- ✅ Интерфейсные темы: `light / dark / auto` (auto по локальному времени)
- ✅ Preview panel для изменений файлов (approve/edit/skip до выполнения)
- ✅ Редактирование и пересылка сообщений
- ✅ Session Management (pin, search, clone, delete)
- ✅ Todo Panel с визуальным прогрессом
- ✅ CharterPanel / ADRPanel в карточке сессии
- ✅ Scrollable modals для большого контента

### Горячие клавиши
| Комбинация | Действие |
|------------|----------|
| `Cmd/Ctrl + Enter` | Отправить сообщение |
| `Escape` | Закрыть модальное окно |
| `Cmd/Ctrl + N` | Новый чат |

### Дополнительно
- Spell check (встроенная проверка орфографии)
- Permission modes (ask/default для инструментов)
- Multi-language support (отвечает на языке пользователя)

---

## 🔒 Безопасность

| Функция | Описание |
|---------|----------|
| Directory sandboxing | Доступ только к workspace folder |
| JS Sandbox | vm без network/timers |
| Permission confirmations | Подтверждение опасных операций |
| Compliance gate | Проверка действий по Charter до запуска инструментов |
| No data collection | Всё хранится локально |

---

## 🎯 Skills Marketplace

### Возможности
- GitHub-based marketplace
- Кастомные URLs для приватных репозиториев
- Автозагрузка и кеширование
- Категории: general, creative, code, etc.

### Встроенные категории
- `algorithmic-art` — генеративное искусство
- `brand-guidelines` — стиль Anthropic
- `canvas-design` — визуальный дизайн
- И другие...

---

## 📊 Developer Experience

### Логирование
- Session Logging — JSON logs в `~/.valera/logs/`
- Token tracking — input/output/duration
- Client/Server events в консоли

### Отладка
- Loop detection — детекция зацикливания (5+ одинаковых tool calls)
- Request timeouts — 5 минут с auto-retry
- Full request/response JSON для каждого turn

---

## 💾 Data Storage

### Расположение данных

| OS | Путь |
|----|------|
| macOS | `~/Library/Application Support/ValeDesk/` |
| Windows | `%APPDATA%/ValeDesk/` |
| Linux | `~/.config/ValeDesk/` |

### Файлы

| Файл | Содержимое |
|------|------------|
| `sessions.db` | SQLite: sessions, messages, todos, scheduled_tasks, settings |
| `api-settings.json` | API конфигурация |
| `skills-settings.json` | Skills marketplace настройки |
| `llm-providers-settings.json` | Настройки LLM провайдеров |
| `~/.valera/memory.md` | Персистентная память пользователя |
| `~/.valera/logs/sessions/{session-id}/` | Логи запросов/ответов по turn'ам |

---

## 🖥️ Платформы

| Платформа | Статус | Формат |
|-----------|--------|--------|
| macOS ARM64 | ✅ | Tauri bundle |
| Windows x64 | ✅ | Tauri bundle |
| Linux x64 | ✅ | Tauri bundle |

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/followcat/ValeDesk.git
cd ValeDesk

# Install
npm install

# Development (recommended)
npm run dev

# Development (macOS/Linux via Makefile)
make dev

# Production build
make bundle
```

### Конфигурация для локальных моделей

**Ollama:**
```bash
ollama serve
# Base URL: http://localhost:11434/v1
```

**vLLM:**
```bash
vllm serve Qwen/Qwen2.5-14B-Instruct --port 8000
# Base URL: http://localhost:8000/v1
```

---

## 📄 License

**ValeDesk Community License** — бесплатно для индивидуальных пользователей и компаний с выручкой до $1M/год.

---

<div align="center">

**Made with ❤️ by [Valerii Kovalskii](https://github.com/vakovalskii)**

</div>
