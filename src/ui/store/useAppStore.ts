import { create } from 'zustand';
import type { ServerEvent, SessionStatus, StreamMessage, TodoItem, FileChange, MultiThreadTask, LLMModel, LLMProvider, LLMProviderSettings, ApiSettings, Attachment } from "../types";
import type { CharterData, ADRItem } from "../../agent/types";
import { getPlatform } from "../platform";

export type PermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: unknown;
  explanation?: string;
};

export type SessionView = {
  id: string;
  title: string;
  status: SessionStatus;
  cwd?: string;
  model?: string;
  temperature?: number;
  isPinned?: boolean;
  messages: StreamMessage[];
  permissionRequests: PermissionRequest[];
  lastPrompt?: string;
  createdAt?: number;
  updatedAt?: number;
  hydrated: boolean;
  inputTokens?: number;
  outputTokens?: number;
  todos?: TodoItem[];
  fileChanges?: FileChange[];
  fileChangesByMessage?: Record<number, FileChange[]>;
  historyHasMore?: boolean;
  historyCursor?: number;
  historyLoading?: boolean;
  historyLoadType?: "initial" | "prepend";
  historyLoadId?: number;
  charter?: CharterData;
  charterHash?: string;
  adrs?: ADRItem[];
};

interface AppState {
  sessions: Record<string, SessionView>;
  activeSessionId: string | null;
  prompt: string;
  cwd: string;
  pendingStart: boolean;
  globalError: string | null;
  sessionsLoaded: boolean;
  showStartModal: boolean;
  historyRequested: Set<string>;
  autoScrollEnabled: boolean;
  selectedModel: string | null;
  selectedTemperature: number;
  sendTemperature: boolean;
  availableModels: Array<{ id: string; name: string; description?: string }>;
  multiThreadTasks: Record<string, MultiThreadTask>;
  llmProviders: LLMProvider[];
  llmModels: LLMModel[];
  llmProviderSettings: LLMProviderSettings | null;
  apiSettings: ApiSettings | null;
  schedulerDefaultModel: string | null;
  schedulerDefaultTemperature: number | null;
  schedulerDefaultSendTemperature: boolean | null;
  // Attachments for multimodal support
  attachments: Attachment[];

  setPrompt: (prompt: string) => void;
  setCwd: (cwd: string) => void;
  setPendingStart: (pending: boolean) => void;
  setGlobalError: (error: string | null) => void;
  setShowStartModal: (show: boolean) => void;
  setActiveSessionId: (id: string | null) => void;
  markHistoryRequested: (sessionId: string) => void;
  setHistoryLoading: (sessionId: string, loading: boolean) => void;
  resolvePermissionRequest: (sessionId: string, toolUseId: string) => void;
  sendEvent: (event: any) => void;
  handleServerEvent: (event: ServerEvent) => void;
  setAutoScrollEnabled: (enabled: boolean) => void;
  setSelectedModel: (model: string | null) => void;
  setSelectedTemperature: (temp: number) => void;
  setSendTemperature: (send: boolean) => void;
  setAvailableModels: (models: Array<{ id: string; name: string; description?: string }>) => void;
  deleteMultiThreadTask: (taskId: string) => void;
  setLLMProviders: (providers: LLMProvider[]) => void;
  setLLMModels: (models: LLMModel[]) => void;
  setLLMProviderSettings: (settings: LLMProviderSettings) => void;
  // Attachment actions
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
}

