
/**
 * OpenAI-based runner
 * Gives us full control over requests, tools, and streaming
 */

import OpenAI from 'openai';
import type { ServerEvent, Attachment } from "../types.js";
import type { Session } from "./session-store.js";
import { loadApiSettings } from "./settings-store.js";
import { loadLLMProviderSettings } from "./llm-providers-store.js";
import { TOOLS, getTools, generateToolsSummary } from "./tools-definitions.js";
import { getInitialPrompt, getSystemPrompt } from "./prompt-loader.js";
import { getTodosSummary, getTodos, setTodos, clearTodos } from "./tools/manage-todos-tool.js";
import { ToolExecutor } from "./tools-executor.js";
import type { FileChange } from "../types.js";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { isGitRepo, getRelativePath, getFileDiffStats } from "../git-utils.js";
import { join, resolve } from "path";
import { homedir } from "os";
import { executionLogger } from "./execution-logger.js";
import {
  createChangePreview,
  createPreviewBatch,
  requestPreviewApproval,
  type PreviewBatchResult
} from "./preview-manager.js";
import { validateSession, formatValidationResult } from "./session-validation.js";
import { 
  checkActionCompliance, 
  createActionIntent, 
  formatComplianceResult,
  type ComplianceResult 
} from "./compliance-gate.js";
import {
  DEFAULT_CONTEXT_CONFIG,
  estimateTokensForChatMessages,
  getCompactionCutoffIndex,
  getUsageRatio,
  loadSessionMemory,
  pruneChatMessages,
  runMemoryFlush,
  summarizeForCompaction
} from "./context-manager.js";

// Helper function to save attachment to disk
function saveAttachmentToDisk(attachment: Attachment, cwd: string): string | null {
  if (!cwd) return null;
  
  try {
    // Decode base64 data URL
    const matches = attachment.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      console.error(`[saveAttachment] Invalid data URL format for ${attachment.name}`);
      return null;
    }
    
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Save to workspace directory
    const filePath = join(cwd, attachment.name);
    writeFileSync(filePath, buffer);
    
    console.log(`[saveAttachment] Saved ${attachment.name} to ${filePath} (${buffer.length} bytes)`);
    return filePath;
  } catch (error) {
    console.error(`[saveAttachment] Failed to save ${attachment.name}:`, error);
    return null;
  }
}

export type RunnerOptions = {
  prompt: string;
  session: Session;
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: Partial<Session>) => void;
  attachments?: Attachment[];
};

export type RunnerHandle = {
  abort: () => void;
  resolvePermission: (toolUseId: string, approved: boolean) => void;
  resolvePreviewApproval: (approval: any) => void;
  resolvePreviewBatchApproval: (batchApproval: any) => void;
};

const DEFAULT_CWD = process.cwd();

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: any;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

// Logging - organized by session folders with turn-based request/response files
const getSessionLogsDir = (sessionId: string) => {
  const baseDir = join(homedir(), '.valera', 'logs', 'sessions', sessionId);
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
};

const logTurn = (sessionId: string, iteration: number, type: 'request' | 'response', data: any) => {
  try {
    const logsDir = getSessionLogsDir(sessionId);
    const paddedIteration = String(iteration).padStart(3, '0');
    const filename = `turn-${paddedIteration}-${type}.json`;
    const filepath = join(logsDir, filename);
    
    writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    
    if (type === 'request' && iteration === 1) {
    }
  } catch (error) {
    console.error(`[OpenAI Runner] Failed to write ${type} log:`, error);
  }
};

const redactMessagesForLog = (messages: ChatMessage[]) => {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;

    const sanitized = message.content.map((item: any) => {
      if (item?.type !== 'image_url' || !item.image_url?.url) return item;
      const url = item.image_url.url;
      const placeholder = typeof url === 'string' && url.startsWith('data:')
        ? 'data:image/webp;base64,<redacted>'
        : url;
      return {
        ...item,
        image_url: {
          ...item.image_url,
          url: placeholder
        }
      };
    });

    return { ...message, content: sanitized };
  });
};


