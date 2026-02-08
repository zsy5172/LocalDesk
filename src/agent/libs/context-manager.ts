import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import type OpenAI from "openai";
import type { StreamMessage, Attachment } from "../types.js";

export type ContextConfig = {
  contextWindowTokens: number;
  reserveOutputTokens: number;
  keepLastTurns: number;
  softTrimRatio: number;
  hardClearRatio: number;
  memoryFlushRatio: number;
  compactionRatio: number;
  headChars: number;
  tailChars: number;
  keepLastToolResults: number;
  maxChunkTokens: number;
  maxSummaryTokens: number;
  maxMemoryTokens: number;
  safetyMargin: number;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: any;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

export type CompactionResult = {
  didCompact: boolean;
  summary?: string;
};

const DEFAULT_CONTEXT_WINDOW = 200_000;
const DEFAULT_RESERVE_OUTPUT = 8_000;
const DEFAULT_KEEP_LAST_TURNS = 6;
const DEFAULT_HEAD_CHARS = 800;
const DEFAULT_TAIL_CHARS = 800;
const DEFAULT_KEEP_LAST_TOOL_RESULTS = 2;
const DEFAULT_MAX_CHUNK_TOKENS = 3_000;
const DEFAULT_MAX_SUMMARY_TOKENS = 2_000;
const DEFAULT_MAX_MEMORY_TOKENS = 800;
const DEFAULT_SAFETY_MARGIN = 1.2;

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  contextWindowTokens: DEFAULT_CONTEXT_WINDOW,
  reserveOutputTokens: DEFAULT_RESERVE_OUTPUT,
  keepLastTurns: DEFAULT_KEEP_LAST_TURNS,
  softTrimRatio: 0.5,
  hardClearRatio: 0.7,
  memoryFlushRatio: 0.8,
  compactionRatio: 0.85,
  headChars: DEFAULT_HEAD_CHARS,
  tailChars: DEFAULT_TAIL_CHARS,
  keepLastToolResults: DEFAULT_KEEP_LAST_TOOL_RESULTS,
  maxChunkTokens: DEFAULT_MAX_CHUNK_TOKENS,
  maxSummaryTokens: DEFAULT_MAX_SUMMARY_TOKENS,
  maxMemoryTokens: DEFAULT_MAX_MEMORY_TOKENS,
  safetyMargin: DEFAULT_SAFETY_MARGIN
};

const AVG_CHARS_PER_TOKEN = 4;

const toText = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
};

export const estimateTokensFromText = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
};

export const estimateTokensForChatMessages = (messages: ChatMessage[]): number => {
  return messages.reduce((sum, msg) => {
    const contentText = Array.isArray(msg.content)
      ? msg.content
          .map((part: any) => {
            if (part?.type === "image_url") return "[image]";
            return toText(part?.text ?? part);
          })
          .join("\n")
      : toText(msg.content);
    const toolText = msg.tool_calls ? toText(msg.tool_calls) : "";
    return sum + estimateTokensFromText(contentText + toolText) + 4; // small per-message overhead
  }, 0);
};

export const estimateTokensForStreamMessages = (messages: StreamMessage[]): number => {
  return messages.reduce((sum, msg) => sum + estimateTokensFromText(formatStreamMessage(msg)), 0);
};

export const getEffectiveWindow = (config: ContextConfig): number => {
  const base = Math.max(1, config.contextWindowTokens - config.reserveOutputTokens);
  return Math.floor(base / config.safetyMargin);
};

export const getUsageRatio = (tokenCount: number, config: ContextConfig): number => {
  const window = getEffectiveWindow(config);
  if (window <= 0) return 1;
  return tokenCount / window;
};

export const pruneChatMessages = (messages: ChatMessage[], config: ContextConfig): ChatMessage[] => {
  const totalTokens = estimateTokensForChatMessages(messages);
  const ratio = getUsageRatio(totalTokens, config);
  if (ratio <= config.softTrimRatio) return messages;

  const toolIndices = messages
    .map((msg, idx) => ({ msg, idx }))
    .filter(({ msg }) => msg.role === "tool");
  const keepFrom = Math.max(0, toolIndices.length - config.keepLastToolResults);
  const keepSet = new Set(toolIndices.slice(keepFrom).map(({ idx }) => idx));

  const softTrim = (content: string): string => {
    if (content.length <= config.headChars + config.tailChars + 40) return content;
    const head = content.slice(0, config.headChars);
    const tail = content.slice(-config.tailChars);
    const omitted = content.length - head.length - tail.length;
    return `${head}\n... [omitted ${omitted} chars] ...\n${tail}\n\n[Tool result trimmed: kept first ${head.length} and last ${tail.length} chars.]`;
  };

  const hardClear = (content: string): string => {
    return `[Tool result removed; original length ${content.length} chars.]`;
  };

  return messages.map((msg, idx) => {
    if (msg.role !== "tool") return msg;
    if (keepSet.has(idx)) return msg;
    if (typeof msg.content !== "string") return msg;

    if (ratio > config.hardClearRatio) {
      return { ...msg, content: hardClear(msg.content) };
    }

    return { ...msg, content: softTrim(msg.content) };
  });
};

