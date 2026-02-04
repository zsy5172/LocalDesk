import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store/useAppStore";
import type { StreamMessage, Attachment, FileChange, PermissionResult, SDKMessage } from "../types";
import type { PermissionRequest } from "../store/useAppStore";
import MDContent from "../render/markdown";
import { getPlatform } from "../platform";
import { DecisionPanel } from "./DecisionPanel";
import { ChangedFiles, type ChangedFile } from "./ChangedFiles";
import { DiffViewerModal } from "./DiffViewerModal";
import * as Dialog from "@radix-ui/react-dialog";

type ToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input?: unknown;
  [key: string]: unknown;
};

type ToolResultContent = {
  type: "tool_result";
  tool_use_id?: string;
  content: string;
  is_error?: boolean;
  [key: string]: unknown;
};

type AssistantContent =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | ToolUseContent
  | { type: string; [key: string]: unknown };

type SDKAssistantMessage = {
  type: "assistant";
  message: {
    content: AssistantContent[];
    [key: string]: unknown;
  };
};

type SDKResultMessage = {
  type: "result";
  subtype?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  duration_ms?: number;
  duration_api_ms?: number;
  total_cost_usd?: number;
  retryable?: boolean;
  retryPrompt?: string;
  retry_prompt?: string;
  retryAttempts?: number;
  [key: string]: unknown;
};

type MessageContent = SDKAssistantMessage["message"]["content"][number];
type ToolStatus = "pending" | "success" | "error";
const toolStatusMap = new Map<string, ToolStatus>();
const toolStatusListeners = new Set<() => void>();
const MAX_VISIBLE_LINES = 3;

const isToolUseContent = (content: MessageContent): content is ToolUseContent => (
  content.type === "tool_use" && typeof (content as ToolUseContent).id === "string"
);

const isTextContent = (content: MessageContent): content is { type: "text"; text: string } => (
  content.type === "text" && typeof (content as { text?: unknown }).text === "string"
);

const isThinkingContent = (content: MessageContent): content is { type: "thinking"; thinking: string } => (
  content.type === "thinking" && typeof (content as { thinking?: unknown }).thinking === "string"
);

const isToolResultContent = (content: unknown): content is ToolResultContent => (
  typeof content === "object"
  && content !== null
  && (content as ToolResultContent).type === "tool_result"
);

const isUserPromptMessage = (message: StreamMessage): message is { type: "user_prompt"; prompt: string; attachments?: Attachment[] } => (
  message.type === "user_prompt"
  && typeof (message as { prompt?: unknown }).prompt === "string"
);

const isResultMessage = (message: SDKMessage): message is SDKResultMessage => (
  message.type === "result"
);

const isAssistantMessage = (message: SDKMessage): message is SDKAssistantMessage => (
  message.type === "assistant"
  && typeof message.message === "object"
  && message.message !== null
  && Array.isArray((message.message as { content?: unknown }).content)
);

const isUserMessageWithResults = (message: SDKMessage): message is { type: "user"; message: { content: unknown[] } } => (
  message.type === "user"
  && typeof message.message === "object"
  && message.message !== null
  && Array.isArray((message.message as { content?: unknown }).content)
);

type AskUserQuestionInput = {
  questions?: Array<{
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
};

const getAskUserQuestionSignature = (input?: AskUserQuestionInput | null) => {
  if (!input?.questions?.length) return "";
  return input.questions.map((question) => {
    const options = (question.options ?? []).map((o) => `${o.label}|${o.description ?? ""}`).join(",");
    return `${question.question}|${question.header ?? ""}|${question.multiSelect ? "1" : "0"}|${options}`;
  }).join("||");
};

const setToolStatus = (toolUseId: string | undefined, status: ToolStatus) => {
  if (!toolUseId) return;
  toolStatusMap.set(toolUseId, status);
  toolStatusListeners.forEach((listener) => listener());
};

const useToolStatus = (toolUseId: string | undefined) => {
  const [status, setStatus] = useState<ToolStatus | undefined>(() =>
    toolUseId ? toolStatusMap.get(toolUseId) : undefined
  );
  useEffect(() => {
    if (!toolUseId) return;
    const handleUpdate = () => setStatus(toolStatusMap.get(toolUseId));
    toolStatusListeners.add(handleUpdate);
    return () => { toolStatusListeners.delete(handleUpdate); };
  }, [toolUseId]);
  return status;
};

const StatusDot = ({ variant = "accent", isActive = false, isVisible = true }: {
  variant?: "accent" | "success" | "error"; isActive?: boolean; isVisible?: boolean;
}) => {
  if (!isVisible) return null;
  const colorClass = variant === "success" ? "bg-success" : variant === "error" ? "bg-error" : "bg-accent";
  return (
    <span className="relative flex h-2 w-2">
      {isActive && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colorClass} opacity-75`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colorClass}`} />
    </span>
  );
};

