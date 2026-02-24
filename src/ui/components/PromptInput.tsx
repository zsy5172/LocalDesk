import { useCallback, useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { ClientEvent, Attachment, AttachmentType, CharterData } from "../types";
import { useAppStore } from "../store/useAppStore";
import { DEFAULT_SESSION_TITLE } from "../constants";

const DEFAULT_ALLOWED_TOOLS = "Read,Edit,Bash";
const MAX_ROWS = 12;
const LINE_HEIGHT = 21;
const MAX_HEIGHT = MAX_ROWS * LINE_HEIGHT;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max file size

// Supported file types
const SUPPORTED_TYPES: Record<AttachmentType, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/heic', 'image/heif', 'image/tiff', 'image/avif'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac']
};

const ACCEPT_STRING = [
  ...SUPPORTED_TYPES.image,
  ...SUPPORTED_TYPES.video,
  ...SUPPORTED_TYPES.audio
].join(',');

function getAttachmentType(mimeType: string): AttachmentType | null {
  if (SUPPORTED_TYPES.image.includes(mimeType)) return 'image';
  if (SUPPORTED_TYPES.video.includes(mimeType)) return 'video';
  if (SUPPORTED_TYPES.audio.includes(mimeType)) return 'audio';
  return null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface PromptInputProps {
  sendEvent: (event: ClientEvent) => void;
}

export function usePromptActions(sendEvent: (event: ClientEvent) => void) {
  const { t } = useTranslation();
  const prompt = useAppStore((state) => state.prompt);
  const cwd = useAppStore((state) => state.cwd);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const sessions = useAppStore((state) => state.sessions);
  const setPrompt = useAppStore((state) => state.setPrompt);
  const setPendingStart = useAppStore((state) => state.setPendingStart);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const selectedModel = useAppStore((state) => state.selectedModel);
  const selectedTemperature = useAppStore((state) => state.selectedTemperature);
  const sendTemperature = useAppStore((state) => state.sendTemperature);
  const attachments = useAppStore((state) => state.attachments);
  const clearAttachments = useAppStore((state) => state.clearAttachments);
  const apiSettings = useAppStore((state) => state.apiSettings);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const isRunning = activeSession?.status === "running";

  const handleSend = useCallback(async (options?: { enableSessionGitRepo?: boolean; charter?: CharterData }) => {
    const trimmedPrompt = prompt.trim();
    const hasAttachments = attachments.length > 0;

    // For existing sessions, require a prompt or attachments
    if (activeSessionId && !trimmedPrompt && !hasAttachments) return;

    if (!activeSessionId) {
      // Resolve selected model to API model name for legacy models (provider IDs keep :: form)
      const state = useAppStore.getState();
      const apiModelName = state.llmModels?.find(m => m.id === selectedModel)?.name
        ?? state.availableModels?.find(m => m.id === selectedModel)?.name
        ?? selectedModel;
      const isProviderModel = Boolean(selectedModel && selectedModel.includes("::"));
      const sessionModel = isProviderModel ? selectedModel : (apiModelName || selectedModel);
      const defaultModelId = isProviderModel ? selectedModel : apiModelName;

      setPendingStart(true);
      
      // Keep default title so backend can auto-generate when prompt exists
      let title = DEFAULT_SESSION_TITLE;
      if (!trimmedPrompt && attachments.length > 0) {
        title = t("prompt.attachmentTitle", { name: attachments[0].name });
      }
      sendEvent({
        type: "session.start",
        payload: {
          title,
          prompt: trimmedPrompt, // Can be empty string
          cwd: cwd.trim() || undefined,
          allowedTools: DEFAULT_ALLOWED_TOOLS,
          model: sessionModel || undefined,
          temperature: sendTemperature ? selectedTemperature : undefined,
          enableSessionGitRepo: options?.enableSessionGitRepo ?? apiSettings?.enableSessionGitRepo ?? false,
          attachments: hasAttachments ? attachments : undefined,
          charter: options?.charter
        }
      });
      // Save model id for future sessions (provider IDs keep :: form)
      if (defaultModelId) {
        sendEvent({
          type: "scheduler.default_model.set",
          payload: { modelId: defaultModelId }
        } as ClientEvent);
      }
      // Save temperature as default for future sessions
      sendEvent({
        type: "scheduler.default_temperature.set",
        payload: {
          temperature: selectedTemperature,
          sendTemperature: sendTemperature
        }
      } as ClientEvent);
    } else {
      if (activeSession?.status === "running") {
        setGlobalError(t("app.sessionRunningError"));
        return;
      }
      sendEvent({
        type: "session.continue",
        payload: {
          sessionId: activeSessionId,
          prompt: trimmedPrompt,
          attachments: hasAttachments ? attachments : undefined
        }
      });
    }
    setPrompt("");
    clearAttachments();
  }, [activeSession, activeSessionId, cwd, prompt, sendEvent, setGlobalError, setPendingStart, setPrompt, selectedModel, selectedTemperature, sendTemperature, attachments, clearAttachments, apiSettings?.enableSessionGitRepo, t]);

  const handleStop = useCallback(() => {
    if (!activeSessionId) return;
    sendEvent({ type: "session.stop", payload: { sessionId: activeSessionId } });
  }, [activeSessionId, sendEvent]);

  const handleStartFromModal = useCallback((options?: { enableSessionGitRepo?: boolean; charter?: CharterData }) => {
    // Allow starting chat without cwd or prompt
    // If no cwd, file operations will be blocked by tools-executor
    handleSend(options);
  }, [handleSend]);

  return { prompt, setPrompt, isRunning, handleSend, handleStop, handleStartFromModal };
}

/**
 * Displays a preview thumbnail for an attached file with remove functionality.
 * Shows thumbnails for images, icons for video/audio, and file info (name, size).
 */
function AttachmentPreview({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const { t } = useTranslation();
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="relative group flex items-center gap-2 bg-surface-secondary rounded-lg px-2 py-1.5 border border-ink-900/10">
      {attachment.type === 'image' && (
        <img
          src={attachment.dataUrl}
          alt={attachment.name}
          className="h-8 w-8 object-cover rounded"
        />
      )}
      {attachment.type === 'video' && (
        <div className="h-8 w-8 flex items-center justify-center bg-ink-900/10 rounded">
          <svg className="h-4 w-4 text-ink-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      )}
      {attachment.type === 'audio' && (
        <div className="h-8 w-8 flex items-center justify-center bg-ink-900/10 rounded">
          <svg className="h-4 w-4 text-ink-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
        </div>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-ink-700 truncate max-w-[120px]">{attachment.name}</span>
        <span className="text-xs text-muted">{formatSize(attachment.size)}</span>
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center bg-error text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={t("prompt.removeAttachment")}
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  );
}

export function PromptInput({ sendEvent }: PromptInputProps) {
  const { t } = useTranslation();
  const { prompt, setPrompt, isRunning, handleSend, handleStop } = usePromptActions(sendEvent);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const attachments = useAppStore((state) => state.attachments);
  const addAttachment = useAppStore((state) => state.addAttachment);
  const removeAttachment = useAppStore((state) => state.removeAttachment);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const cwd = useAppStore((state) => state.cwd);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const compactingSessionId = useAppStore((state) => state.compactingSessionId);
  const sessions = useAppStore((state) => state.sessions);
  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const attachmentCwd = activeSession?.cwd || cwd;
  const hasHistory = (activeSession?.messages?.length ?? 0) > 1;
  const isCompacting = compactingSessionId === activeSessionId;

  // Process file to attachment
  const processFile = useCallback(async (file: File): Promise<Attachment | null> => {
    const attachmentType = getAttachmentType(file.type);
    if (!attachmentType) {
      setGlobalError(t("prompt.errorUnsupportedFileType", { type: file.type }));
      return null;
    }

    if (file.size > MAX_FILE_SIZE) {
      const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
      setGlobalError(t("prompt.errorFileTooLarge", { name: file.name, size: maxSizeMB }));
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve({
          id: generateId(),
          type: attachmentType,
          name: file.name,
          mimeType: file.type,
          dataUrl,
          size: file.size
        });
      };
      reader.onerror = () => {
        setGlobalError(t("prompt.errorFailedToReadFile", { name: file.name }));
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  }, [setGlobalError]);

  const saveImageToWorkspace = useCallback(async (attachment: Attachment, fileName?: string) => {
    if (attachment.type !== 'image') return attachment;
    const targetCwd = attachmentCwd?.trim();
    if (!targetCwd) return attachment;
    const electron = (window as any).electron;
    if (!electron?.savePastedImage) return attachment;

    try {
      const result = await electron.savePastedImage({
        dataUrl: attachment.dataUrl,
        cwd: targetCwd,
        fileName: fileName || attachment.name
      });
      if (result?.path) {
        return {
          ...attachment,
          path: result.path,
          name: result.name || attachment.name,
          mimeType: result.mime || attachment.mimeType,
          size: typeof result.size === "number" ? result.size : attachment.size
        };
      }
    } catch (error) {
      console.warn('[PromptInput] Failed to save pasted image:', error);
    }

    return attachment;
  }, [attachmentCwd]);

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const attachment = await processFile(file);
      if (attachment) {
        addAttachment(attachment);
      }
    }

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [processFile, addAttachment]);

  const addPastedAttachment = useCallback(async (file: File, nameOverride?: string) => {
    const attachment = await processFile(file);
    if (!attachment) return;
    const renamed = nameOverride ? { ...attachment, name: nameOverride } : attachment;
    const saved = await saveImageToWorkspace(renamed, renamed.name);
    addAttachment(saved);
  }, [addAttachment, processFile, saveImageToWorkspace]);

  const addPastedDataUrl = useCallback(async (dataUrl: string, mimeType?: string) => {
    const attachment: Attachment = {
      id: generateId(),
      type: 'image',
      name: `Screenshot ${new Date().toLocaleTimeString()}.png`,
      mimeType: mimeType || 'image/png',
      dataUrl,
      size: 0
    };
    const saved = await saveImageToWorkspace(attachment, attachment.name);
    addAttachment(saved);
  }, [addAttachment, saveImageToWorkspace]);

  const readImageFromClipboardApi = useCallback(async () => {
    if (!navigator.clipboard?.read) return null;
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        return new File([blob], `screenshot-${Date.now()}`, { type: imageType });
      }
    } catch (error) {
      console.warn('[PromptInput] Clipboard API read failed:', error);
    }
    return null;
  }, []);

  const readImageFromSystemClipboard = useCallback(async () => {
    try {
      const electron = (window as any).electron;
      if (electron?.readClipboardImage) {
        const result = await electron.readClipboardImage();
        if (result?.dataUrl) return result;
      }
    } catch (error) {
      console.warn('[PromptInput] Electron clipboard image read failed:', error);
    }

    try {
      const tauri = (window as any).__TAURI__;
      const invoke = tauri?.invoke || tauri?.core?.invoke;
      if (typeof invoke === 'function') {
        const dataUrl: string | null = await invoke('read_clipboard_image');
        if (dataUrl) return { dataUrl, mime: 'image/png' };
      }
    } catch (error) {
      console.warn('[PromptInput] Tauri clipboard image fallback failed:', error);
    }

    return null;
  }, []);

  // Handle paste event for screenshots
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (items && items.length > 0) {
      const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
      if (imageItems.length > 0) {
        const hasText = e.clipboardData?.types?.includes("text/plain");
        if (!hasText) e.preventDefault();
        for (const item of imageItems) {
          const file = item.getAsFile();
          if (file) {
            void addPastedAttachment(file, `Screenshot ${new Date().toLocaleTimeString()}.png`);
          }
        }
        return;
      }
    }

    const hasText = e.clipboardData?.types?.includes("text/plain");
    if (hasText) return;
    e.preventDefault();

    void (async () => {
      const file = await readImageFromClipboardApi();
      if (file) {
        await addPastedAttachment(file, `Screenshot ${new Date().toLocaleTimeString()}.png`);
        return;
      }

      const systemImage = await readImageFromSystemClipboard();
      if (systemImage?.dataUrl) {
        await addPastedDataUrl(systemImage.dataUrl, systemImage.mime);
      }
    })();
  }, [addPastedAttachment, addPastedDataUrl, readImageFromClipboardApi, readImageFromSystemClipboard]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isRunning) { handleStop(); return; }
      handleSend();
      return;
    }
    
    // Shift+Enter - allow multiline (default behavior)
  };

  const handleCompact = useCallback(() => {
    if (!activeSessionId || isRunning || isCompacting) return;
    sendEvent({ type: "session.compact", payload: { sessionId: activeSessionId } });
  }, [activeSessionId, isCompacting, isRunning, sendEvent]);

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = "auto";
    const scrollHeight = target.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      target.style.height = `${MAX_HEIGHT}px`;
      target.style.overflowY = "auto";
    } else {
      target.style.height = `${scrollHeight}px`;
      target.style.overflowY = "hidden";
    }
  };

  useEffect(() => {
    if (!promptRef.current) return;
    promptRef.current.style.height = "auto";
    const scrollHeight = promptRef.current.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      promptRef.current.style.height = `${MAX_HEIGHT}px`;
      promptRef.current.style.overflowY = "auto";
    } else {
      promptRef.current.style.height = `${scrollHeight}px`;
      promptRef.current.style.overflowY = "hidden";
    }
  }, [prompt]);

  return (
    <section className="fixed bottom-0 left-[280px] right-0 bg-gradient-to-t from-surface via-surface to-transparent pb-6 px-2 lg:pb-8 pt-8 z-20">
      <div className="mx-auto w-full max-w-full">
        <div className="flex w-full flex-col gap-2 rounded-2xl border border-ink-900/10 bg-surface px-4 py-3 shadow-card">
          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <AttachmentPreview
                  key={attachment.id}
                  attachment={attachment}
                  onRemove={() => removeAttachment(attachment.id)}
                />
              ))}
            </div>
          )}
          <div className="flex w-full items-end gap-3">
          {/* File attachment button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept={ACCEPT_STRING}
            multiple
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink-700 hover:bg-surface-secondary transition-colors"
            aria-label={t("prompt.attachFile")}
            title={t("prompt.attachFileTitle")}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <textarea
            rows={1}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm text-ink-800 placeholder:text-muted focus:outline-none"
            placeholder={attachments.length > 0 ? t("prompt.placeholderWithAttachments") : t("prompt.placeholder")}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            ref={promptRef}
          />
          {hasHistory && (
            <button
              className={`flex h-9 shrink-0 items-center justify-center rounded-full border px-3 text-xs transition-colors ${
                isCompacting
                  ? "border-accent/40 text-accent cursor-not-allowed opacity-60"
                  : "border-ink-900/15 text-muted hover:border-accent/40 hover:text-accent"
              }`}
              onClick={handleCompact}
              disabled={isCompacting || isRunning}
              aria-label="Compact conversation"
              title="Compact conversation"
            >
              {isCompacting ? "Compacting..." : "Compact"}
            </button>
          )}
          <button
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${isRunning ? "bg-error text-white hover:bg-error/90" : "bg-accent text-white hover:bg-accent-hover"}`}
            onClick={isRunning ? handleStop : () => { void handleSend(); }}
            aria-label={isRunning ? t("prompt.stopSession") : t("prompt.sendPrompt")}
          >
            {isRunning ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M3.4 20.6 21 12 3.4 3.4l2.8 7.2L16 12l-9.8 1.4-2.8 7.2Z" fill="currentColor" /></svg>
            )}
          </button>
          </div>
        </div>
        <div className="mt-2 px-2 text-xs text-muted text-center">
          <Trans
            i18nKey="prompt.hint"
            components={{
              enter: <span className="font-medium text-ink-700" />,
              shift: <span className="font-medium text-ink-700" />
            }}
          />
        </div>
      </div>
    </section>
  );
}