export const getSessionMemoryPath = (cwd?: string): string | null => {
  if (!cwd) return null;
  return join(cwd, ".valera", "memory.md");
};

export const loadSessionMemory = (cwd?: string, maxChars = 8000): string => {
  const memoryPath = getSessionMemoryPath(cwd);
  if (!memoryPath || !existsSync(memoryPath)) return "";
  try {
    const raw = readFileSync(memoryPath, "utf-8");
    if (!raw) return "";
    if (raw.length <= maxChars) return raw;
    return raw.slice(-maxChars);
  } catch {
    return "";
  }
};

const ensureDir = (path: string) => {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

const appendMemoryEntry = (memoryPath: string, entry: string) => {
  ensureDir(memoryPath);
  const timestamp = new Date().toISOString();
  const content = `\n\n## ${timestamp}\n${entry.trim()}\n`;
  if (!existsSync(memoryPath)) {
    writeFileSync(memoryPath, content.trimStart(), "utf-8");
    return;
  }
  appendFileSync(memoryPath, content, "utf-8");
};

const formatAttachments = (attachments?: Attachment[]): string => {
  if (!attachments || attachments.length === 0) return "";
  const items = attachments.map((a) => `${a.name} (${a.type})`);
  return `\n[Attachments: ${items.join(", ")}]`;
};

const trimLongText = (text: string, maxChars: number) => {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.6));
  const tail = text.slice(-Math.floor(maxChars * 0.3));
  const omitted = text.length - head.length - tail.length;
  return `${head}\n... [omitted ${omitted} chars] ...\n${tail}`;
};

const formatStreamMessage = (msg: StreamMessage): string => {
  const anyMsg = msg as any;
  if (anyMsg.type === "user_prompt") {
    return `USER: ${anyMsg.prompt ?? ""}${formatAttachments(anyMsg.attachments)}`.trim();
  }
  if (anyMsg.type === "text") {
    return `ASSISTANT: ${anyMsg.text ?? ""}`.trim();
  }
  if (anyMsg.type === "tool_use") {
    return `ASSISTANT TOOL_CALL: ${anyMsg.name ?? ""} ${trimLongText(toText(anyMsg.input), 2000)}`.trim();
  }
  if (anyMsg.type === "tool_result") {
    const prefix = anyMsg.is_error ? "TOOL_ERROR" : "TOOL_RESULT";
    return `${prefix}: ${trimLongText(toText(anyMsg.output), 4000)}`.trim();
  }
  if (anyMsg.type === "system_summary") {
    return `SYSTEM_SUMMARY: ${anyMsg.summary ?? ""}`.trim();
  }
  if (anyMsg.type === "assistant" || anyMsg.type === "system" || anyMsg.type === "result") {
    return `SDK:${anyMsg.type} ${trimLongText(toText(anyMsg), 2000)}`.trim();
  }
  return trimLongText(toText(anyMsg), 2000);
};

const splitTextByTokens = (text: string, maxTokens: number): string[] => {
  const maxChars = Math.max(200, maxTokens * AVG_CHARS_PER_TOKEN);
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
};

const callSummarizer = async (
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
  retries = 2
): Promise<string> => {
  const outputTokens = Math.max(128, Math.min(maxTokens, 2048));
  let content = userContent;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: content }
        ],
        temperature: 0.2,
        max_tokens: outputTokens
      });

      const text = response.choices[0]?.message?.content ?? "";
      return text.trim();
    } catch (error: any) {
      const isContextLimitError =
        error?.status === 400 &&
        typeof error?.error?.message === "string" &&
        (error.error.message.includes("max_tokens") ||
          error.error.message.includes("context length") ||
          error.error.message.includes("model output limit"));

      if (isContextLimitError && attempt < retries) {
        // Halve the user content to fit within context limits
        content = content.slice(0, Math.floor(content.length / 2));
        console.warn(
          `[context-manager] Summarizer hit context limit, retrying with ${content.length} chars (attempt ${attempt + 1})`
        );
        continue;
      }
      throw error;
    }
  }

  return "";
};

export const summarizeInStages = async (params: {
  client: OpenAI;
  model: string;
  text: string;
  instructions: string;
  mergeInstructions: string;
  maxChunkTokens: number;
  maxOutputTokens: number;
  maxTargetTokens: number;
}): Promise<string> => {
  const chunks = splitTextByTokens(params.text, params.maxChunkTokens);
  const partials = (await Promise.all(
    chunks.map(async (chunk) => {
      try {
        return await callSummarizer(
          params.client,
          params.model,
          params.instructions,
          chunk,
          params.maxOutputTokens
        );
      } catch (error) {
        console.warn(`[context-manager] Skipping chunk (${chunk.length} chars) after summarizer error`);
        return "";
      }
    })
  )).filter(Boolean);

  if (partials.length === 0) return "";
  if (partials.length === 1) return partials[0];

  let merged = partials.join("\n");
  if (estimateTokensFromText(merged) > params.maxTargetTokens) {
    merged = await callSummarizer(
      params.client,
      params.model,
      params.mergeInstructions,
      merged,
      params.maxOutputTokens
    );
  }

  if (estimateTokensFromText(merged) > params.maxTargetTokens) {
    merged = await callSummarizer(
      params.client,
      params.model,
      `${params.mergeInstructions}\nBe even more concise.`,
      merged,
      Math.max(128, Math.floor(params.maxOutputTokens / 2))
    );
  }

  return merged.trim();
};

