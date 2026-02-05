export type PermissionResult = {
  behavior: "allow" | "deny";
  updatedInput?: unknown;
  message?: string;
};

export type SDKMessage = {
  type: string;
  message?: any;
  subtype?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  [key: string]: unknown;
};

// Attachment types for multimodal support
export type AttachmentType = 'image' | 'video' | 'audio';

export interface Attachment {
  id: string;
  type: AttachmentType;
  name: string;
  mimeType: string;
  dataUrl: string; // base64 data URL
  size: number; // bytes
  path?: string; // path relative to workspace (if saved)
}

export type UserPromptMessage = {
  type: "user_prompt";
  prompt: string;
  attachments?: Attachment[];
};

export type SystemSummaryMessage = {
  type: "system_summary";
  summary: string;
};

export type StreamMessage = SDKMessage | UserPromptMessage | SystemSummaryMessage;

export type SessionStatus = "idle" | "running" | "completed" | "error";

// Todo types
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

// File change tracking type
export type ChangeStatus = 'pending' | 'confirmed';
export interface FileChange {
  path: string;              // Relative path from project root
  additions: number;         // Number of lines added
  deletions: number;         // Number of lines deleted
  status: ChangeStatus;      // 'pending' = can be rolled back, 'confirmed' = cannot rollback
  commitHash?: string;       // Commit hash for showing commit-level diffs
}

// ============================================================
// Charter System Types (Phase 1)
// ============================================================

// Single charter item with unique ID
export interface CharterItem {
  id: string;         // Unique identifier (e.g., "goal-001", "constraint-002")
  content: string;    // The actual text content
}

// Charter data structure - defines session scope and constraints
export interface CharterData {
  // Core goal definition
  goal: CharterItem;              // Primary objective (required)
  nonGoals?: CharterItem[];       // Explicitly out of scope items
  
  // Acceptance criteria
  definitionOfDone: CharterItem[]; // Must be met for session to be "complete"
  
  // Constraints and invariants
  constraints?: CharterItem[];     // Soft constraints (can be overridden with ADR)
  invariants?: CharterItem[];      // Hard constraints (NEVER violate)
  
  // Context
  glossary?: Record<string, string>; // Domain-specific terminology
  
  // Metadata
  version?: number;                // Charter version (increments on change)
  createdAt?: number;              // Creation timestamp
  updatedAt?: number;              // Last update timestamp
}

// ============================================================
// ADR (Architecture Decision Record) System Types (Phase 2)
// ============================================================

// ADR status lifecycle
export type ADRStatus = 
  | 'proposed'    // Initial state - under discussion
  | 'accepted'    // Approved and in effect
  | 'rejected'    // Not approved
  | 'deprecated'  // Was accepted, no longer recommended
  | 'superseded'; // Replaced by another ADR

// ADR types for categorization
export type ADRType = 
  | 'architectural'   // System architecture decisions
  | 'technical'       // Technical implementation choices
  | 'process'         // Process/workflow decisions
  | 'charter-change'  // Changes to session charter
  | 'constraint-override'; // Overriding a soft constraint

// ADR item structure
export interface ADRItem {
  id: string;            // Format: adr-YYYY-MM-DD-<short_id>
  title: string;         // Brief descriptive title
  status: ADRStatus;     // Current status
  type: ADRType;         // Category of decision
  
  // Core content
  context: string;       // Why is this decision needed?
  decision: string;      // What was decided?
  consequences: string;  // What are the implications?
  
  // Optional fields
  alternatives?: string;          // What alternatives were considered?
  supersedes?: string;            // ID of ADR this supersedes
  supersededBy?: string;          // ID of ADR that superseded this
  charterRefs?: string[];         // Referenced charter item IDs
  charterHashBefore?: string;     // Charter hash before change
  charterHashAfter?: string;      // Charter hash after change
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  author?: string;
}

// ============================================================
// Preview System Types (Phase 4.4-4.7)
// ============================================================

// Preview change types
export type PreviewType = 
  | 'file_edit'      // Modifying existing file
  | 'file_create'    // Creating new file
  | 'file_delete'    // Deleting file
  | 'command_exec';  // Executing shell command

// Preview status
export type PreviewStatus = 'pending' | 'approved' | 'rejected' | 'modified';