function createSession(id: string): SessionView {
  return { id, title: "", status: "idle", messages: [], permissionRequests: [], hydrated: false, todos: [], fileChangesByMessage: {}, historyHasMore: false, historyLoading: false, historyLoadId: 0 };
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  prompt: "",
  cwd: "",
  pendingStart: false,
  globalError: null,
  sessionsLoaded: false,
  showStartModal: false,
  historyRequested: new Set(),
  autoScrollEnabled: true,
  selectedModel: null,
  selectedTemperature: 0.3,
  sendTemperature: true,
  availableModels: [],
  multiThreadTasks: {},
  llmProviders: [],
  llmModels: [],
  llmProviderSettings: null,
  apiSettings: null,
  schedulerDefaultModel: null,
  schedulerDefaultTemperature: null,
  schedulerDefaultSendTemperature: null,
  attachments: [],

  setPrompt: (prompt) => set({ prompt }),
  setCwd: (cwd) => set({ cwd }),
  setPendingStart: (pendingStart) => set({ pendingStart }),
  setGlobalError: (globalError) => set({ globalError }),
  setShowStartModal: (showStartModal) => set({ showStartModal }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setAutoScrollEnabled: (autoScrollEnabled) => set({ autoScrollEnabled }),
  setHistoryLoading: (sessionId, loading) => {
    set((state) => {
      const existing = state.sessions[sessionId] ?? createSession(sessionId);
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            historyLoading: loading
          }
        }
      };
    });
  },
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setSelectedTemperature: (selectedTemperature) => set({ selectedTemperature }),
  setSendTemperature: (sendTemperature) => set({ sendTemperature }),
  setAvailableModels: (availableModels) => set({ availableModels }),
  setLLMProviders: (llmProviders) => set({ llmProviders }),
  setLLMModels: (llmModels) => set({ llmModels }),
  setLLMProviderSettings: (llmProviderSettings) => set({ llmProviderSettings }),
  // Attachment actions
  addAttachment: (attachment) => set((state) => ({ attachments: [...state.attachments, attachment] })),
  removeAttachment: (id) => set((state) => ({ attachments: state.attachments.filter(a => a.id !== id) })),
  clearAttachments: () => set({ attachments: [] }),
  deleteMultiThreadTask: (taskId) => {
    set((state) => {
      const nextTasks = { ...state.multiThreadTasks };
      delete nextTasks[taskId];
      return { multiThreadTasks: nextTasks };
    });
  },
  sendEvent: (event) => {
    getPlatform().sendClientEvent(event);
  },

  markHistoryRequested: (sessionId) => {
    set((state) => {
      const next = new Set(state.historyRequested);
      next.add(sessionId);
      return { historyRequested: next };
    });
  },

  resolvePermissionRequest: (sessionId, toolUseId) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return {};
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            permissionRequests: existing.permissionRequests.filter(req => req.toolUseId !== toolUseId)
          }
        }
      };
    });
  },

  handleServerEvent: (event) => {
    const state = get();

    switch (event.type) {
      case "session.list": {
        const nextSessions: Record<string, SessionView> = {};
        for (const session of event.payload.sessions) {
          const existing = state.sessions[session.id] ?? createSession(session.id);
          nextSessions[session.id] = {
            ...existing,
            status: session.status,
            title: session.title,
            cwd: session.cwd,
            model: session.model,
            isPinned: session.isPinned,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            inputTokens: session.inputTokens,
            outputTokens: session.outputTokens,
            // Preserve charter/adrs from session list or existing state
            charter: session.charter ?? existing.charter,
            charterHash: session.charterHash ?? existing.charterHash,
            adrs: session.adrs ?? existing.adrs
          };
        }

        set({ sessions: nextSessions, sessionsLoaded: true });

        const hasSessions = event.payload.sessions.length > 0;
        set({ showStartModal: !hasSessions });

        if (!hasSessions) {
          get().setActiveSessionId(null);
        }

        if (!state.activeSessionId && event.payload.sessions.length > 0) {
          const sorted = [...event.payload.sessions].sort((a, b) => {
            const aTime = a.updatedAt ?? a.createdAt ?? 0;
            const bTime = b.updatedAt ?? b.createdAt ?? 0;
            return aTime - bTime;
          });
          const latestSession = sorted[sorted.length - 1];
          if (latestSession) {
            get().setActiveSessionId(latestSession.id);
          }
        } else if (state.activeSessionId) {
          const stillExists = event.payload.sessions.some(
            (session) => session.id === state.activeSessionId
          );
          if (!stillExists) {
            get().setActiveSessionId(null);
          }
        }
        break;
      }

      case "session.history": {
        const { sessionId, messages, status, inputTokens, outputTokens, todos, model, fileChanges, hasMore, nextCursor, page, charter, charterHash, adrs } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const loadType = page ?? "initial";
          const mergedMessages = loadType === "prepend"
            ? [...messages, ...(existing.messages || [])]
            : messages;
          let fileChangesByMessage = loadType === "prepend" ? (existing.fileChangesByMessage || {}) : { ...(existing.fileChangesByMessage || {}) };
          if (loadType === "prepend" && Object.keys(fileChangesByMessage).length > 0) {
            const shift = messages.length;
            const shifted: Record<number, FileChange[]> = {};
            Object.entries(fileChangesByMessage).forEach(([key, value]) => {
              const index = Number(key);
              if (!Number.isNaN(index)) {
                shifted[index + shift] = value;
              }
            });
            fileChangesByMessage = shifted;
          } else if (loadType !== "prepend" && (fileChangesByMessage && Object.keys(fileChangesByMessage).length === 0)) {
            // Seed per-message map from DB-backed fileChanges for restored sessions
            const resolvedFileChanges = fileChanges ?? [];
            if (resolvedFileChanges.length > 0 && mergedMessages.length > 0) {
              let lastResultIndex: number | null = null;
              for (let i = mergedMessages.length - 1; i >= 0; i -= 1) {
                const msg = mergedMessages[i] as any;
                if (msg?.type === "result") {
                  lastResultIndex = i;
                  break;
                }
              }
              if (lastResultIndex === null) {
                lastResultIndex = mergedMessages.length - 1;
              }
              fileChangesByMessage = { ...fileChangesByMessage, [lastResultIndex]: resolvedFileChanges };
            }
          }
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                status,
                messages: mergedMessages,
                model: model ?? existing.model,
                hydrated: true,
                // Use token counts from payload (from DB), fallback to existing values
                inputTokens: inputTokens ?? existing.inputTokens,
                outputTokens: outputTokens ?? existing.outputTokens,
                // Load todos from DB (use empty array if none, don't inherit from previous session)
                todos: todos ?? [],
                // Load fileChanges from DB
                fileChanges: fileChanges ?? [],
                fileChangesByMessage,
                historyHasMore: hasMore ?? existing.historyHasMore,
                historyCursor: nextCursor ?? existing.historyCursor,
                historyLoading: false,
                historyLoadType: loadType,
                historyLoadId: (existing.historyLoadId ?? 0) + 1,
                // Load charter and ADRs from DB
                charter: charter ?? existing.charter,
                charterHash: charterHash ?? existing.charterHash,
                adrs: adrs ?? existing.adrs
              }
            }
          };
        });
        break;
      }

      case "session.status": {
        const { sessionId, status, title, cwd, model, temperature, charter, charterHash, adrs } = event.payload;
        const isPendingStart = state.pendingStart;

        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                status,
                title: title ?? existing.title,
                cwd: cwd ?? existing.cwd,
                model: model ?? existing.model,
                temperature: temperature ?? existing.temperature,
                updatedAt: Date.now(),
                // Mark as hydrated if this is a new session we just started
                // This prevents session.history from overwriting new messages
                hydrated: isPendingStart ? true : existing.hydrated,
                // Update charter/adrs if provided
                charter: charter ?? existing.charter,
                charterHash: charterHash ?? existing.charterHash,
                adrs: adrs ?? existing.adrs
              }
            }
          };
        });

        if (isPendingStart) {
          get().setActiveSessionId(sessionId);
          set({ pendingStart: false, showStartModal: false });
        }
        break;
      }

      case "session.deleted": {
        const { sessionId } = event.payload;
        const state = get();
        if (!state.sessions[sessionId]) break;
        const nextSessions = { ...state.sessions };
        delete nextSessions[sessionId];
        set({
          sessions: nextSessions,
          showStartModal: Object.keys(nextSessions).length === 0
        });
        if (state.activeSessionId === sessionId) {
          const remaining = Object.values(nextSessions).sort(
            (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
          );
          get().setActiveSessionId(remaining[0]?.id ?? null);
        }
        break;
      }

      case "session.cloned": {
        const { session } = event.payload;
        set((state) => {
          const existing = state.sessions[session.id] ?? createSession(session.id);
          return {
            sessions: {
              ...state.sessions,
              [session.id]: {
                ...existing,
                id: session.id,
                title: session.title,
                status: session.status,
                cwd: session.cwd,
                model: session.model,
                isPinned: session.isPinned,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                inputTokens: session.inputTokens,
                outputTokens: session.outputTokens,
                charter: session.charter,
                charterHash: session.charterHash,
                adrs: session.adrs,
                hydrated: false
              }
            },
            showStartModal: false
          };
        });
        get().setActiveSessionId(session.id);
        break;
      }

      case "stream.message": {
        const { sessionId, message } = event.payload;

        // OPTIMIZATION: Don't store stream_event messages in store
        // They are only used for live streaming preview in App.tsx (partialMessage)
        // Storing them causes 1000+ state updates per response
        if ((message as any).type === 'stream_event') {
          // Skip - handled by handlePartialMessages in App.tsx
          break;
        }

        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);

          // Extract token usage from result messages
          let inputTokens = existing.inputTokens;
          let outputTokens = existing.outputTokens;
          if (message.type === "result" && message.usage) {
            const { input_tokens, output_tokens } = message.usage;
            if (input_tokens !== undefined) {
              inputTokens = input_tokens;
            }
            if (output_tokens !== undefined) {
              outputTokens = output_tokens;
            }
          }

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: [...existing.messages, message],
                inputTokens,
                outputTokens
              }
            }
          };
        });
        break;
      }

      case "stream.user_prompt": {
        const { sessionId, prompt, attachments } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: [...existing.messages, { type: "user_prompt", prompt, attachments }]
              }
            }
          };
        });
        break;
      }

      case "permission.request": {
        const { sessionId, toolUseId, toolName, input, explanation } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                permissionRequests: [...existing.permissionRequests, { toolUseId, toolName, input, explanation }]
              }
            }
          };
        });
        break;
      }

      case "runner.error": {
        set({ globalError: event.payload.message });
        break;
      }

      case "todos.updated": {
        const { sessionId, todos } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                todos
              }
            }
          };
        });
        break;
      }

      case "models.loaded": {
        const { models } = event.payload;
        set({ availableModels: models });
        console.log('[AppStore] Models loaded:', models);
        break;
      }

      case "models.error": {
        const { message } = event.payload;
        console.error('[AppStore] Failed to load models:', message);
        break;
      }

      case "file_changes.updated": {
        const { sessionId, fileChanges } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          let fileChangesMessageIndex: number | null = null;
          for (let i = existing.messages.length - 1; i >= 0; i -= 1) {
            const msg = existing.messages[i] as any;
            if (msg?.type === "result") {
              fileChangesMessageIndex = i;
              break;
            }
          }
          if (fileChangesMessageIndex === null && existing.messages.length > 0) {
            fileChangesMessageIndex = existing.messages.length - 1;
          }
          const nextFileChangesByMessage = { ...(existing.fileChangesByMessage || {}) };
          if (fileChangesMessageIndex !== null) {
            if (fileChanges.length > 0) {
              nextFileChangesByMessage[fileChangesMessageIndex] = fileChanges;
            } else {
              delete nextFileChangesByMessage[fileChangesMessageIndex];
            }
          }
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                fileChanges,
                fileChangesByMessage: nextFileChangesByMessage
              }
            }
          };
        });
        break;
      }

      case "file_changes.confirmed": {
        const { sessionId } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId];
          if (!existing || !existing.fileChanges) return {};
          const confirmedChanges = existing.fileChanges.map(c => ({ ...c, status: 'confirmed' as const }));
          const nextFileChangesByMessage = { ...(existing.fileChangesByMessage || {}) };
          if (Object.keys(nextFileChangesByMessage).length > 0) {
            Object.entries(nextFileChangesByMessage).forEach(([key, value]) => {
              nextFileChangesByMessage[Number(key)] = value.map(c => ({ ...c, status: 'confirmed' as const }));
            });
          }
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                fileChanges: confirmedChanges,
                fileChangesByMessage: nextFileChangesByMessage
              }
            }
          };
        });
        break;
      }

      case "file_changes.rolledback": {
        const { sessionId, fileChanges } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId];
          if (!existing) return {};
          const remainingChanges = fileChanges ?? [];
          const nextFileChangesByMessage = { ...(existing.fileChangesByMessage || {}) };
          if (existing.messages.length > 0) {
            let lastResultIndex: number | null = null;
            for (let i = existing.messages.length - 1; i >= 0; i -= 1) {
              const msg = existing.messages[i] as any;
              if (msg?.type === "result") {
                lastResultIndex = i;
                break;
              }
            }
            if (lastResultIndex === null) {
              lastResultIndex = existing.messages.length - 1;
            }
            if (remainingChanges.length > 0) {
              nextFileChangesByMessage[lastResultIndex] = remainingChanges;
            } else {
              delete nextFileChangesByMessage[lastResultIndex];
            }
          }
          // Remaining fileChanges (failed rollback) or empty array if all succeeded
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                fileChanges: remainingChanges,
                fileChangesByMessage: nextFileChangesByMessage
              }
            }
          };
        });
        break;
      }

      case "file_changes.error": {
        const { message } = event.payload;
        set({ globalError: message });
        break;
      }

      case "task.created": {
        const { task } = event.payload;
        set((state) => ({
          multiThreadTasks: {
            ...state.multiThreadTasks,
            [task.id]: task
          }
        }));
        break;
      }

      case "task.status": {
        const { taskId, status } = event.payload;
        set((state) => {
          const existing = state.multiThreadTasks[taskId];
          if (!existing) return {};
          return {
            multiThreadTasks: {
              ...state.multiThreadTasks,
              [taskId]: {
                ...existing,
                status,
                updatedAt: Date.now()
              }
            }
          };
        });
        break;
      }

      case "task.error": {
        const { message } = event.payload;
        set({ globalError: message });
        break;
      }

      case "task.deleted": {
        const { taskId } = event.payload;
        set((state) => {
          const nextTasks = { ...state.multiThreadTasks };
          delete nextTasks[taskId];
          return { multiThreadTasks: nextTasks };
        });
        break;
      }

      case "llm.providers.loaded": {
        const { settings } = event.payload;
        set({ 
          llmProviders: settings.providers, 
          llmModels: settings.models,
          llmProviderSettings: settings
        });
        console.log('[AppStore] LLM providers loaded:', settings);
        break;
      }

      case "llm.providers.saved": {
        const { settings } = event.payload;
        set({ 
          llmProviders: settings.providers, 
          llmModels: settings.models,
          llmProviderSettings: settings
        });
        console.log('[AppStore] LLM providers saved:', settings);
        break;
      }

      case "llm.models.fetched": {
        const { models } = event.payload;
        console.log('[AppStore] LLM models fetched:', models);
        break;
      }

      case "llm.models.error": {
        const { message } = event.payload;
        console.error('[AppStore] LLM models error:', message);
        break;
      }

      case "llm.models.checked": {
        const { unavailableModels } = event.payload;
        console.log('[AppStore] LLM models checked, unavailable:', unavailableModels);
        break;
      }

      case "settings.loaded": {
        const { settings } = event.payload;
        set({ apiSettings: settings });
        console.log('[AppStore] Settings loaded:', settings);
        break;
      }

      // Scheduler default model loaded
      case "scheduler.default_model.loaded": {
        const { modelId } = event.payload;
        set({ schedulerDefaultModel: modelId });
        break;
      }

      // Scheduler default temperature loaded
      case "scheduler.default_temperature.loaded": {
        const { temperature, sendTemperature } = event.payload;
        set({
          schedulerDefaultTemperature: temperature,
          schedulerDefaultSendTemperature: sendTemperature
        });
        break;
      }

      // Scheduler task execution - auto-start session with prompt
      case "scheduler.task_execute": {
        const { title, prompt } = event.payload as any;
        if (prompt) {
          // Use scheduler default model, or fallback to first enabled model
          const { schedulerDefaultModel, llmModels, apiSettings } = get();
          let model = schedulerDefaultModel;
          
          if (!model) {
            const enabledModels = llmModels.filter(m => m.enabled);
            model = enabledModels.length > 0 ? enabledModels[0].id : null;
          }
          
          if (!model) {
            console.warn(`[scheduler] ✗ No model configured for task: ${title}`);
            break;
          }
          
          console.log(`[scheduler] ▶ Executing task: ${title} (model: ${model})`);
          getPlatform().sendClientEvent({
            type: "session.start",
            payload: {
              title: `Scheduled: ${title}`,
              prompt: prompt,
              model: model,
              cwd: undefined,
              enableSessionGitRepo: apiSettings?.enableSessionGitRepo ?? false,
            }
          });
        }
        break;
      }
    }
  }
}));