export async function runOpenAI(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, session, onEvent, onSessionUpdate, attachments } = options;
  // Initialize execution logger for this session
  executionLogger.setSession(session.id);

  // Helper to send debug logs to UI
  const sendDebugLog = (message: string, data?: any) => {
    try {
      onEvent({
        type: "stream.message" as any,
        payload: {
          sessionId: session.id,
          message: {
            type: 'system',
            subtype: 'debug',
            text: `[DEBUG] ${message}${data ? `: ${JSON.stringify(data)}` : ''}`
          } as any
        }
      });
    } catch (e) {
      // Ignore errors in debug logging
    }
  };

  // Debug: log attachments received
  console.log(`[runner] attachments received:`, attachments?.length ?? 0, attachments?.map(a => ({ type: a.type, name: a.name, size: a.dataUrl?.length })) ?? []);
  let aborted = false;
  const abortController = new AbortController();
  const MAX_STREAM_RETRIES = 3;
  const RETRY_BASE_DELAY_MS = 500;

  // Token tracking (declare outside try block for catch access)
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // CRITICAL: Clear todos from any previous session FIRST
  // They will be restored from DB if this is an existing session
  clearTodos(session.id);

  // Session startup validation (Charter + ADR integrity)
  const sessionStore = (global as any).sessionStore;
  const sessionData = typeof sessionStore?.getSession === 'function'
    ? sessionStore.getSession(session.id)
    : undefined;
  if (sessionData) {
    const validationResult = validateSession({
      charter: sessionData.charter,
      charterHash: sessionData.charterHash,
      adrs: sessionData.adrs
    });
    
    if (!validationResult.valid) {
      // Log validation errors but don't block execution
      console.warn('[runner] Session validation failed:', validationResult.errors);
      onEvent({
        type: "stream.message" as any,
        payload: {
          sessionId: session.id,
          message: {
            type: 'system',
            subtype: 'warning',
            text: formatValidationResult(validationResult)
          } as any
        }
      });
    } else if (validationResult.warnings.length > 0) {
      // Log warnings
      console.log('[runner] Session validation warnings:', validationResult.warnings);
    }
  }

  // Permission tracking
  const pendingPermissions = new Map<string, { resolve: (approved: boolean) => void }>();

  const sendMessage = (type: string, content: any) => {
    onEvent({
      type: "stream.message" as any,
      payload: { sessionId: session.id, message: { type, ...content } as any }
    });
  };

  // Save to DB without triggering UI updates
  const saveToDb = (type: string, content: any) => {
    const sessionStoreLocal = (global as any).sessionStore;
    if (sessionStoreLocal && session.id) {
      sessionStoreLocal.recordMessage(session.id, { type, ...content });
    }
  };

  const sendPermissionRequest = (toolUseId: string, toolName: string, input: unknown, explanation?: string) => {
    onEvent({
      type: "permission.request",
      payload: { sessionId: session.id, toolUseId, toolName, input, explanation }
    });
  };

  const resolvePermission = (toolUseId: string, approved: boolean) => {
    const pending = pendingPermissions.get(toolUseId);
    if (pending) {
      pending.resolve(approved);
      pendingPermissions.delete(toolUseId);
    }
  };

  // Store last error body for error handling
  let lastErrorBody: string | null = null;

  const sendSystemNotice = (text: string) => {
    sendMessage('system', { subtype: 'notice', text });
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const isRetryableNetworkError = (error: unknown): boolean => {
    if (!error) return false;
    const err = error as any;
    const message = String(err.message || '').toLowerCase();
    const causeMessage = String(err.cause?.message || '').toLowerCase();
    const code = err.cause?.code || err.code;
    const status = err.status || err.statusCode;

    if (code && ['UND_ERR_SOCKET', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNABORTED', 'ENETRESET', 'ECONNREFUSED'].includes(code)) {
      return true;
    }
    if (status && [408, 429, 500, 502, 503, 504].includes(Number(status))) {
      return true;
    }
    if (message.includes('terminated') || message.includes('fetch failed')) {
      return true;
    }
    if (message.includes('socket') || causeMessage.includes('other side closed')) {
      return true;
    }
    return false;
  };

  // Start the query in the background
  (async () => {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterationCount = 0;
    let sessionStartTime = Date.now();

    try {
      // Determine if model is from LLM provider (contains ::)
      const isLLMProviderModel = session.model?.includes('::');
      
      let apiKey: string;
      let baseURL: string;
      let modelName: string;
      let temperature: number | undefined;
      let providerInfo = '';
      let modelContextLength: number | undefined;
      
      if (isLLMProviderModel && session.model) {
        // Extract provider ID and model ID
        const [providerId, modelId] = session.model.split('::');
        
        // Load LLM provider settings
        const llmSettings = loadLLMProviderSettings();
        
        if (!llmSettings) {
          throw new Error('LLM Provider settings not found. Please configure providers in Settings (⚙️).');
        }
        
        // Find the provider
        const provider = llmSettings.providers.find(p => p.id === providerId);
        
        if (!provider) {
          throw new Error(`Provider ${providerId} not found. Please check your LLM provider settings.`);
        }
        
        // Set up API configuration from provider
        apiKey = provider.apiKey;
        
        // Determine base URL based on provider type
        if (provider.type === 'openrouter') {
          baseURL = 'https://openrouter.ai/api/v1';
        } else if (provider.type === 'zai') {
          const prefix = provider.zaiApiPrefix === 'coding' ? 'api/coding/paas' : 'api/paas';
          baseURL = `https://api.z.ai/${prefix}/v4`;
        } else {
          baseURL = provider.baseUrl || '';
        }
        
        modelName = modelId;
        temperature = session.temperature; // undefined means don't send
        providerInfo = `${provider.name} (${provider.type})`;
        modelContextLength = llmSettings?.models?.find(m => m.id === modelId && m.providerId === providerId)?.contextLength;
      } else {
        // Use legacy API settings (apiKey/baseURL from file; model from session or file)
        const guiSettings = loadApiSettings();
        
        if (!guiSettings || !guiSettings.baseUrl) {
          throw new Error('API settings not configured. Please set Base URL (and API Key) in Settings (⚙️).');
        }
        
        if (!guiSettings.apiKey) {
          throw new Error('API Key is missing. Please configure it in Settings (⚙️).');
        }

        apiKey = guiSettings.apiKey;
        baseURL = guiSettings.baseUrl;
        modelName = session.model || guiSettings.model || '';
        if (!modelName) {
          throw new Error('Model not set. Set default model in Settings or Scheduler default model (⚙️).');
        }
        temperature = session.temperature; // undefined means don't send
        providerInfo = 'Legacy API';
        modelContextLength = undefined;
      }

      const debug = !!(process.env.VALERA_DEBUG || process.env.DEBUG);
      if (debug) {
        console.error('[OpenAI Runner] Debug: session.model=%s modelName=%s baseURL=%s provider=%s', session.model ?? '', modelName, baseURL, providerInfo);
      }
      
      // Load legacy settings for other configuration (tools, permissions, etc)
      const guiSettings = loadApiSettings();
      // Tools that call OpenAI-compatible APIs should use the *current* provider credentials/baseURL.
      const toolApiSettings = { ...(guiSettings || {}), apiKey, baseUrl: baseURL };
      const contextConfig = {
        ...DEFAULT_CONTEXT_CONFIG,
        contextWindowTokens: modelContextLength || DEFAULT_CONTEXT_CONFIG.contextWindowTokens
      };

      // Custom fetch to capture error response bodies
      const originalFetch = global.fetch;
      const customFetch = async (url: any, options: any) => {
        const response = await originalFetch(url, options);
        
        // Clone response to read body for errors
        if (!response.ok && response.status >= 400) {
          const clonedResponse = response.clone();
          try {
            const errorBody = await clonedResponse.text();
            console.error(`[OpenAI Runner] API Error Response (${response.status}):`, errorBody);
            // Store for catch block
            lastErrorBody = errorBody;
          } catch (e) {
            console.error('[OpenAI Runner] Failed to read error body:', e);
          }
        }
        
        return response;
      };

      // Initialize OpenAI client with custom fetch and timeout
      const REQUEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for long operations
      const client = new OpenAI({
        apiKey: apiKey || 'dummy-key',
        baseURL: baseURL,
        dangerouslyAllowBrowser: false,
        fetch: customFetch as any,
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: 2
      });

      // Create scheduler IPC callback for Tauri mode
      // This callback sends events through the session's onEvent handler
      // Scheduler operations are handled by Rust backend
      const schedulerIPCCallback = async (
        operation: "create" | "list" | "delete" | "update",
        params: Record<string, any>
      ): Promise<{ success: boolean; data?: any; error?: string }> => {
        return new Promise((resolve) => {
          // Generate unique request ID
          const requestId = `scheduler-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          
          // Set up a timeout to avoid hanging forever
          const timeout = setTimeout(() => {
            resolve({ success: false, error: "Scheduler request timed out" });
          }, 5000);
          
          // Store the resolve function to call when response arrives
          (global as any).schedulerPendingRequests = (global as any).schedulerPendingRequests || {};
          (global as any).schedulerPendingRequests[requestId] = (result: any) => {
            clearTimeout(timeout);
            delete (global as any).schedulerPendingRequests[requestId];
            resolve(result);
          };
          
          // Emit the scheduler request through the event system
          onEvent({
            type: "scheduler.request" as any,
            payload: {
              requestId,
              operation,
              params
            }
          });
        });
      };

      // Initialize tool executor with API settings for web tools
      // If no cwd, pass empty string to enable "no workspace" mode
      const toolExecutor = new ToolExecutor(session.cwd || '', toolApiSettings as any, schedulerIPCCallback);

      // Build conversation history from session
      const currentCwd = session.cwd || 'No workspace folder';
      
      // Function to load memory
      const loadMemory = async (): Promise<string | undefined> => {
        if (guiSettings?.enableMemory === false) return undefined;
        
        try {
          const { readFile, access } = await import('fs/promises');
          const { constants } = await import('fs');
          const { join } = await import('path');
          const { homedir } = await import('os');
          
          const memoryPath = join(homedir(), '.valera', 'memory.md');
          
          await access(memoryPath, constants.F_OK);
          const content = await readFile(memoryPath, 'utf-8');
          return content;
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            console.warn('[OpenAI Runner] Failed to load memory:', error.message);
          }
          return undefined;
        }
      };
      
      // Load memory initially
      let memoryContent = await loadMemory();

      const buildImageContents = async (items?: Attachment[]) => {
        if (!items || items.length === 0) return [];

        const results: Array<{ type: "image_url"; image_url: { url: string } }> = [];
        for (const item of items) {
          if (!item || item.type !== "image") continue;

          if (item.dataUrl) {
            results.push({ type: "image_url", image_url: { url: item.dataUrl } });
            continue;
          }

          if (!item.path) continue;
          if (!guiSettings?.enableImageTools) {
            console.warn("[OpenAI Runner] Image attachments ignored (enableImageTools is off).");
            continue;
          }

          const result = await toolExecutor.executeTool("attach_image", {
            explanation: "Attach image",
            file_path: item.path
          });
          if (result.success && result.data && (result.data as any).dataUrl) {
            results.push({ type: "image_url", image_url: { url: (result.data as any).dataUrl } });
          } else {
            console.warn("[OpenAI Runner] Failed to attach image:", result.error || "unknown error");
          }
        }
        return results;
      };

      const resolveAttachmentPath = (item: Attachment): string | null => {
        if (item.path) {
          return currentCwd && currentCwd !== 'No workspace folder'
            ? join(currentCwd, item.path)
            : item.path;
        }
        if (!currentCwd || currentCwd === 'No workspace folder' || !item.dataUrl) return null;
        return saveAttachmentToDisk(item, currentCwd);
      };

      const buildUserContent = async (
        promptText: string,
        includeMemory: boolean,
        items?: Attachment[]
      ) => {
        const hasItems = Array.isArray(items) && items.length > 0;
        const safePrompt = promptText.trim().length > 0
          ? promptText
          : hasItems
            ? "User attached file(s)."
            : promptText;
        const formattedPrompt = includeMemory
          ? getInitialPrompt(safePrompt, memoryContent)
          : getInitialPrompt(safePrompt);

        if (!hasItems) return formattedPrompt;

        type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
        const content: ContentPart[] = [];
        if (formattedPrompt) {
          content.push({ type: "text", text: formattedPrompt });
        }

        const imageContents = await buildImageContents(items);
        if (imageContents.length > 0) {
          content.push(...imageContents);
        }

        for (const item of items) {
          if (!item) continue;
          if (item.type === "image") {
            const savedPath = resolveAttachmentPath(item);
            if (savedPath) {
              content.push({
                type: "text",
                text: `[Image saved to: ${savedPath}]\nUse this path if you need to edit or process the image with tools.`
              });
            }
          } else if (item.type === "video" || item.type === "audio") {
            const savedPath = resolveAttachmentPath(item);
            if (savedPath) {
              content.push({
                type: "text",
                text: `[Attached ${item.type} file: ${item.name}]\nThe file has been saved to: ${savedPath}\nYou can now access it using bash, ffmpeg, or other tools.`
              });
            } else {
              content.push({
                type: "text",
                text: `[Attached ${item.type}: ${item.name}]\n⚠️ File could not be saved to workspace. ${currentCwd && currentCwd !== 'No workspace folder' ? 'Save failed.' : 'No workspace directory configured.'}`
              });
            }
          }
        }

        return content;
      };
      
      // Get initial tools for system prompt
      const initialTools = getTools(guiSettings);
      const initialToolsSummary = generateToolsSummary(initialTools);
      
      // Build system prompt with tools summary and optional todos
      let systemContent = getSystemPrompt(currentCwd, initialToolsSummary);
      const todosSummary = getTodosSummary(session.id);
      if (todosSummary) {
        systemContent += todosSummary;
      }
      const sessionMemory = loadSessionMemory(
        session.cwd && session.cwd !== 'No workspace folder' ? session.cwd : undefined
      );
      if (sessionMemory.trim()) {
        systemContent += `\n\nSESSION MEMORY:\n${sessionMemory}\n\n---\n`;
      }

      const sessionStore = (global as any).sessionStore;
      let lastUserPrompt = '';
      let lastUserPromptHadAttachments = false;
      let isFirstUserPrompt = true;

      const buildMessagesFromHistory = async (historyMessages: any[]) => {
        const builtMessages: ChatMessage[] = [
          {
            role: 'system',
            content: systemContent
          }
        ];

        let currentAssistantText = '';
        let currentToolCalls: any[] = [];
        let pendingToolResults: Map<string, { output: string; isError: boolean }> = new Map();

        for (const msg of historyMessages) {
          if (msg.type === 'system_summary') {
            if (currentAssistantText.trim() || currentToolCalls.length > 0) {
              const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: currentAssistantText.trim() || ''
              };
              if (currentToolCalls.length > 0) {
                assistantMsg.tool_calls = currentToolCalls;
              }
              builtMessages.push(assistantMsg);
              for (const tc of currentToolCalls) {
                const result = pendingToolResults.get(tc.id);
                if (result) {
                  builtMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    name: tc.function.name,
                    content: result.isError ? `Error: ${result.output}` : result.output
                  });
                }
              }
              currentAssistantText = '';
              currentToolCalls = [];
              pendingToolResults.clear();
            }

            builtMessages.push({
              role: 'system',
              content: `[System Summary]\n${(msg as any).summary || ''}`.trim()
            });
            continue;
          }

          if (msg.type === 'user_prompt') {
            const promptText = (msg as any).prompt || '';
            const promptAttachments = (msg as any).attachments as Attachment[] | undefined;
            const hasPromptAttachments = Array.isArray(promptAttachments) && promptAttachments.length > 0;

            if (currentAssistantText.trim() || currentToolCalls.length > 0) {
              const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: currentAssistantText.trim() || ''
              };
              if (currentToolCalls.length > 0) {
                assistantMsg.tool_calls = currentToolCalls;
              }
              builtMessages.push(assistantMsg);

              for (const tc of currentToolCalls) {
                const result = pendingToolResults.get(tc.id);
                if (result) {
                  builtMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    name: tc.function.name,
                    content: result.isError ? `Error: ${result.output}` : result.output
                  });
                }
              }

              currentAssistantText = '';
              currentToolCalls = [];
              pendingToolResults.clear();
            }

            lastUserPrompt = promptText;
            lastUserPromptHadAttachments = hasPromptAttachments;

            const userContent = await buildUserContent(
              promptText,
              isFirstUserPrompt,
              (msg as any).attachments
            );
            isFirstUserPrompt = false;
            builtMessages.push({
              role: 'user',
              content: userContent
            });
          } else if (msg.type === 'text') {
            currentAssistantText += (msg as any).text || '';
          } else if (msg.type === 'tool_use') {
            const toolId = (msg as any).id || `call_${Date.now()}_${currentToolCalls.length}`;
            const toolName = (msg as any).name || 'unknown';
            const toolInput = (msg as any).input || {};

            currentToolCalls.push({
              id: toolId,
              type: 'function',
              function: {
                name: toolName,
                arguments: JSON.stringify(toolInput)
              }
            });
          } else if (msg.type === 'tool_result') {
            const toolUseId = (msg as any).tool_use_id;
            const output = (msg as any).output || '';
            const isError = (msg as any).is_error || false;

            if (toolUseId) {
              pendingToolResults.set(toolUseId, { output, isError });
            }
          }
        }

        if (currentAssistantText.trim() || currentToolCalls.length > 0) {
          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: currentAssistantText.trim() || ''
          };
          if (currentToolCalls.length > 0) {
            assistantMsg.tool_calls = currentToolCalls;
          }
          builtMessages.push(assistantMsg);

          for (const tc of currentToolCalls) {
            const result = pendingToolResults.get(tc.id);
            if (result) {
              builtMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: tc.function.name,
                content: result.isError ? `Error: ${result.output}` : result.output
              });
            }
          }
        }

        return builtMessages;
      };

      let historyMessages: any[] = [];
      if (sessionStore && session.id) {
        const history = sessionStore.getSessionHistory(session.id);
        historyMessages = history?.messages || [];

        clearTodos(session.id);
        if (history && history.todos && history.todos.length > 0) {
          setTodos(session.id, history.todos);
        }
      }

      let messages = await buildMessagesFromHistory(historyMessages);

      const addCurrentPromptIfNeeded = async () => {
        const currentHasAttachments = Array.isArray(attachments) && attachments.length > 0;
        if (prompt !== lastUserPrompt || (currentHasAttachments && !lastUserPromptHadAttachments)) {
          const shouldAddMemory = messages.length === 1;
          const userContent = await buildUserContent(prompt, shouldAddMemory, attachments);
          messages.push({
            role: 'user',
            content: userContent
          });
        }
      };

      await addCurrentPromptIfNeeded();

      const estimatedTokens = estimateTokensForChatMessages(messages);
      const usageRatio = getUsageRatio(estimatedTokens, contextConfig);

      if (sessionStore && session.id && usageRatio >= contextConfig.memoryFlushRatio) {
        try {
          await runMemoryFlush({
            client,
            model: modelName,
            messages: historyMessages as any,
            sessionCwd: session.cwd && session.cwd !== 'No workspace folder' ? session.cwd : undefined,
            config: contextConfig
          });
        } catch (error) {
          console.warn('[OpenAI Runner] Memory flush failed:', error);
        }
      }

      if (sessionStore && session.id && usageRatio >= contextConfig.compactionRatio) {
        try {
          const cutoffIndex = getCompactionCutoffIndex(historyMessages as any, contextConfig.keepLastTurns);
          if (cutoffIndex >= 0) {
            const summaryText = await summarizeForCompaction({
              client,
              model: modelName,
              messages: historyMessages.slice(0, cutoffIndex + 1) as any,
              config: contextConfig
            });
            if (summaryText) {
              sessionStore.replaceMessagesBeforeIndexWithSummary(session.id, cutoffIndex, summaryText);
              const updatedHistory = sessionStore.getSessionHistory(session.id);
              historyMessages = updatedHistory?.messages || historyMessages;
              lastUserPrompt = '';
              lastUserPromptHadAttachments = false;
              isFirstUserPrompt = true;
              messages = await buildMessagesFromHistory(historyMessages);
              await addCurrentPromptIfNeeded();
            }
          }
        } catch (error) {
          console.warn('[OpenAI Runner] Compaction failed:', error);
        }
      }

      // Track total usage across all iterations
      totalInputTokens = 0;
      totalOutputTokens = 0;
      sessionStartTime = Date.now();

      // Use initial tools (will be refreshed each iteration)
      let activeTools = initialTools;
      let currentGuiSettings = guiSettings;
      
      // Debug: log final messages structure before API call
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'user' && Array.isArray(lastMsg.content)) {
        console.log(`[runner] user message has ${lastMsg.content.length} content parts:`, lastMsg.content.map((c: any) => c.type));
      }
      
      console.log(`\n[runner] → ${modelName} | ${activeTools.length} tools | ${messages.length} msgs`);

      // Send system init message
      sendMessage('system', {
        subtype: 'init',
        cwd: session.cwd || 'No workspace folder',
        session_id: session.id,
        tools: activeTools.map(t => t.function.name),
        model: modelName,
        permissionMode: currentGuiSettings?.permissionMode || 'ask',
        memoryEnabled: currentGuiSettings?.enableMemory || false
      });

      // Main agent loop
      iterationCount = 0;
      const MAX_ITERATIONS = 50;
      
      // Loop detection: track recent tool calls
      const recentToolCalls: { name: string; args: string }[] = [];
      const LOOP_DETECTION_WINDOW = 5; // Check last N tool calls
      const LOOP_THRESHOLD = 5; // Same tool called N times = loop
      const MAX_LOOP_RETRIES = 5; // Max retries before stopping
      let loopRetryCount = 0;
      let loopHintAdded = false;

      while (!aborted && iterationCount < MAX_ITERATIONS) {
        iterationCount++;
        
        // Reload settings to pick up any changes (e.g. Tavily API key, memory enabled)
        const freshSettings = loadApiSettings();
        if (freshSettings) {
          const newTools = getTools(freshSettings);
          const oldToolNames = activeTools.map(t => t.function.name).sort().join(',');
          const newToolNames = newTools.map(t => t.function.name).sort().join(',');
          
          if (oldToolNames !== newToolNames) {
            activeTools = newTools;
            currentGuiSettings = freshSettings;
            // Update tool executor with new settings
            toolExecutor.updateSettings(freshSettings);
          }
        }
        
        // Update system prompt with current tools summary and todos
        const currentToolsSummary = generateToolsSummary(activeTools);
        const updatedTodosSummary = getTodosSummary(session.id);
        let updatedSystemContent = getSystemPrompt(currentCwd, currentToolsSummary);
        if (updatedTodosSummary) {
          updatedSystemContent += updatedTodosSummary;
        }
        const updatedSessionMemory = loadSessionMemory(
          session.cwd && session.cwd !== 'No workspace folder' ? session.cwd : undefined
        );
        if (updatedSessionMemory.trim()) {
          updatedSystemContent += `\n\nSESSION MEMORY:\n${updatedSessionMemory}\n\n---\n`;
        }
        messages[0] = { role: 'system', content: updatedSystemContent };
        
        const iterationStartTime = Date.now();
        console.log(`[runner] iteration ${iterationCount}`);
        
        // Log iteration start
        executionLogger.logIteration({
          iteration: iterationCount,
          action: 'start',
          totalInputTokens,
          totalOutputTokens,
          elapsedMs: Date.now() - sessionStartTime
        });

        // Log LLM request
        executionLogger.logLLMRequest({
          model: modelName,
          messageCount: messages.length,
          toolCount: activeTools.length,
          hasAttachments: messages.some(m => Array.isArray(m.content) && 
            m.content.some((c: any) => c.type === 'image_url'))
        });

        const requestMessages = pruneChatMessages(messages, contextConfig);

        // Log request to file
        const requestPayload = {
          model: modelName,
          messages: redactMessagesForLog(requestMessages),
          tools: activeTools,
          temperature,
          timestamp: new Date().toISOString()
        };
        logTurn(session.id, iterationCount, 'request', requestPayload);

        const runStreamWithRetries = async () => {
          let lastError: unknown;

          for (let attempt = 0; attempt <= MAX_STREAM_RETRIES; attempt++) {
            let assistantMessage = '';
            let assistantThinking = '';
            let toolCalls: any[] = [];
            let contentStarted = false;
            let streamMetadata: { id?: string; model?: string; created?: number; finishReason?: string; usage?: any } = {};

            try {
              if (debug) {
                const reqUrl = `${baseURL.replace(/\/$/, '')}/chat/completions`;
                console.error('[OpenAI Runner] Debug: request model=%s url=%s', modelName, reqUrl);
              }
              const stream = await client.chat.completions.create({
                model: modelName,
                messages: requestMessages as any[],
                tools: activeTools as any[],
                stream: true,
                parallel_tool_calls: true,
                stream_options: { include_usage: true },
                ...(temperature !== undefined ? { temperature } : {})
              }, { signal: abortController.signal });

              for await (const chunk of stream) {
                if (aborted) {
                  console.log('[runner] ✗ aborted');
                  break;
                }

                if (!streamMetadata.id && chunk.id) {
                  streamMetadata.id = chunk.id;
                  streamMetadata.model = chunk.model;
                  streamMetadata.created = chunk.created;
                }
                if (chunk.choices?.[0]?.finish_reason) {
                  streamMetadata.finishReason = chunk.choices[0].finish_reason;
                }
                if (chunk.usage) {
                  streamMetadata.usage = chunk.usage;
                }

                const delta = chunk.choices[0]?.delta;
                if (!delta) continue;

                const thinkingDelta = (delta as any).thinking ?? (delta as any).reasoning ?? (delta as any).reasoning_content;
                if (typeof thinkingDelta === 'string' && thinkingDelta) {
                  assistantThinking += thinkingDelta;
                }

                if (delta.content) {
                  if (!contentStarted) {
                    contentStarted = true;
                    sendMessage('stream_event', {
                      event: {
                        type: 'content_block_start',
                        content_block: {
                          type: 'text',
                          text: ''
                        },
                        index: 0
                      }
                    });
                  }

                  assistantMessage += delta.content;
                  sendMessage('stream_event', {
                    event: {
                      type: 'content_block_delta',
                      delta: {
                        type: 'text_delta',
                        text: delta.content
                      },
                      index: 0
                    }
                  });
                }

                if (delta.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    if (toolCall.index !== undefined) {
                      if (!toolCalls[toolCall.index]) {
                        toolCalls[toolCall.index] = {
                          id: toolCall.id || `call_${Date.now()}_${toolCall.index}`,
                          type: 'function',
                          function: {
                            name: toolCall.function?.name || '',
                            arguments: toolCall.function?.arguments || ''
                          }
                        };
                      } else if (toolCall.function?.arguments) {
                        toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
                      }
                    }
                  }
                }
              }

              if (contentStarted) {
                sendMessage('stream_event', {
                  event: {
                    type: 'content_block_stop',
                    index: 0
                  }
                });
              }

              return { assistantMessage, assistantThinking, toolCalls, streamMetadata };
            } catch (error) {
              lastError = error;
              const retryable = isRetryableNetworkError(error);

              if (contentStarted) {
                sendMessage('stream_event', {
                  event: {
                    type: 'content_block_stop',
                    index: 0
                  }
                });
              }

              if (aborted || !retryable || attempt === MAX_STREAM_RETRIES) {
                const finalError = error instanceof Error ? error : new Error(String(error));
                (finalError as any).retryable = retryable;
                (finalError as any).retryAttempts = Math.min(attempt, MAX_STREAM_RETRIES);
                throw finalError;
              }

              const delayMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
              sendSystemNotice(`Network error detected. Retrying (${attempt + 1}/${MAX_STREAM_RETRIES})...`);
              console.warn(`[OpenAI Runner] Stream error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_STREAM_RETRIES})`, error);
              await sleep(delayMs);
            }
          }

          throw lastError ?? new Error('Unknown stream error');
        };

        const { assistantMessage, assistantThinking, toolCalls, streamMetadata } = await runStreamWithRetries();

        // Check if aborted during stream
        if (aborted) {
          if (onSessionUpdate) {
            onSessionUpdate({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens });
          }
          onEvent({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "idle",
              title: session.title
            }
          });
          return;
        }
        
        // Accumulate token usage
        if (streamMetadata.usage) {
          totalInputTokens += streamMetadata.usage.prompt_tokens ?? streamMetadata.usage.input_tokens ?? 0;
          totalOutputTokens += streamMetadata.usage.completion_tokens ?? streamMetadata.usage.output_tokens ?? 0;
        }
        
        const normalizedToolCalls = toolCalls.filter(Boolean);

        if (assistantThinking?.trim()) {
          const MAX_THINKING_CHARS = 50_000;
          const truncatedThinking = assistantThinking.length > MAX_THINKING_CHARS
            ? assistantThinking.slice(0, MAX_THINKING_CHARS) + `\n... [truncated ${assistantThinking.length - MAX_THINKING_CHARS} chars]`
            : assistantThinking;
          executionLogger.logReasoning(truncatedThinking, `iteration=${iterationCount} model=${modelName}`);
        }

        executionLogger.logLLMResponse({
          finishReason: streamMetadata.finishReason || '',
          textLength: assistantMessage.length,
          toolCallsCount: normalizedToolCalls.length,
          thinkingLength: assistantThinking?.length || 0,
          inputTokens: streamMetadata.usage?.prompt_tokens,
          outputTokens: streamMetadata.usage?.completion_tokens,
          durationMs: Date.now() - iterationStartTime
        });

        // Log response to file
        const responsePayload = {
          id: streamMetadata.id,
          model: streamMetadata.model,
          finish_reason: streamMetadata.finishReason,
          usage: streamMetadata.usage,
          message: {
            role: 'assistant',
            content: assistantMessage || null,
            tool_calls: normalizedToolCalls.length > 0 ? normalizedToolCalls : undefined
          },
          thinking: assistantThinking || undefined,
          timestamp: new Date().toISOString()
        };
        logTurn(session.id, iterationCount, 'response', responsePayload);
        
        
        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          
          // Send assistant message for UI display
          sendMessage('assistant', {
            message: {
              id: `msg_${Date.now()}`,
              content: [{ type: 'text', text: assistantMessage }]
            }
          });

          // Save as 'text' type to DB (without triggering UI update)
          saveToDb('text', {
            text: assistantMessage,
            uuid: `msg_${Date.now()}_db`
          });

          sendMessage('result', {
            subtype: 'success',
            is_error: false,
            duration_ms: Date.now() - sessionStartTime,
            duration_api_ms: Date.now() - sessionStartTime, // Approximate API time
            num_turns: iterationCount,
            result: assistantMessage,
            session_id: session.id,
            total_cost_usd: 0,
            usage: {
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens
            }
          });

          onEvent({
            type: "session.status",
            payload: { sessionId: session.id, status: "completed", title: session.title }
          });

          break;
        }

        // LOOP DETECTION: Check if model is stuck calling same tool repeatedly
        // Skip loop detection for parallel tool calls (batches of 2+ tools)
        // Parallel batches are intentional, not loops - even if same tool called multiple times
        const isParallelBatch = toolCalls.length > 1;
        
        if (!isParallelBatch) {
          // Only track single tool calls
          const toolCall = toolCalls[0];
          const callSignature = { 
            name: toolCall.function.name, 
            args: toolCall.function.arguments || '' 
          };
          recentToolCalls.push(callSignature);
          
          // Keep only last N calls
          if (recentToolCalls.length > LOOP_DETECTION_WINDOW) {
            recentToolCalls.shift();
          }
        } else {
          // Parallel batch - clear loop detection (intentional parallel work)
          recentToolCalls.length = 0;
        }
        
        // Check for loops: same tool called LOOP_THRESHOLD times in a row
        if (recentToolCalls.length >= LOOP_THRESHOLD) {
          const lastCalls = recentToolCalls.slice(-LOOP_THRESHOLD);
          const allSameTool = lastCalls.every(c => c.name === lastCalls[0].name);
          
          if (allSameTool) {
            const loopedTool = lastCalls[0].name;
            loopRetryCount++;
            
            console.warn(`[OpenAI Runner] ⚠️ LOOP DETECTED: Tool "${loopedTool}" called ${LOOP_THRESHOLD}+ times (retry ${loopRetryCount}/${MAX_LOOP_RETRIES})`);
            
            // Check if we've exceeded max retries
            if (loopRetryCount >= MAX_LOOP_RETRIES) {
              console.error(`[OpenAI Runner] ❌ Loop not resolved after ${MAX_LOOP_RETRIES} retries. Stopping.`);
              
              // Send warning to UI
              sendMessage('text', {
                text: `⚠️ **Loop detected**: The model is stuck calling \`${loopedTool}\` repeatedly (${MAX_LOOP_RETRIES} retries exhausted).\n\nPlease try:\n- Rephrasing your request\n- Using a larger/smarter model\n- Breaking down your task into smaller steps`
              });
              
              // Save warning to DB
              saveToDb('text', {
                text: `[LOOP] Model stuck calling ${loopedTool} repeatedly. Stopped after ${loopRetryCount} retries.`,
                uuid: `loop_warning_${Date.now()}`
              });
              
              // End session with error
              sendMessage('result', {
                subtype: 'error',
                is_error: true,
                duration_ms: Date.now() - sessionStartTime,
                duration_api_ms: Date.now() - sessionStartTime,
                num_turns: iterationCount,
                result: `Loop not resolved: ${loopedTool} called repeatedly`,
                session_id: session.id,
                total_cost_usd: 0,
                usage: {
                  input_tokens: totalInputTokens,
                  output_tokens: totalOutputTokens
                }
              });

              if (onSessionUpdate) {
                onSessionUpdate({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens });
              }
              onEvent({
                type: "session.status",
                payload: {
                  sessionId: session.id,
                  status: "idle",
                  title: session.title
                }
              });

              return; // Exit the runner
            }
            
            // Add hint to help model break out of loop
            if (!loopHintAdded) {
              loopHintAdded = true;
            }
            
            // Clear recent calls to give model fresh start
            recentToolCalls.length = 0;
          }
        }

        // Add assistant message with tool calls to history
        messages.push({
          role: 'assistant',
          content: assistantMessage || '',
          tool_calls: toolCalls
        });

        // Save text response if any (before tool calls)
        if (assistantMessage.trim()) {
          saveToDb('text', {
            text: assistantMessage,
            uuid: `msg_text_${Date.now()}`
          });
        }

        // Helper to safely parse tool arguments
        const safeParseToolArgs = (args: string | undefined, toolName: string): Record<string, any> => {
          if (!args || args === '') return {};
          try {
            return JSON.parse(args);
          } catch (e) {
            console.error(`[OpenAI Runner] Failed to parse tool arguments for ${toolName}:`, args);
            // Try to fix common JSON issues
            try {
              // Sometimes model outputs truncated JSON, try to close it
              const fixed = args.replace(/,\s*$/, '') + '}';
              return JSON.parse(fixed);
            } catch {
              // Return error info as argument
              return { _parse_error: `Invalid JSON: ${args.substring(0, 200)}...` };
            }
          }
        };

        // Send tool use messages
        for (const toolCall of toolCalls) {
          const toolInput = safeParseToolArgs(toolCall.function.arguments, toolCall.function.name);
          
          console.log(`[OpenAI Runner] Creating tool_use message:`, {
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
            toolCallIdType: typeof toolCall.id,
            toolInputKeys: Object.keys(toolInput)
          });
          
          // For UI display - assistant message with tool_use
          sendMessage('assistant', {
            message: {
              id: `msg_${toolCall.id}`,
              content: [{
                type: 'tool_use',
                id: toolCall.id,
                name: toolCall.function.name,
                input: toolInput
              }]
            }
          });
          
          // For DB storage - tool_use type (without UI update)
          saveToDb('tool_use', {
            id: toolCall.id,
            name: toolCall.function.name,
            input: toolInput,
            uuid: `tool_${toolCall.id}`
          });
        }

        // Execute tools
        const toolResults: ChatMessage[] = [];
        const followUpMessages: ChatMessage[] = [];

        for (const toolCall of toolCalls) {
          if (aborted) {
            break;
          }

          const toolName = toolCall.function.name;
          const toolArgs = safeParseToolArgs(toolCall.function.arguments, toolName);

          // Check for parse error
          if (toolArgs._parse_error) {
            console.error(`[OpenAI Runner] Skipping tool ${toolName} due to parse error`);
            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error: Failed to parse tool arguments. ${toolArgs._parse_error}`
            });
            continue;
          }

          // Request permission
          const toolUseId = toolCall.id;
          // Reload settings to get latest permissionMode
          const currentSettings = loadApiSettings();
          const permissionMode = currentSettings?.permissionMode || 'ask';
          
          console.log(`[tool] ${toolName}`);
          
          const toolStartTime = Date.now();
          
          // Log tool execution start
          executionLogger.logToolExecution({
            toolName,
            toolUseId,
            input: toolArgs,
            status: 'start'
          });
          
          if (permissionMode === 'ask') {
            // Send permission request and wait for user approval
            sendPermissionRequest(toolUseId, toolName, toolArgs, toolArgs.explanation);
            
            // Log permission request
            executionLogger.logToolExecution({
              toolName,
              toolUseId,
              input: toolArgs,
              status: 'permission_required'
            });
            
            // Wait for permission result from UI with abort check
            const approved = await new Promise<boolean>((resolve) => {
              pendingPermissions.set(toolUseId, { resolve });
              
              // Check abort periodically
              const checkAbort = setInterval(() => {
                if (aborted) {
                  clearInterval(checkAbort);
                  pendingPermissions.delete(toolUseId);
                  resolve(false);
                }
              }, 100);
              
              // Clean up interval when resolved
              pendingPermissions.get(toolUseId)!.resolve = (approved: boolean) => {
                clearInterval(checkAbort);
                resolve(approved);
              };
            });
            
            if (aborted) {
              break;
            }
            
            if (!approved) {
              console.log(`[tool] ✗ ${toolName} denied`);
              
              // Log permission denied
              executionLogger.logToolExecution({
                toolName,
                toolUseId,
                input: toolArgs,
                status: 'error',
                error: 'Permission denied by user',
                durationMs: Date.now() - toolStartTime
              });
              
              // Add error result for denied tool
              toolResults.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: 'Error: Tool execution denied by user'
              });
              
              continue; // Skip this tool
            }
          }
          // In default mode, execute immediately without asking

          // Compliance gate: check action against charter constraints
          const currentSessionData = typeof sessionStore?.getSession === 'function'
            ? sessionStore.getSession(session.id)
            : undefined;
          if (currentSessionData?.charter) {
            const actionIntent = createActionIntent(toolName, toolArgs);
            const complianceResult: ComplianceResult = checkActionCompliance(actionIntent, {
              charter: currentSessionData.charter,
              adrs: currentSessionData.adrs
            });
            
            if (!complianceResult.allowed) {
              // Hard fail: block execution
              console.log(`[Compliance] Action blocked:`, complianceResult.reason);
              
              executionLogger.logToolExecution({
                toolName,
                toolUseId,
                input: toolArgs,
                status: 'error',
                error: `Compliance check failed: ${complianceResult.reason}`,
                durationMs: Date.now() - toolStartTime
              });
              
              // Notify user
              sendMessage('system', { 
                subtype: 'warning', 
                text: formatComplianceResult(complianceResult) 
              });
              
              toolResults.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: `Error: ${formatComplianceResult(complianceResult)}`
              });
              
              continue; // Skip this tool
            }
            
            if (complianceResult.status === 'soft_fail') {
              // Soft fail: warn but continue
              console.log(`[Compliance] Soft warning:`, complianceResult.warnings);
              sendMessage('system', { 
                subtype: 'info', 
                text: `⚠️ Compliance note: ${complianceResult.reason}` 
              });
            }
          }

          // Preview system: check if file modification tools need preview approval
          const previewTools = ['write_file', 'edit_file'];
          if (previewTools.includes(toolName) && currentSettings?.enablePreview && currentSettings?.previewMode !== 'never') {
            const filePath = toolArgs.file_path || toolArgs.path;
            const cwd = session.cwd || '';
            
            let oldContent = '';
            let newContent = toolArgs.content || '';
            let previewType: 'file_edit' | 'file_create' = 'file_create';
            
            try {
              if (toolName === 'edit_file' && cwd && filePath) {
                const fullPath = resolve(cwd, filePath);
                if (existsSync(fullPath)) {
                  oldContent = readFileSync(fullPath, 'utf-8');
                  // Apply the edit to get new content
                  if (oldContent.includes(toolArgs.old_string)) {
                    newContent = oldContent.replace(toolArgs.old_string, toolArgs.new_string);
                    previewType = 'file_edit';
                  }
                }
              }
            } catch (e) {
              console.warn(`[Preview] Failed to read file for preview: ${e}`);
            }
            
            // Create preview
            const preview = createChangePreview(previewType, filePath, {
              before: oldContent,
              after: newContent,
              description: toolArgs.explanation,
            });
            
            const batch = createPreviewBatch(session.id, toolCall.id, toolName, [preview]);
            
            console.log(`[Preview] Requesting approval for ${toolName}:`, filePath);
            
            // Request approval and wait
            const previewResult: PreviewBatchResult = await requestPreviewApproval(batch, onEvent);
            
            if (aborted) {
              break;
            }
            
            if (!previewResult.approved) {
              console.log(`[Preview] ${toolName} rejected by user`);
              
              // Log preview rejection
              executionLogger.logToolExecution({
                toolName,
                toolUseId,
                input: toolArgs,
                status: 'error',
                error: 'Preview rejected by user',
                durationMs: Date.now() - toolStartTime
              });
              
              toolResults.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: 'Error: File change rejected by user during preview'
              });
              
              continue;
            }
            
            // Check if user modified the content
            const previewItem = previewResult.previews[0];
            if (previewItem?.action === 'approve_modified' && previewItem.content) {
              console.log(`[Preview] User modified content for ${toolName}`);
              if (toolName === 'write_file') {
                toolArgs.content = previewItem.content;
              } else if (toolName === 'edit_file') {
                // For edit_file, user modified the final result
                // We need to recalculate old_string/new_string or use write mode
                toolArgs.content = previewItem.content;
                toolArgs._use_write_mode = true;
              }
            }
            
            console.log(`[Preview] ${toolName} approved, proceeding with execution`);
          }

          // Execute tool with callback for todos persistence
          // CRITICAL: Force flush stdout to ensure logs are visible
          console.log(`[OpenAI Runner] ========== EXECUTING TOOL ==========`);
          console.log(`[OpenAI Runner] Tool name:`, toolName);
          console.log(`[OpenAI Runner] Tool args keys:`, Object.keys(toolArgs));
          if (process.stdout && typeof (process.stdout as any).flush === 'function') {
            (process.stdout as any).flush();
          }
          sendDebugLog(`Executing tool: ${toolName}`, { toolName, toolArgsKeys: Object.keys(toolArgs) });
          
          const result = await toolExecutor.executeTool(toolName, toolArgs, {
            sessionId: session.id,
            onTodosChanged: (todos) => {
              // Save to DB
              if (sessionStore && session.id) {
                sessionStore.saveTodos(session.id, todos);
              }
              // Emit event for UI
              onEvent({
                type: 'todos.updated',
                payload: { sessionId: session.id, todos }
              });
            },
            onCharterChanged: (charter, charterHash) => {
              // Emit session status update with new charter
              const updatedSession = typeof sessionStore?.getSession === 'function'
                ? sessionStore.getSession(session.id)
                : undefined;
              if (updatedSession) {
                onEvent({
                  type: 'session.status',
                  payload: {
                    sessionId: session.id,
                    status: updatedSession.status,
                    title: updatedSession.title,
                    cwd: updatedSession.cwd,
                    model: updatedSession.model,
                    temperature: updatedSession.temperature,
                    charter,
                    charterHash,
                    adrs: updatedSession.adrs
                  }
                });
              }
            },
            onADRsChanged: (adrs) => {
              // Emit session status update with new ADRs
              const updatedSession = typeof sessionStore?.getSession === 'function'
                ? sessionStore.getSession(session.id)
                : undefined;
              if (updatedSession) {
                onEvent({
                  type: 'session.status',
                  payload: {
                    sessionId: session.id,
                    status: updatedSession.status,
                    title: updatedSession.title,
                    cwd: updatedSession.cwd,
                    model: updatedSession.model,
                    temperature: updatedSession.temperature,
                    charter: updatedSession.charter,
                    charterHash: updatedSession.charterHash,
                    adrs
                  }
                });
              }
            }
          });

          console.log(`[OpenAI Runner] ========== TOOL EXECUTED ==========`);
          console.log(`[OpenAI Runner] Tool name:`, toolName);
          console.log(`[OpenAI Runner] Result success:`, result.success);
          console.log(`[OpenAI Runner] Result error:`, result.error);
          console.log(`[OpenAI Runner] Has result.data:`, !!result.data);
          sendDebugLog(`Tool ${toolName} executed`, {
            success: result.success,
            hasData: !!result.data,
            hasError: !!result.error
          });
          
          // Log successful execution
          const resultOutput = result.success ? result.output : `Error: ${result.error}`;
          const truncatedResult = typeof resultOutput === 'string' && resultOutput.length > 500
            ? `${resultOutput.substring(0, 500)}... (truncated)`
            : resultOutput;
          executionLogger.logToolExecution({
            toolName,
            toolUseId,
            input: toolArgs,
            status: result.success ? 'success' : 'error',
            result: truncatedResult,
            durationMs: Date.now() - toolStartTime
          });

          if (toolName === 'attach_image' && result.success && result.data && (result.data as any).dataUrl) {
            const data = result.data as { dataUrl: string; fileName?: string };
            followUpMessages.push({
              role: 'user',
              content: [
                { type: 'text', text: `Attached image: ${data.fileName || 'image'}` },
                { type: 'image_url', image_url: { url: data.dataUrl } }
              ]
            });
          }

          // If Memory tool was executed successfully, reload memory for next iteration
          if (toolName === 'manage_memory' && result.success) {
            memoryContent = await loadMemory();
          }

          // Track file changes for write_file and edit_file
          if ((toolName === 'write_file' || toolName === 'edit_file') && result.success) {
            const filePath = toolArgs.file_path || toolArgs.path;
            const sessionStore = (global as any).sessionStore;
            
            if (filePath && session.cwd && sessionStore) {
              try {
                // Get relative path from project root
                let relativePath = filePath;
                if (isGitRepo(session.cwd)) {
                  relativePath = getRelativePath(filePath, session.cwd);
                } else {
                  // For non-git repos, use path relative to cwd
                  const { relative } = require('path');
                  try {
                    relativePath = relative(session.cwd, filePath) || filePath;
                  } catch {
                    relativePath = filePath;
                  }
                }

                let additions = 0;
                let deletions = 0;
                
                if (isGitRepo(session.cwd)) {
                  // Use git diff stats for file changes
                  const diffStats = getFileDiffStats(filePath, session.cwd);
                  additions = diffStats.additions;
                  deletions = diffStats.deletions;
                } else {
                  // For non-git repos, try to count lines from file (write_file only)
                  try {
                    const { readFile } = require('fs');
                    const { resolve } = require('path');
                    const fullFilePath = resolve(session.cwd, filePath);
                    const content = readFile(fullFilePath, 'utf-8');
                    const lineCount = content.split('\n').length;
                    // For write_file, all lines are additions
                    if (toolName === 'write_file') {
                      additions = lineCount;
                      deletions = 0;
                    }
                  } catch {
                    // File might not exist or be unreadable, skip tracking
                  }
                }

                // Track file changes if we have valid stats or if file was successfully created/edited
                // Always track if tool succeeded, even if stats are 0 (file might have been created empty or edited to same content)
                if (result.success && (additions > 0 || deletions > 0 || toolName === 'write_file')) {
                  // Create FileChange entry
                  const fileChange: FileChange = {
                    path: relativePath,
                    additions: additions,
                    deletions: deletions,
                    status: 'pending'
                  };
                  // Add to session store
                  sessionStore.addFileChanges(session.id, [fileChange]);
                  // Emit event for UI update
                  onEvent({
                    type: 'file_changes.updated',
                    payload: { sessionId: session.id, fileChanges: sessionStore.getFileChanges(session.id) }
                  });
                  
                  console.log(`[OpenAI Runner] ✓ Tracked file change for ${relativePath}: +${additions} -${deletions}`);
                }
              } catch (error) {
                console.error('[OpenAI Runner] Failed to track file changes:', error);
              }
            }
          }

          // Add tool result to messages
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: result.success 
              ? (result.output || 'Success') 
              : `Error: ${result.error}`
          });

          // Send tool result message for UI
          sendMessage('user', {
            message: {
              content: [{
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: result.success ? result.output : `Error: ${result.error}`,
                is_error: !result.success
              }]
            }
          });
          
          // Save for DB storage (without UI update)
          saveToDb('tool_result', {
            tool_use_id: toolCall.id,
            output: result.success ? result.output : `Error: ${result.error}`,
            is_error: !result.success,
            uuid: `tool_result_${toolCall.id}`
          });
        }

        // Check if aborted during tool execution
        if (aborted) {
          if (onSessionUpdate) {
            onSessionUpdate({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens });
          }
          onEvent({
            type: "session.status",
            payload: {
              sessionId: session.id,
              status: "idle",
              title: session.title
            }
          });
          return;
        }

        // Add all tool results to messages
        messages.push(...toolResults, ...followUpMessages);
        
        // Add loop-breaking hint if loop was detected
        if (loopHintAdded && loopRetryCount > 0) {
          messages.push({
            role: 'user',
            content: `⚠️ IMPORTANT: You've been calling the same tool repeatedly without making progress. Please:
1. STOP and think about what you're trying to achieve
2. Try a DIFFERENT approach or tool
3. If the task is complete, respond to the user
4. If stuck, explain what's blocking you

DO NOT call the same tool again with similar arguments.`
          });
          loopHintAdded = false; // Reset so we don't add it every time
        }
        
        // If memory was updated, refresh the first user message with new memory
        if (memoryContent !== undefined && messages.length > 1 && messages[1].role === 'user') {
          // Find the first user message (index 1, after system)
          const firstUserMsg = messages[1];
          if (typeof firstUserMsg.content === 'string') {
            // Extract the original request from the message
            const match = firstUserMsg.content.match(/ORIGINAL USER REQUEST:\n\n([\s\S]+)$/);
            if (match) {
              const originalRequest = match[1];
              // Regenerate the message with updated memory
              messages[1] = {
                role: 'user',
                content: getInitialPrompt(originalRequest, memoryContent)
              };
            }
          }
        }
      }

      if (iterationCount >= MAX_ITERATIONS) {
        throw new Error('Max iterations reached');
      }

    } catch (error: any) {
      console.error('[OpenAI Runner] Error:', error);

      const retryable = Boolean((error as any)?.retryable);
      const retryAttempts = (error as any)?.retryAttempts ?? 0;
      
      // Extract detailed error message from API response
      let errorMessage = error instanceof Error ? error.message : String(error);

      sendMessage('result', {
        subtype: 'error',
        is_error: true,
        duration_ms: Date.now() - sessionStartTime,
        duration_api_ms: Date.now() - sessionStartTime,
        num_turns: iterationCount,
        result: errorMessage,
        session_id: session.id,
        total_cost_usd: 0,
        usage: {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens
        },
        retryable: retryable,
        retryPrompt: prompt,
        retryAttempts: retryAttempts
      });
      
      // Check for timeout errors
      if (error.name === 'TimeoutError' || error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        errorMessage = '⏱️ Request timed out. The server took too long to respond. Try again or use a faster model.';
      }
      // Check if we captured the error body via custom fetch
      else if (lastErrorBody) {
        try {
          const errorBody = JSON.parse(lastErrorBody);
          if (errorBody.detail) {
            errorMessage = `${errorBody.detail}`;
          } else if (errorBody.error) {
            errorMessage = `${errorBody.error}`;
          } else {
            errorMessage = `API Error: ${JSON.stringify(errorBody)}`;
          }
        } catch (parseError) {
          // Not JSON, use raw text
          errorMessage = lastErrorBody;
        }
      } else if (error.error) {
        // OpenAI SDK error object
        errorMessage = typeof error.error === 'string' ? error.error : JSON.stringify(error.error);
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Add status code for clarity if available
      if (error.status && !errorMessage.includes(`${error.status}`)) {
        errorMessage = `[${error.status}] ${errorMessage}`;
      }
      
      // Send error message to chat
      sendMessage('text', { text: `\n\n❌ **Error:** ${errorMessage}\n\nPlease check your API settings (Base URL, Model Name, API Key) and try again.` });
      saveToDb('text', { text: `\n\n❌ **Error:** ${errorMessage}\n\nPlease check your API settings (Base URL, Model Name, API Key) and try again.` });
      
      if (onSessionUpdate) {
        onSessionUpdate({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens });
      }
      onEvent({
        type: "session.status",
        payload: { 
          sessionId: session.id, 
          status: "idle", 
          title: session.title, 
          error: errorMessage 
        }
      });
    }
  })();

  return {
    abort: () => {
      aborted = true;
      abortController.abort();
    },
    resolvePermission: (toolUseId: string, approved: boolean) => {
      resolvePermission(toolUseId, approved);
    },
    resolvePreviewApproval: (approval: any) => {
      // Import at runtime to avoid circular dependency
      const { handlePreviewApproval } = require("./preview-manager.js");
      handlePreviewApproval(approval);
    },
    resolvePreviewBatchApproval: (batchApproval: any) => {
      const { handleBatchApproval } = require("./preview-manager.js");
      handleBatchApproval(batchApproval);
    }
  };
}