// Single change preview
export interface ChangePreview {
  id: string;                    // Unique preview ID
  type: PreviewType;             // Type of change
  target: string;                // File path or command
  before?: string;               // Original content (for edit/delete)
  after?: string;                // New content (for edit/create)
  command?: string;              // Shell command (for command_exec)
  description?: string;          // Human-readable description
  status: PreviewStatus;         // Current status
  userModifiedContent?: string;  // User's modified version (if status='modified')
  createdAt: number;             // Timestamp
}

// Batch preview request from agent
export interface PreviewBatch {
  id: string;                    // Batch ID
  sessionId: string;             // Session this belongs to
  toolCallId: string;            // Original tool call ID
  toolName: string;              // Tool that triggered this
  previews: ChangePreview[];     // List of changes to preview
  status: 'pending' | 'resolved';
  createdAt: number;
}

// User's response to a preview
export type ApprovalAction = 
  | 'approve'           // Accept as-is
  | 'approve_modified'  // Accept with user modifications
  | 'reject_retry'      // Reject and ask agent to retry
  | 'reject_skip';      // Reject and skip this operation

export interface PreviewApproval {
  batchId: string;
  previewId: string;
  action: ApprovalAction;
  modifiedContent?: string;      // Content if action='approve_modified'
  rejectReason?: string;         // Reason if action='reject_*'
}

// Batch approval (approve/reject all)
export interface BatchApproval {
  batchId: string;
  action: 'approve_all' | 'reject_all';
  rejectReason?: string;
}

// Skill types
export interface Skill {
  id: string;
  name: string;
  description: string;
  category?: string;
  author?: string;
  version?: string;
  license?: string;
  compatibility?: string;
  repoPath: string;
  enabled: boolean;
  lastUpdated?: number;
}

export type SessionInfo = {
  id: string;
  title: string;
  status: SessionStatus;
  cwd?: string;
  model?: string;
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
  inputTokens?: number;
  outputTokens?: number;
  threadId?: string; // Thread ID for multi-thread sessions
  // Charter system fields
  charter?: CharterData;  // Session charter (scope/constraints)
  charterHash?: string;   // Hash for change detection
  // ADR system fields
  adrs?: ADRItem[];       // Architecture Decision Records
};

export type ThreadInfo = {
  threadId: string; // Session ID (threads are stored as sessions)
  model: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
};

// Task creation types
export type TaskMode = 'consensus' | 'different_tasks';

export type ThreadTask = {
  id: string;
  model: string;
  prompt: string;
};

export type CreateTaskPayload = {
  mode: TaskMode;
  title: string;
  cwd?: string;
  allowedTools?: string;
  shareWebCache?: boolean;

  // For consensus mode
  consensusModel?: string;
  consensusQuantity?: number;
  consensusPrompt?: string;
  autoSummary?: boolean;

  // For different_tasks mode
  tasks?: ThreadTask[];
};

export type CreatedThreadInfo = {
  threadId: string;
  model: string;
  status: string;
  createdAt: number;
  updatedAt: number;
};

// Multi-thread task types
export type MultiThreadTask = {
  id: string;
  title: string;
  mode: TaskMode;
  createdAt: number;
  updatedAt: number;
  status: 'created' | 'running' | 'completed' | 'error';
  threadIds: string[];
  shareWebCache?: boolean;
  consensusModel?: string;
  consensusQuantity?: number;
  consensusPrompt?: string;
  autoSummary?: boolean;
  tasks?: ThreadTask[];
  summaryThreadId?: string;  // ID of summary thread if created
};

export type WebSearchProvider = 'tavily' | 'zai';

export type ZaiApiUrl = 'default' | 'coding';

export type ZaiReaderApiUrl = 'default' | 'coding';