export const runMemoryFlush = async (params: {
  client: OpenAI;
  model: string;
  messages: StreamMessage[];
  sessionCwd?: string;
  config: ContextConfig;
}): Promise<boolean> => {
  const memoryPath = getSessionMemoryPath(params.sessionCwd);
  if (!memoryPath) return false;

  const transcript = params.messages.map(formatStreamMessage).join("\n\n");
  if (!transcript.trim()) return false;

  // Pre-truncate transcript to avoid sending oversized content to the summarizer API.
  // Cap at ~5 chunks worth of content to keep compaction fast.
  const maxTranscriptChars = Math.min(
    params.config.maxChunkTokens * AVG_CHARS_PER_TOKEN * 5,
    Math.floor(params.config.contextWindowTokens * AVG_CHARS_PER_TOKEN / 2)
  );
  const trimmedTranscript = transcript.length > maxTranscriptChars
    ? transcript.slice(0, Math.floor(maxTranscriptChars * 0.3))
      + "\n\n... [middle omitted] ...\n\n"
      + transcript.slice(-Math.floor(maxTranscriptChars * 0.7))
    : transcript;

  const instructions = [
    "You are preparing a session memory note before context compaction.",
    "Extract durable facts, decisions, file paths, commands, TODOs, and important parameters.",
    "Only include items that will matter later in THIS session.",
    "Be concise. No speculation.",
    "Return JSON ONLY in the form: {\"memory\":\"- item\\n- item\"} or {\"memory\":\"\"}."
  ].join(" ");
  const mergeInstructions = [
    "Merge these memory notes into a single concise JSON.",
    "Return JSON ONLY in the form: {\"memory\":\"- item\\n- item\"} or {\"memory\":\"\"}."
  ].join(" ");

  const summary = await summarizeInStages({
    client: params.client,
    model: params.model,
    text: trimmedTranscript,
    instructions,
    mergeInstructions,
    maxChunkTokens: params.config.maxChunkTokens,
    maxOutputTokens: params.config.maxMemoryTokens,
    maxTargetTokens: params.config.maxMemoryTokens
  });

  if (!summary) return false;

  let memoryText = "";
  try {
    const parsed = JSON.parse(summary);
    if (parsed && typeof parsed.memory === "string") {
      memoryText = parsed.memory.trim();
    }
  } catch {
    memoryText = summary.trim();
  }

  if (!memoryText) return false;

  appendMemoryEntry(memoryPath, memoryText);
  return true;
};

export const summarizeForCompaction = async (params: {
  client: OpenAI;
  model: string;
  messages: StreamMessage[];
  config: ContextConfig;
}): Promise<string> => {
  const transcript = params.messages.map(formatStreamMessage).join("\n\n");
  if (!transcript.trim()) return "";

  // Pre-truncate transcript to avoid oversized API requests
  const maxTranscriptChars = Math.min(
    params.config.maxChunkTokens * AVG_CHARS_PER_TOKEN * 5,
    Math.floor(params.config.contextWindowTokens * AVG_CHARS_PER_TOKEN / 2)
  );
  const trimmedTranscript = transcript.length > maxTranscriptChars
    ? transcript.slice(0, Math.floor(maxTranscriptChars * 0.3))
      + "\n\n... [middle omitted] ...\n\n"
      + transcript.slice(-Math.floor(maxTranscriptChars * 0.7))
    : transcript;

  const instructions = [
    "Summarize the following conversation history.",
    "Preserve decisions, requirements, file paths, commands, errors, TODOs, and key parameters.",
    "Keep it factual and concise."
  ].join(" ");
  const mergeInstructions = [
    "Merge these partial summaries into one coherent summary.",
    "Preserve decisions, requirements, file paths, commands, errors, TODOs, and key parameters."
  ].join(" ");

  return summarizeInStages({
    client: params.client,
    model: params.model,
    text: trimmedTranscript,
    instructions,
    mergeInstructions,
    maxChunkTokens: params.config.maxChunkTokens,
    maxOutputTokens: params.config.maxSummaryTokens,
    maxTargetTokens: params.config.maxSummaryTokens
  });
};

export const shouldTrigger = (ratio: number, threshold: number): boolean => {
  return ratio >= threshold;
};

export const getCompactionCutoffIndex = (messages: StreamMessage[], keepLastTurns: number): number => {
  if (keepLastTurns <= 0) {
    return messages.length - 1;
  }
  const userPromptIndices: number[] = [];
  messages.forEach((msg, idx) => {
    if ((msg as any).type === "user_prompt") {
      userPromptIndices.push(idx);
    }
  });
  if (userPromptIndices.length <= keepLastTurns) return -1;
  const keepStartPromptIndex = userPromptIndices[userPromptIndices.length - keepLastTurns];
  return keepStartPromptIndex - 1;
};