// ChangedFilesPanel is now replaced by the ChangedFiles component from ./ChangedFiles.tsx

const SessionResult = ({ message, fileChanges, sessionId, onConfirmChanges, onRollbackChanges }: {
  message: SDKResultMessage;
  fileChanges?: FileChange[];
  sessionId?: string;
  onConfirmChanges?: (sessionId: string) => void;
  onRollbackChanges?: (sessionId: string) => void;
}) => {
  const { t } = useTranslation();
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ChangedFile | null>(null);
  
  // Get cwd from session store
  const sessions = useAppStore((state) => state.sessions);
  const cwd = sessionId ? sessions[sessionId]?.cwd : undefined;

  const formatMinutes = (ms: number | undefined) => typeof ms !== "number" ? "-" : `${(ms / 60000).toFixed(2)} min`;
  const formatUsd = (usd: number | undefined) => typeof usd !== "number" ? "-" : usd.toFixed(2);
  const formatMillions = (tokens: number | undefined) => typeof tokens !== "number" ? "-" : `${(tokens / 1_000_000).toFixed(3)}m`;

  // Always hide cost display - not relevant for local models and confusing for users
  const hasCost = false;

  // Convert FileChange[] to ChangedFile[] format
  const changedFiles: ChangedFile[] = (fileChanges || []).map(fc => ({
    file_path: fc.path,
    lines_added: fc.additions,
    lines_removed: fc.deletions,
    // FileChange currently only tracks path + line counts; no diff content available here.
    content_old: undefined,
    content_new: undefined,
    commitHash: fc.commitHash
  }));

  const handleViewDiff = (file: ChangedFile) => {
    setSelectedFile(file);
    setDiffModalOpen(true);
  };

  const handleApply = () => {
    onConfirmChanges?.(sessionId!);
  };

  const handleReject = () => {
    onRollbackChanges?.(sessionId!);
  };

  return (
    <>
      <div className="flex flex-col gap-2 mt-4">
        <div className="header text-accent">{t("eventCard.sessionResult")}</div>
        <div className="flex flex-col rounded-xl px-4 py-3 border border-ink-900/10 bg-surface-secondary space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="font-normal">{t("eventCard.duration")}</span>
            <span className="inline-flex items-center rounded-full bg-surface-tertiary px-2.5 py-0.5 text-ink-700 text-[13px]">{formatMinutes(message.duration_ms)}</span>
            <span className="font-normal">{t("eventCard.apiDuration")}</span>
            <span className="inline-flex items-center rounded-full bg-surface-tertiary px-2.5 py-0.5 text-ink-700 text-[13px]">{formatMinutes(message.duration_api_ms)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="font-normal">{t("eventCard.tokens")}</span>
            <span className="inline-flex items-center rounded-full bg-surface-tertiary px-2.5 py-0.5 text-ink-700 text-[13px]">{t("eventCard.tokenInput", { value: formatMillions(message.usage?.input_tokens) })}</span>
            <span className="inline-flex items-center rounded-full bg-surface-tertiary px-2.5 py-0.5 text-ink-700 text-[13px]">{t("eventCard.tokenOutput", { value: formatMillions(message.usage?.output_tokens) })}</span>
            {hasCost && (
              <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-accent text-[13px]">
                ${formatUsd(message.total_cost_usd)}
              </span>
            )}
          </div>
        </div>
        {/* Always show changed files after Session Result using new ChangedFiles component */}
        <ChangedFiles
          files={changedFiles}
          onApply={fileChanges?.some(f => f.status === 'pending') ? handleApply : undefined}
          onReject={fileChanges?.some(f => f.status === 'pending') ? handleReject : undefined}
          onViewDiff={handleViewDiff}
        />
      </div>
      <DiffViewerModal
        file={selectedFile}
        files={changedFiles}
        cwd={cwd}
        sessionId={sessionId}
        open={diffModalOpen}
        onClose={() => {
          setDiffModalOpen(false);
          setSelectedFile(null);
        }}
        onFileChange={(file) => {
          setSelectedFile(file);
        }}
      />
    </>
  );
};

export function isMarkdown(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const patterns: RegExp[] = [/^#{1,6}\s+/m, /```[\s\S]*?```/];
  return patterns.some((pattern) => pattern.test(text));
}

function extractTagContent(input: string, tag: string): string | null {
  const match = input.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : null;
}

const ToolResult = ({ messageContent }: { messageContent: ToolResultContent }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isFirstRender = useRef(true);
  let lines: string[] = [];
  
  if (messageContent.type !== "tool_result") return null;
  
  const toolUseId = messageContent.tool_use_id;
  const status: ToolStatus = messageContent.is_error ? "error" : "success";
  const isError = messageContent.is_error;

  const extractFilePaths = (text: string): string[] => {
    const paths = new Set<string>();
    const lines = String(text ?? "").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      const markers = ["Saved to:", "Output file:", "输出文件：", "输出文件:"];
      const marker = markers.find((m) => trimmed.includes(m));
      if (marker) {
        const idx = trimmed.indexOf(marker);
        const candidate = trimmed.slice(idx + marker.length).trim();
        if (candidate.startsWith("/")) paths.add(candidate);
        continue;
      }

      // Fallback: a line that looks like an absolute path
      if (trimmed.startsWith("/") && /\.[a-zA-Z0-9]{1,8}$/.test(trimmed)) {
        paths.add(trimmed);
      }
    }
    return Array.from(paths);
  };

  if (messageContent.is_error) {
    lines = [extractTagContent(String(messageContent.content), "tool_use_error") || String(messageContent.content)];
  } else {
    try {
      if (Array.isArray(messageContent.content)) {
        lines = messageContent.content.map((item: any) => item.text || "").join("\n").split("\n");
      } else {
        lines = String(messageContent.content).split("\n");
      }
    } catch { lines = [JSON.stringify(messageContent, null, 2)]; }
  }

  const isMarkdownContent = isMarkdown(lines.join("\n"));
  const hasMoreLines = lines.length > MAX_VISIBLE_LINES;
  const visibleContent = hasMoreLines && !isExpanded ? lines.slice(0, MAX_VISIBLE_LINES).join("\n") : lines.join("\n");
  const filePaths = extractFilePaths(lines.join("\n"));

  useEffect(() => { setToolStatus(toolUseId, status); }, [toolUseId, status]);
  useEffect(() => {
    if (!hasMoreLines || isFirstRender.current) { isFirstRender.current = false; return; }
    // Scroll to expanded content only when user explicitly expands it
    if (isExpanded) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [hasMoreLines, isExpanded]);

  return (
    <div className="flex flex-col mt-4 overflow-hidden">
      <div className="header text-accent">{t("eventCard.output")}</div>
      <div className="mt-2 rounded-xl bg-surface-tertiary p-3 overflow-hidden">
        <pre className={`text-sm whitespace-pre-wrap break-words font-mono overflow-x-auto ${isError ? "text-red-500" : "text-ink-700"}`}>
          {isMarkdownContent ? <MDContent text={visibleContent} /> : visibleContent}
        </pre>
        {filePaths.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {filePaths.map((path) => (
              <div key={path} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 border border-ink-900/10">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">{t("eventCard.fileLabel")}</div>
                  <div className="text-xs font-mono text-ink-700 truncate" title={path}>{path}</div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
                    onClick={() => getPlatform().send('open-file', path)}
                  >
                    {t("common.preview")}
                  </button>
                  <button
                    className="rounded-full border border-ink-900/10 bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
                    onClick={() => getPlatform().invoke('open-path-in-finder', path)}
                    title={t("eventCard.showInFolder")}
                  >
                    {t("eventCard.saveAs")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {hasMoreLines && (
          <button onClick={() => setIsExpanded(!isExpanded)} className="mt-2 text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
            <span>{isExpanded ? "▲" : "▼"}</span>
            <span>
              {isExpanded
                ? t("eventCard.collapse")
                : t("eventCard.showMoreLines", { count: lines.length - MAX_VISIBLE_LINES })}
            </span>
          </button>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

const AssistantBlockCard = ({ title, text, showIndicator = false, isTextBlock = false }: { title: string; text: string; showIndicator?: boolean; isTextBlock?: boolean }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex flex-col mt-4 overflow-hidden">
      <div className="header text-accent flex items-center gap-2">
        <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
        {title}
      </div>
      <MDContent text={text} />
      {isTextBlock && (
        <button
          onClick={handleCopy}
          className="mt-2 self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-surface-tertiary text-ink-600 hover:bg-surface-secondary hover:text-accent transition-all duration-200"
          title={t("eventCard.copyMarkdown")}
        >
          <svg className={`w-4 h-4 ${copied ? 'text-success' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {copied ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            )}
          </svg>
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      )}
    </div>
  );
};

const ToolUseCard = ({ 
  messageContent, 
  showIndicator = false,
  permissionRequest,
  onPermissionResult
}: { 
  messageContent: MessageContent; 
  showIndicator?: boolean;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: PermissionResult) => void;
  sessionId?: string;
  cwd?: string;
}) => {
  if (!isToolUseContent(messageContent)) return null;
  
  const toolStatus = useToolStatus(messageContent.id);
  const statusVariant = toolStatus === "error" ? "error" : "success";
  const isPending = !toolStatus || toolStatus === "pending";
  const shouldShowDot = toolStatus === "success" || toolStatus === "error" || showIndicator;
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (messageContent.id && !toolStatusMap.has(messageContent.id)) setToolStatus(messageContent.id, "pending");
  }, [messageContent.id]);

  const getToolInfo = (): string | null => {
    const input = messageContent.input as Record<string, any>;
    switch (messageContent.name) {
      case "Bash": case "run_command":
        return input?.command || input?.cmd || null;
      case "Read": case "read_file":
      case "Write": case "write_file":
      case "Edit": case "edit_file":
        return input?.file_path || null;
      case "Glob": case "search_files":
      case "Grep": case "search_text":
        return input?.pattern || null;
      case "Task":
        return input?.description || null;
      case "WebFetch": case "fetch": case "fetch_html": case "fetch_json":
        return input?.url || null;
      default: return null;
    }
  };

  const input = messageContent.input as Record<string, any>;
  const isCommandTool = messageContent.name === "run_command" || messageContent.name === "Bash";
  const commandText = isCommandTool ? (input?.command || input?.cmd || input?.args || "") : "";
  const canExpand = Boolean(isCommandTool && commandText);
  const toggleExpand = () => {
    if (!canExpand) return;
    setIsExpanded((prev) => !prev);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canExpand) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExpand();
    }
  };


  // Check if this tool needs permission
  const isActiveRequest = permissionRequest && permissionRequest.toolUseId === messageContent.id;

  if (isActiveRequest && onPermissionResult) {
    return (
      <div className="mt-4">
        <DecisionPanel
          request={permissionRequest}
          onSubmit={(result) => onPermissionResult(permissionRequest.toolUseId, result)}
        />
      </div>
    );
  }

  return (
    <>
      <div
        className={`flex flex-col gap-2 rounded-[1rem] bg-surface-tertiary px-3 py-2 mt-4 overflow-hidden ${canExpand ? "cursor-pointer" : ""}`}
        onClick={toggleExpand}
        onKeyDown={handleKeyDown}
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : -1}
        aria-expanded={canExpand ? isExpanded : undefined}
      >
        <div className="flex flex-row items-center gap-2 min-w-0">
          <StatusDot variant={statusVariant} isActive={isPending && showIndicator} isVisible={shouldShowDot} />
          <div className="flex flex-row items-center gap-2 tool-use-item min-w-0 flex-1">
            <span className="inline-flex items-center rounded-md text-accent py-0.5 text-sm font-medium shrink-0">{messageContent.name}</span>
            <span className="text-sm text-muted truncate">{getToolInfo()}</span>
          </div>
          {canExpand && (
            <span className="text-xs text-muted shrink-0">{isExpanded ? "▲" : "▼"}</span>
          )}
        </div>
        {canExpand && isExpanded && (
          <pre className="mt-2 rounded-lg bg-ink-900/5 px-3 py-2 text-xs text-ink-700 whitespace-pre-wrap break-words overflow-auto">
            {String(commandText)}
          </pre>
        )}
      </div>
    </>
  );
};

const AskUserQuestionCard = ({
  messageContent,
  permissionRequest,
  onPermissionResult
}: {
  messageContent: MessageContent;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: PermissionResult) => void;
}) => {
  const { t } = useTranslation();
  if (!isToolUseContent(messageContent)) return null;
  
  const input = messageContent.input as AskUserQuestionInput | null;
  const questions = input?.questions ?? [];
  const currentSignature = getAskUserQuestionSignature(input);
  const requestSignature = getAskUserQuestionSignature(permissionRequest?.input as AskUserQuestionInput | undefined);
  const isActiveRequest = permissionRequest && currentSignature === requestSignature;

  if (isActiveRequest && onPermissionResult) {
    return (
      <div className="mt-4">
        <DecisionPanel
          request={permissionRequest}
          onSubmit={(result) => onPermissionResult(permissionRequest.toolUseId, result)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[1rem] bg-surface-tertiary px-3 py-2 mt-4 overflow-hidden">
      <div className="flex flex-row items-center gap-2">
        <StatusDot variant="success" isActive={false} isVisible={true} />
        <span className="inline-flex items-center rounded-md text-accent py-0.5 text-sm font-medium">{t("eventCard.askUserQuestion")}</span>
      </div>
      {questions.map((q, idx) => (
        <div key={idx} className="text-sm text-ink-700 ml-4">{q.question}</div>
      ))}
    </div>
  );
};

const SystemInfoCard = ({ message, showIndicator = false }: { message: SDKMessage; showIndicator?: boolean }) => {
  const { t } = useTranslation();
  if (message.type !== "system" || !("subtype" in message)) return null;

  const systemMsg = message as any;

  if (systemMsg.subtype === "debug") {
    // Debug messages - log to console and optionally display
    const debugText = systemMsg.text || systemMsg.message || "Debug message";
    console.log(`[DEBUG] ${debugText}`);
    // Optionally return null to not display, or return a component to display
    return null; // Don't display debug messages in UI, just log them
  }

  if (systemMsg.subtype === "notice") {
    const noticeText = systemMsg.text || systemMsg.message || t("eventCard.systemNoticeFallback");
    return (
      <div className="flex flex-col gap-2">
        <div className="header text-accent flex items-center gap-2">
          <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
          {t("eventCard.systemNotice")}
        </div>
        <div className="rounded-xl px-4 py-2 border border-ink-900/10 bg-surface-secondary text-sm text-ink-700">
          {noticeText}
        </div>
      </div>
    );
  }

  if (systemMsg.subtype !== "init") return null;

  const InfoItem = ({ name, value }: { name: string; value: string }) => (
    <div className="text-[14px]">
      <span className="mr-4 font-normal">{name}</span>
      <span className="font-light">{value}</span>
    </div>
  );
  
  return (
    <div className="flex flex-col gap-2 overflow-hidden">
      <div className="header text-accent flex items-center gap-2">
        <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
        {t("eventCard.systemInit")}
      </div>
      <div className="flex flex-col rounded-xl px-4 py-2 border border-ink-900/10 bg-surface-secondary space-y-1">
        <InfoItem name={t("eventCard.sessionId")} value={systemMsg.session_id || "-"} />
        <InfoItem name={t("eventCard.modelName")} value={systemMsg.model || "-"} />
        <InfoItem name={t("eventCard.permissionMode")} value={systemMsg.permissionMode || "-"} />
        <InfoItem name={t("eventCard.workingDirectory")} value={systemMsg.cwd || "-"} />
      </div>
    </div>
  );
};

// Image zoom modal component
const ImageZoomModal = ({ 
  isOpen, 
  onClose, 
  imageUrl, 
  imageName 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  imageUrl: string; 
  imageName: string;
}) => {
  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50 animate-in fade-in" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col">
            <Dialog.Close className="absolute top-2 right-2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors z-10">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
            <img
              src={imageUrl}
              alt={imageName}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={onClose}
            />
            <div className="mt-2 text-center text-sm text-white/80 bg-black/50 px-4 py-2 rounded">
              {imageName}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

// Attachment preview for displaying attached files in user messages
/** Renders attached media (image, video, audio) in user messages */
const AttachmentDisplay = ({ attachment, cwd }: { attachment: Attachment; cwd?: string }) => {
  const { t } = useTranslation();
  const [isZoomed, setIsZoomed] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(attachment.dataUrl || null);

  const toObjectUrl = (dataUrl: string, fallbackMimeType: string) => {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const rawMime = match[1];
    const mime = (!rawMime || rawMime === 'application/octet-stream')
      ? fallbackMimeType
      : (rawMime === 'audio/mp3' ? 'audio/mpeg' : rawMime);
    const base64 = match[2];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };
  
  useEffect(() => {
    if (attachment.type !== 'image') return;
    if (attachment.dataUrl) {
      setImagePreview(attachment.dataUrl);
      return;
    }
    if (!attachment.path || !cwd) return;
    const electron = (window as any).electron;
    if (!electron?.getImagePreview) return;

    let cancelled = false;
    (async () => {
      try {
        const preview = await electron.getImagePreview({ cwd, path: attachment.path });
        if (!cancelled && preview?.dataUrl) {
          setImagePreview(preview.dataUrl);
        }
      } catch (error) {
        console.warn('[AttachmentDisplay] Failed to load image preview:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachment.type, attachment.dataUrl, attachment.path, cwd]);

  if (attachment.type === 'image') {
    const imageSrc = imagePreview || attachment.dataUrl;
    return (
      <>
        <div className="mt-2">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={t("eventCard.attachedImageAlt", { name: attachment.name })}
              className="max-w-xs max-h-48 rounded-lg object-contain cursor-zoom-in hover:opacity-90 transition-opacity"
              onDoubleClick={() => setIsZoomed(true)}
              title={t("eventCard.doubleClickToZoom")}
            />
          ) : (
            <div className="max-w-xs max-h-48 rounded-lg bg-surface-secondary border border-ink-900/10 p-3 text-xs text-muted">
              {t("eventCard.imagePreviewUnavailable")}
            </div>
          )}
          <div className="text-xs text-muted mt-1">{attachment.name}</div>
        </div>
        {imageSrc && (
          <ImageZoomModal
            isOpen={isZoomed}
            onClose={() => setIsZoomed(false)}
            imageUrl={imageSrc}
            imageName={attachment.name}
          />
        )}
      </>
    );
  }
  
  if (attachment.type === 'video') {
    const [videoError, setVideoError] = useState<string | null>(null);
    const [objectUrl, setObjectUrl] = useState<string | null>(null);

    useEffect(() => {
      try {
        const url = toObjectUrl(attachment.dataUrl, attachment.mimeType || 'video/mp4');
        setObjectUrl(url);
        return () => {
          if (url) URL.revokeObjectURL(url);
        };
      } catch {
        setObjectUrl(null);
        return;
      }
    }, [attachment.dataUrl, attachment.mimeType]);

    return (
      <div className="mt-2">
        {videoError ? (
          <div className="max-w-xs p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-sm text-red-700 mb-1">{t("eventCard.videoLoadFailed")}</div>
            <div className="text-xs text-red-600">{attachment.name}</div>
            <div className="text-xs text-red-500 mt-1">{videoError}</div>
          </div>
        ) : (
          <video
            src={objectUrl || attachment.dataUrl}
            controls
            className="max-w-xs max-h-48 rounded-lg"
            aria-label={t("eventCard.videoLabel", { name: attachment.name })}
            onError={(e) => {
              const target = e.target as HTMLVideoElement;
              const error = target.error;
              let errorMsg = t("eventCard.unknownError");
              if (error) {
                switch (error.code) {
                  case MediaError.MEDIA_ERR_ABORTED:
                    errorMsg = t("eventCard.playbackAborted");
                    break;
                  case MediaError.MEDIA_ERR_NETWORK:
                    errorMsg = t("eventCard.networkError");
                    break;
                  case MediaError.MEDIA_ERR_DECODE:
                    errorMsg = t("eventCard.decodingError");
                    break;
                  case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMsg = t("eventCard.videoNotSupported");
                    break;
                }
              }
              console.error('[VideoAttachment] Failed to load:', attachment.name, errorMsg);
              setVideoError(errorMsg);
            }}
          >
            <track kind="captions" />
            {t("eventCard.videoNotSupportedFallback")}
          </video>
        )}
        <div className="text-xs text-muted mt-1">{attachment.name}</div>
      </div>
    );
  }
  
  if (attachment.type === 'audio') {
    const [audioError, setAudioError] = useState<string | null>(null);
    const [objectUrl, setObjectUrl] = useState<string | null>(null);

    useEffect(() => {
      try {
        const url = toObjectUrl(attachment.dataUrl, attachment.mimeType || 'audio/mpeg');
        setObjectUrl(url);
        return () => {
          if (url) URL.revokeObjectURL(url);
        };
      } catch {
        setObjectUrl(null);
        return;
      }
    }, [attachment.dataUrl, attachment.mimeType]);

    return (
      <div className="mt-2">
        {audioError ? (
          <div className="max-w-xs p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-sm text-red-700 mb-1">{t("eventCard.audioLoadFailed")}</div>
            <div className="text-xs text-red-600">{attachment.name}</div>
            <div className="text-xs text-red-500 mt-1">{audioError}</div>
          </div>
        ) : (
          <audio
            src={objectUrl || attachment.dataUrl}
            controls
            className="max-w-xs"
            aria-label={t("eventCard.audioLabel", { name: attachment.name })}
            onError={(e) => {
              const target = e.target as HTMLAudioElement;
              const error = target.error;
              let errorMsg = t("eventCard.unknownError");
              if (error) {
                switch (error.code) {
                  case MediaError.MEDIA_ERR_ABORTED:
                    errorMsg = t("eventCard.playbackAborted");
                    break;
                  case MediaError.MEDIA_ERR_NETWORK:
                    errorMsg = t("eventCard.networkError");
                    break;
                  case MediaError.MEDIA_ERR_DECODE:
                    errorMsg = t("eventCard.decodingError");
                    break;
                  case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMsg = t("eventCard.audioNotSupported");
                    break;
                }
              }
              console.error('[AudioAttachment] Failed to load:', attachment.name, errorMsg);
              setAudioError(errorMsg);
            }}
          >
            {t("eventCard.audioNotSupportedFallback")}
          </audio>
        )}
        <div className="text-xs text-muted mt-1">{attachment.name}</div>
      </div>
    );
  }
  
  return null;
};

const UserMessageCard = ({ 
  message, 
  showIndicator = false,
  onEdit,
  sessionId
}: { 
  message: { type: "user_prompt"; prompt: string; attachments?: Attachment[] }; 
  showIndicator?: boolean;
  onEdit?: (newPrompt: string) => void;
  sessionId?: string;
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(message.prompt);
  const [copied, setCopied] = useState(false);
  const attachments = message.attachments || [];
  const hasPrompt = message.prompt.trim().length > 0;
  const sessions = useAppStore((state) => state.sessions);
  const sessionCwd = sessionId ? sessions[sessionId]?.cwd : undefined;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleSave = () => {
    if (editedText.trim() && onEdit) {
      onEdit(editedText.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditedText(message.prompt);
    setIsEditing(false);
  };


  return (
    <div className="flex flex-col mt-4 group overflow-hidden">
      <div className="header text-accent flex items-center gap-2">
        <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
        {t("eventCard.user")}
      </div>
      {isEditing ? (
        <div className="flex flex-col gap-2 mt-2">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full min-h-[100px] p-3 rounded-lg bg-surface-secondary border border-ink-900/10 focus:border-accent focus:outline-none resize-y max-w-full overflow-hidden"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              {t("common.send")}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-md bg-surface-tertiary hover:bg-surface-secondary text-ink-700 transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {hasPrompt ? (
            <MDContent text={message.prompt} />
          ) : (
            <div className="mt-2 text-sm text-ink-600">{t("eventCard.userAttachedFiles")}</div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {attachments.map((attachment) => (
                <AttachmentDisplay
                  key={attachment.id ?? attachment.path ?? attachment.name}
                  attachment={attachment}
                  cwd={sessionCwd}
                />
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 self-start">
            {onEdit && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs px-3 py-1.5 rounded-md text-ink-400 hover:text-accent hover:bg-surface-tertiary opacity-0 group-hover:opacity-100 transition-all duration-200"
              >
                {t("common.edit")}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1.5 rounded-md text-ink-400 hover:text-accent hover:bg-surface-tertiary opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1.5"
              title={t("eventCard.copyUserMessage")}
            >
              <svg className={`w-4 h-4 ${copied ? 'text-success' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {copied ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                )}
              </svg>
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export function MessageCard({
  message,
  isLast = false,
  isRunning = false,
  permissionRequest,
  onPermissionResult,
  onEditMessage,
  onRetry,
  messageIndex,
  fileChanges,
  sessionId,
  onConfirmChanges,
  onRollbackChanges
}: {
  message: StreamMessage;
  isLast?: boolean;
  isRunning?: boolean;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: PermissionResult) => void;
  onEditMessage?: (messageIndex: number, newPrompt: string) => void;
  onRetry?: (prompt?: string) => void;
  messageIndex?: number;
  fileChanges?: FileChange[];
  sessionId?: string;
  onConfirmChanges?: (sessionId: string) => void;
  onRollbackChanges?: (sessionId: string) => void;
}) {
  const { t } = useTranslation();
  const showIndicator = isLast && isRunning;
  if ((message as any).type === "system_summary") {
    return null;
  }

  if (isUserPromptMessage(message)) {
    return <UserMessageCard 
      message={message} 
      showIndicator={showIndicator}
      sessionId={sessionId}
      onEdit={onEditMessage && typeof messageIndex === 'number' 
        ? (newPrompt) => onEditMessage(messageIndex, newPrompt)
        : undefined
      }
    />;
  }

  const sdkMessage = message as SDKMessage;

  if (sdkMessage.type === "system") {
    return <SystemInfoCard message={sdkMessage} showIndicator={showIndicator} />;
  }

  if (isResultMessage(sdkMessage)) {
    if (sdkMessage.subtype === "success") {
      return <SessionResult message={sdkMessage} fileChanges={fileChanges} sessionId={sessionId} onConfirmChanges={onConfirmChanges} onRollbackChanges={onRollbackChanges} />;
    }
    const retryable = Boolean((sdkMessage as any).retryable);
    const retryPrompt = (sdkMessage as any).retryPrompt || (sdkMessage as any).retry_prompt;
    const retryAttempts = (sdkMessage as any).retryAttempts;
    const canRetry = Boolean(onRetry && retryable && !isRunning);
    return (
      <div className="flex flex-col gap-2 mt-4">
        <div className="header text-error">{t("eventCard.sessionError")}</div>
        <div className="rounded-xl bg-error-light p-3">
          <pre className="text-sm text-error whitespace-pre-wrap">{JSON.stringify(sdkMessage, null, 2)}</pre>
          {retryAttempts ? (
            <div className="mt-2 text-xs text-error/80">
              {retryAttempts === 1
                ? t("eventCard.autoRetryFailedOne")
                : t("eventCard.autoRetryFailedMany", { count: retryAttempts })}
            </div>
          ) : null}
          {canRetry ? (
            <button
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => onRetry?.(retryPrompt)}
              disabled={!canRetry}
            >
              {t("common.retry")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (isAssistantMessage(sdkMessage)) {
    const contents = sdkMessage.message.content;
    return (
      <>
        {contents.map((content: MessageContent, idx: number) => {
          const isLastContent = idx === contents.length - 1;
          // Use content.id for tool_use, otherwise use idx to ensure unique keys
          const key = isToolUseContent(content) ? `tool_use_${content.id}` : `content_${idx}`;
          
          if (isThinkingContent(content)) {
            return <AssistantBlockCard key={key} title={t("eventCard.thinking")} text={content.thinking} showIndicator={isLastContent && showIndicator} isTextBlock={false} />;
          }
          if (isTextContent(content)) {
            return <AssistantBlockCard key={key} title={t("eventCard.assistant")} text={content.text} showIndicator={isLastContent && showIndicator} isTextBlock={true} />;
          }
          if (isToolUseContent(content)) {
            if (content.name === "AskUserQuestion") {
              return <AskUserQuestionCard key={key} messageContent={content} permissionRequest={permissionRequest} onPermissionResult={onPermissionResult} />;
            }
            // Get cwd from store
            const sessions = useAppStore((state) => state.sessions);
            const sessionCwd = sessionId ? sessions[sessionId]?.cwd : undefined;
            return <ToolUseCard key={key} messageContent={content} showIndicator={isLastContent && showIndicator} permissionRequest={permissionRequest} onPermissionResult={onPermissionResult} sessionId={sessionId} cwd={sessionCwd} />;
          }
          return null;
        })}
      </>
    );
  }

  if (isUserMessageWithResults(sdkMessage)) {
    const contents = sdkMessage.message.content;
    return (
      <>
        {contents.map((content, idx: number) => {
          if (isToolResultContent(content)) {
            return <ToolResult key={idx} messageContent={content} />;
          }
          return null;
        })}
      </>
    );
  }

  return null;
}

export { MessageCard as EventCard };