export type ApiSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;  // Optional temperature for vLLM/OpenAI-compatible APIs
  tavilyApiKey?: string; // Optional Tavily API key for web search
  enableTavilySearch?: boolean; // Enable/disable Tavily search even with API key
  zaiApiKey?: string; // Optional Z.AI API key for web search
  webSearchProvider?: WebSearchProvider; // Web search provider: 'tavily' or 'zai'
  zaiApiUrl?: ZaiApiUrl; // Z.AI API URL variant: 'default' or 'coding'
  permissionMode?: 'default' | 'ask'; // Permission mode: 'default' = auto-execute, 'ask' = require confirmation
  enableMemory?: boolean; // Enable long-term memory tool
  enableZaiReader?: boolean; // Enable Z.AI Web Reader tool
  zaiReaderApiUrl?: ZaiReaderApiUrl; // Z.AI Reader API URL variant: 'default' or 'coding'
  // New tool group toggles
  enableGitTools?: boolean; // Enable git_* tools (11 tools)
  enableBrowserTools?: boolean; // Enable browser_* tools (11 tools)
  enableDuckDuckGo?: boolean; // Enable search/search_news/search_images (no API key needed)
  enableFetchTools?: boolean; // Enable fetch/fetch_json/download tools
  enableImageTools?: boolean; // Enable attach_image tool
  llmProviders?: LLMProviderSettings; // LLM providers and models configuration
  language?: 'auto' | 'en' | 'zh-CN'; // UI language preference

  // If set, new sessions created without a workspace folder will use:
  //   {conversationDataDir}/{sessionId}
  // as their working directory for file I/O.
  conversationDataDir?: string;
  enableSessionGitRepo?: boolean; // Initialize a git repo in session folders when available

  // Preview system settings
  enablePreview?: boolean; // Enable preview mode for file changes (default: false)
  previewMode?: 'always' | 'ask' | 'never'; // When to show preview: always, ask (per-tool), never
};

export type ModelInfo = {
  id: string;
  name: string;
  description?: string;
};

// LLM Provider types
export type LLMProviderType = 'openai' | 'openrouter' | 'zai';

export type ZaiApiUrlPrefix = 'default' | 'coding';

export interface LLMProvider {
  id: string;
  type: LLMProviderType;
  name: string;
  apiKey: string;
  baseUrl?: string;
  zaiApiPrefix?: ZaiApiUrlPrefix; // Only for zai provider
  enabled: boolean;
}

export interface LLMModel {
  id: string;
  name: string;
  providerId: string;
  providerType: LLMProviderType;
  description?: string;
  enabled: boolean;
  contextLength?: number;
}

export interface LLMProviderSettings {
  providers: LLMProvider[];
  models: LLMModel[];
}

// Server -> Client events
export type ServerEvent =
  | { type: "stream.message"; payload: { sessionId: string; message: StreamMessage; threadId?: string } }
  | { type: "stream.user_prompt"; payload: { sessionId: string; prompt: string; threadId?: string; attachments?: Attachment[] } }
  | { type: "session.status"; payload: { sessionId: string; status: SessionStatus; title?: string; cwd?: string; error?: string; model?: string; temperature?: number; threadId?: string } }
  | { type: "session.list"; payload: { sessions: SessionInfo[] } }
  | { type: "session.history"; payload: { sessionId: string; status: SessionStatus; messages: StreamMessage[]; inputTokens?: number; outputTokens?: number; todos?: TodoItem[]; model?: string; fileChanges?: FileChange[]; hasMore?: boolean; nextCursor?: number; page?: "initial" | "prepend" } }
  | { type: "session.deleted"; payload: { sessionId: string } }
  | { type: "session.cloned"; payload: { session: SessionInfo } }
  | { type: "permission.request"; payload: { sessionId: string; toolUseId: string; toolName: string; input: unknown; explanation?: string } }
  | { type: "runner.error"; payload: { sessionId?: string; message: string } }
  | { type: "settings.loaded"; payload: { settings: ApiSettings | null } }
  | { type: "models.loaded"; payload: { models: ModelInfo[] } }
  | { type: "models.error"; payload: { message: string } }
  | { type: "todos.updated"; payload: { sessionId: string; todos: TodoItem[] } }
  | { type: "file_changes.updated"; payload: { sessionId: string; fileChanges: FileChange[] } }
  | { type: "file_changes.confirmed"; payload: { sessionId: string } }
  | { type: "file_changes.rolledback"; payload: { sessionId: string; fileChanges: FileChange[] } }
  | { type: "file_changes.error"; payload: { sessionId: string; message: string } }
  | { type: "thread.list"; payload: { sessionId: string; threads: ThreadInfo[] } }
  | { type: "task.created"; payload: { task: MultiThreadTask; threads: CreatedThreadInfo[] } }
  | { type: "task.status"; payload: { taskId: string; status: 'created' | 'running' | 'completed' | 'error' } }
  | { type: "task.error"; payload: { message: string } }
  | { type: "task.deleted"; payload: { taskId: string } }
  | { type: "llm.providers.loaded"; payload: { settings: LLMProviderSettings } }
  | { type: "llm.providers.saved"; payload: { settings: LLMProviderSettings } }
  | { type: "llm.models.fetched"; payload: { providerId: string; models: LLMModel[] } }
  | { type: "llm.models.error"; payload: { providerId: string; message: string } }
  | { type: "llm.models.checked"; payload: { unavailableModels: string[] } }
  // Skills events
  | { type: "skills.loaded"; payload: { skills: Skill[]; marketplaceUrl: string; lastFetched?: number } }
  | { type: "skills.error"; payload: { message: string } }
  // Scheduler events
  | { type: "scheduler.notification"; payload: { title: string; body: string } }
  | { type: "scheduler.task_execute"; payload: { taskId: string; title: string; prompt?: string } }
  | { type: "scheduler.default_model.loaded"; payload: { modelId: string | null } }
  | { type: "scheduler.default_temperature.loaded"; payload: { temperature: number; sendTemperature: boolean } }
  // Preview system events
  | { type: "preview.request"; payload: { batch: PreviewBatch } }
  | { type: "preview.resolved"; payload: { batchId: string; sessionId: string } };

// Client -> Server events
export type ClientEvent =
  | { type: "session.start"; payload: { title: string; prompt: string; cwd?: string; model?: string; allowedTools?: string; threadId?: string; temperature?: number; enableSessionGitRepo?: boolean; attachments?: Attachment[]; charter?: CharterData } }
  | { type: "session.continue"; payload: { sessionId: string; prompt: string; retry?: boolean; retryReason?: string; attachments?: Attachment[] } }
  | { type: "session.stop"; payload: { sessionId: string; } }
  | { type: "session.delete"; payload: { sessionId: string; } }
  | { type: "session.clone"; payload: { sessionId: string; } }
  | { type: "session.pin"; payload: { sessionId: string; isPinned: boolean; } }
  | { type: "session.update-cwd"; payload: { sessionId: string; cwd: string; } }
  | { type: "session.update"; payload: { sessionId: string; model?: string; temperature?: number; sendTemperature?: boolean; title?: string; } }
  | { type: "session.list" }
  | { type: "session.history"; payload: { sessionId: string; limit?: number; before?: number } }
  | { type: "permission.response"; payload: { sessionId: string; toolUseId: string; result: PermissionResult; } }
  | { type: "message.edit"; payload: { sessionId: string; messageIndex: number; newPrompt: string; } }
  | { type: "settings.get" }
  | { type: "settings.save"; payload: { settings: ApiSettings; } }
  | { type: "open.external"; payload: { url: string; } }
  | { type: "models.get" }
  | { type: "file_changes.confirm"; payload: { sessionId: string; } }
  | { type: "file_changes.rollback"; payload: { sessionId: string; cwd?: string; fileChanges?: FileChange[] } }
  | { type: "thread.list"; payload: { sessionId: string } }
  | { type: "task.create"; payload: CreateTaskPayload }
  | { type: "task.start"; payload: { taskId: string } }
  | { type: "task.delete"; payload: { taskId: string } }
  | { type: "task.stop"; payload: { sessionId: string } }
  | { type: "llm.providers.get" }
  | { type: "llm.providers.save"; payload: { settings: LLMProviderSettings } }
  | { type: "llm.models.fetch"; payload: { providerId: string } }
  | { type: "llm.models.test"; payload: { provider: LLMProvider } }
  | { type: "llm.models.check" }
  // Skills events
  | { type: "skills.get" }
  | { type: "skills.refresh" }
  | { type: "skills.toggle"; payload: { skillId: string; enabled: boolean } }
  | { type: "skills.set-marketplace"; payload: { url: string } }
  // Scheduler events
  | { type: "scheduler.default_model.get" }
  | { type: "scheduler.default_model.set"; payload: { modelId: string } }
  | { type: "scheduler.default_temperature.get" }
  | { type: "scheduler.default_temperature.set"; payload: { temperature: number; sendTemperature: boolean } }
  // Preview system events
  | { type: "preview.approve"; payload: PreviewApproval }
  | { type: "preview.approve_all"; payload: BatchApproval }
  | { type: "preview.reject_all"; payload: BatchApproval };
