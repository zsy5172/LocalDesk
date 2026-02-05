import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ApiSettings, LLMModel, ClientEvent, Attachment, CharterData, CharterItem } from "../types";
import { getPlatform } from "../platform";
import { useAppStore } from "../store/useAppStore";

// Charter template types
type CharterTemplate = 'none' | 'blank' | 'code-review' | 'documentation' | 'bugfix' | 'feature';

interface CharterTemplateInfo {
  id: CharterTemplate;
  name: string;
  description: string;
  icon: string;
}

const CHARTER_TEMPLATES: CharterTemplateInfo[] = [
  { id: 'none', name: '无 Charter', description: '不使用主题化工作区', icon: '⚪' },
  { id: 'blank', name: '空白模板', description: '自定义 Charter 内容', icon: '📝' },
  { id: 'code-review', name: '代码审查', description: '审查代码质量和安全性', icon: '🔍' },
  { id: 'documentation', name: '文档编写', description: '编写或更新文档', icon: '📚' },
  { id: 'bugfix', name: 'Bug 修复', description: '定位和修复问题', icon: '🐛' },
  { id: 'feature', name: '功能开发', description: '开发新功能', icon: '✨' },
];

// Generate charter item with unique ID
function createCharterItem(content: string, prefix: string): CharterItem {
  const shortId = Math.random().toString(36).substring(2, 10);
  return { id: `${prefix}-${shortId}`, content };
}

// Generate charter from template
function generateCharterFromTemplate(template: CharterTemplate, context?: string): CharterData | undefined {
  if (template === 'none') return undefined;
  
  const now = Date.now();
  const base = {
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  switch (template) {
    case 'blank':
      return {
        ...base,
        goal: createCharterItem('定义你的目标', 'goal'),
        definitionOfDone: [createCharterItem('定义完成标准', 'dod')],
      };
    
    case 'code-review':
      return {
        ...base,
        goal: createCharterItem('审查代码质量、安全性和最佳实践', 'goal'),
        nonGoals: [
          createCharterItem('不进行功能开发或重构', 'ng'),
          createCharterItem('不修改测试逻辑', 'ng'),
        ],
        definitionOfDone: [
          createCharterItem('所有安全问题已识别并记录', 'dod'),
          createCharterItem('代码风格问题已标注', 'dod'),
          createCharterItem('潜在 bug 已列出', 'dod'),
        ],
        constraints: [
          createCharterItem('只读审查，不修改代码', 'con'),
          createCharterItem('按文件顺序审查', 'con'),
        ],
        invariants: [
          createCharterItem('不泄露敏感信息', 'inv'),
        ],
      };
    
    case 'documentation':
      return {
        ...base,
        goal: createCharterItem('编写清晰、准确、易于理解的文档', 'goal'),
        nonGoals: [
          createCharterItem('不修改代码逻辑', 'ng'),
        ],
        definitionOfDone: [
          createCharterItem('文档结构清晰', 'dod'),
          createCharterItem('示例代码可运行', 'dod'),
          createCharterItem('无拼写错误', 'dod'),
        ],
        constraints: [
          createCharterItem('使用 Markdown 格式', 'con'),
          createCharterItem('保持一致的风格', 'con'),
        ],
      };
    
    case 'bugfix':
      return {
        ...base,
        goal: createCharterItem('定位并修复问题的根本原因', 'goal'),
        nonGoals: [
          createCharterItem('不进行功能增强', 'ng'),
          createCharterItem('不重构无关代码', 'ng'),
        ],
        definitionOfDone: [
          createCharterItem('问题已复现并理解', 'dod'),
          createCharterItem('修复已测试通过', 'dod'),
          createCharterItem('无回归问题', 'dod'),
        ],
        constraints: [
          createCharterItem('最小化修改范围', 'con'),
        ],
        invariants: [
          createCharterItem('不破坏现有测试', 'inv'),
          createCharterItem('不引入新的安全漏洞', 'inv'),
        ],
      };
    
    case 'feature':
      return {
        ...base,
        goal: createCharterItem('实现新功能并保证代码质量', 'goal'),
        definitionOfDone: [
          createCharterItem('功能实现完整', 'dod'),
          createCharterItem('测试覆盖率达标', 'dod'),
          createCharterItem('文档已更新', 'dod'),
        ],
        constraints: [
          createCharterItem('遵循现有代码风格', 'con'),
          createCharterItem('保持向后兼容', 'con'),
        ],
        invariants: [
          createCharterItem('不破坏现有功能', 'inv'),
          createCharterItem('不引入安全漏洞', 'inv'),
        ],
      };
    
    default:
      return undefined;
  }
}

interface StartSessionModalProps {
  cwd: string;
  prompt: string;
  pendingStart: boolean;
  onCwdChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onStart: (options?: { enableSessionGitRepo?: boolean; charter?: CharterData }) => void;
  onClose: () => void;
  apiSettings: ApiSettings | null;
  availableModels: Array<{ id: string; name: string; description?: string }>;
  selectedModel: string | null;
  onModelChange: (model: string | null) => void;
  llmModels?: LLMModel[];
  temperature: number;
  onTemperatureChange: (temp: number) => void;
  sendTemperature?: boolean;
  onSendTemperatureChange?: (send: boolean) => void;
}

export function StartSessionModal({
  cwd,
  prompt,
  pendingStart,
  onCwdChange,
  onPromptChange,
  onStart,
  onClose,
  apiSettings,
  availableModels,
  selectedModel,
  onModelChange,
  llmModels = [],
  temperature,
  onTemperatureChange,
  sendTemperature = true,
  onSendTemperatureChange
}: StartSessionModalProps) {
  const { t } = useTranslation();
  const llmProviders = useAppStore((s) => s.llmProviders);
  const schedulerDefaultModel = useAppStore((s) => s.schedulerDefaultModel);
  const schedulerDefaultTemperature = useAppStore((s) => s.schedulerDefaultTemperature);
  const schedulerDefaultSendTemperature = useAppStore((s) => s.schedulerDefaultSendTemperature);
  const [recentCwds, setRecentCwds] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const attachments = useAppStore((state) => state.attachments);
  const addAttachment = useAppStore((state) => state.addAttachment);
  const removeAttachment = useAppStore((state) => state.removeAttachment);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const [enableSessionGitRepo, setEnableSessionGitRepo] = useState<boolean>(apiSettings?.enableSessionGitRepo ?? false);
  const [charterTemplate, setCharterTemplate] = useState<CharterTemplate>('none');

  useEffect(() => {
    getPlatform()
      .getRecentCwds()
      .then(setRecentCwds)
      .catch((error) => {
        console.error("[StartSessionModal] getRecentCwds failed", { error });
      });
  }, []);

  useEffect(() => {
    setEnableSessionGitRepo(apiSettings?.enableSessionGitRepo ?? false);
  }, [apiSettings?.enableSessionGitRepo]);

  // Handle start with charter generation
  const handleStart = useCallback(() => {
    const charter = generateCharterFromTemplate(charterTemplate);
    onStart({ enableSessionGitRepo, charter });
  }, [charterTemplate, enableSessionGitRepo, onStart]);

  // Show only enabled models from settings.
  // If no LLM models are configured, fall back to legacy API models.
  const allAvailableModels = (() => {
    const enabledLlmModels = llmModels.filter(m => m.enabled);
    if (enabledLlmModels.length > 0) {
      return enabledLlmModels.map(model => {
        // Find provider name by providerId
        const provider = llmProviders.find(p => p.id === model.providerId);
        const providerLabel = provider?.name || model.providerType;
        return {
          id: model.id,
          name: model.name,
          description: `${providerLabel} | ${model.description || ''}`
        };
      });
    }

    return availableModels.map(model => ({
      id: model.id,
      name: model.name,
      description: model.description
    }));
  })();

  // Filter models based on search
  const filteredModels = modelSearch.trim() === '' 
    ? allAvailableModels 
    : allAvailableModels.filter(model => 
        model.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        model.description?.toLowerCase().includes(modelSearch.toLowerCase())
      );

  // Set default model: schedulerDefaultModel > apiSettings.model
  useEffect(() => {
    if (!selectedModel) {
      if (schedulerDefaultModel) {
        const idByName = allAvailableModels.find(m => m.name === schedulerDefaultModel)?.id;
        const modelId = schedulerDefaultModel.includes("::")
          ? schedulerDefaultModel
          : (idByName ?? schedulerDefaultModel);
        onModelChange(modelId);
      } else if (apiSettings?.model) {
        onModelChange(apiSettings.model);
      }
    }
  }, [apiSettings, selectedModel, onModelChange, schedulerDefaultModel, allAvailableModels]);

  // Set default temperature from scheduler defaults
  useEffect(() => {
    if (schedulerDefaultTemperature !== null) {
      onTemperatureChange(schedulerDefaultTemperature);
    }
    if (schedulerDefaultSendTemperature !== null && onSendTemperatureChange) {
      onSendTemperatureChange(schedulerDefaultSendTemperature);
    }
  }, [schedulerDefaultTemperature, schedulerDefaultSendTemperature, onTemperatureChange, onSendTemperatureChange]);

  const handleSelectDirectory = async () => {
    const result = await getPlatform().selectDirectory();
    if (result) onCwdChange(result);
  };

  const fileToAttachment = useCallback((file: File): Promise<Attachment | null> => {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setGlobalError(t("prompt.errorFileTooLarge", { name: file.name, size: Math.round(maxSize / (1024 * 1024)) }));
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          type: 'image',
          name: file.name,
          mimeType: file.type || 'image/png',
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
  }, [setGlobalError, t]);

  const saveImageToWorkspace = useCallback(async (attachment: Attachment, fileName?: string) => {
    if (attachment.type !== 'image') return attachment;
    const targetCwd = cwd?.trim();
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
      console.warn('[StartSessionModal] Failed to save pasted image:', error);
    }

    return attachment;
  }, [cwd]);

  const addPastedAttachment = useCallback(async (file: File, nameOverride?: string) => {
    const attachment = await fileToAttachment(file);
    if (!attachment) return;
    const renamed = nameOverride ? { ...attachment, name: nameOverride } : attachment;
    const saved = await saveImageToWorkspace(renamed, renamed.name);
    addAttachment(saved);
  }, [addAttachment, fileToAttachment, saveImageToWorkspace]);

  const addPastedDataUrl = useCallback(async (dataUrl: string, mimeType?: string) => {
    const attachment: Attachment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
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
      console.warn('[StartSessionModal] Clipboard API read failed:', error);
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
      console.warn('[StartSessionModal] Electron clipboard image read failed:', error);
    }

    try {
      const tauri = (window as any).__TAURI__;
      const invoke = tauri?.invoke || tauri?.core?.invoke;
      if (typeof invoke === 'function') {
        const dataUrl: string | null = await invoke('read_clipboard_image');
        if (dataUrl) return { dataUrl, mime: 'image/png' };
      }
    } catch (error) {
      console.warn('[StartSessionModal] Tauri clipboard image fallback failed:', error);
    }

    return null;
  }, []);

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

  // Find the selected model in the list to display its name instead of ID
  const displayModel = (() => {
    if (selectedModel) {
      const found = allAvailableModels.find(m => m.id === selectedModel);
      return found ? found.name : selectedModel;
    }
    if (apiSettings?.model) {
      const found = allAvailableModels.find(m => m.id === apiSettings.model);
      return found ? found.name : apiSettings.model;
    }
    return t("startSession.selectModel");
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-ink-900/5 bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold text-ink-800">{t("startSession.title")}</div>
          <button className="rounded-full p-1.5 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors" onClick={onClose} aria-label={t("common.close")}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">{t("startSession.subtitle")}</p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{t("startSession.modelLabel")}</span>
            </div>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="w-full rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors text-left flex items-center justify-between">
                <span className="truncate">{displayModel}</span>
                <svg className="w-4 h-4 text-muted shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="z-50 min-w-[300px] max-w-[400px] rounded-xl border border-ink-900/10 bg-white shadow-lg" sideOffset={8}>
                  {/* Search input */}
                  <div className="p-2 border-b border-ink-900/10">
                    <input
                      type="text"
                      placeholder={t("startSession.searchModelsPlaceholder")}
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="w-full rounded-lg border border-ink-900/10 bg-surface-secondary px-3 py-2 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  
                  {/* Models list */}
                  <div className="max-h-60 overflow-y-auto p-1">
                    {allAvailableModels.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted">{t("startSession.noModelsAvailable")}</div>
                    ) : filteredModels.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted">{t("startSession.noModelsFound", { query: modelSearch })}</div>
                    ) : (
                      filteredModels.map((model) => (
                        <DropdownMenu.Item
                          key={model.id}
                          className="flex flex-col cursor-pointer rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-ink-900/5"
                          onSelect={() => {
                            onModelChange(model.id);
                            setModelSearch('');
                          }}
                        >
                          <span className="font-medium truncate">{model.name}</span>
                          {model.description && (
                            <span className="text-xs text-muted truncate">{model.description}</span>
                          )}
                        </DropdownMenu.Item>
                      ))
                    )}
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {/* Set as default for scheduled tasks (store API model name, not internal id) */}
            {selectedModel && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted">
                  {(() => {
                    const apiModelName = allAvailableModels.find(m => m.id === selectedModel)?.name ?? selectedModel;
                    const isProviderModel = Boolean(selectedModel && selectedModel.includes("::"));
                    const defaultMatch = isProviderModel
                      ? schedulerDefaultModel === selectedModel
                      : schedulerDefaultModel === apiModelName;
                    return defaultMatch
                      ? t("startSession.defaultForScheduled")
                      : "";
                  })()}
                </span>
                {(() => {
                  const apiModelName = allAvailableModels.find(m => m.id === selectedModel)?.name ?? selectedModel;
                  const isProviderModel = Boolean(selectedModel && selectedModel.includes("::"));
                  const defaultMatch = isProviderModel
                    ? schedulerDefaultModel === selectedModel
                    : schedulerDefaultModel === apiModelName;
                  return !defaultMatch;
                })() && (
                  <button
                    type="button"
                    onClick={() => {
                      const apiModelName = allAvailableModels.find(m => m.id === selectedModel)?.name ?? selectedModel;
                      const modelId = selectedModel?.includes("::") ? selectedModel : apiModelName;
                      getPlatform().sendClientEvent({
                        type: "scheduler.default_model.set",
                        payload: { modelId }
                      } as ClientEvent);
                    }}
                    className="text-[10px] text-accent hover:text-accent-hover transition-colors"
                  >
                    {t("startSession.setDefaultForTasks")}
                  </button>
                )}
              </div>
            )}
          </label>

          {/* Temperature */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted">{t("startSession.temperatureLabel")}</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendTemperature !== false}
                    onChange={(e) => onSendTemperatureChange?.(e.target.checked)}
                    className="w-3 h-3 rounded border-ink-300 text-accent focus:ring-accent/20"
                  />
                  <span className="text-[10px] text-muted">{t("startSession.sendTemperature")}</span>
                </label>
              </div>
              <span className="text-xs text-ink-600 font-mono">{temperature.toFixed(1)}</span>
            </div>
            <div className="relative">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
                disabled={sendTemperature === false}
                className="w-full h-2 bg-ink-100 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                style={{
                  background: sendTemperature !== false 
                    ? `linear-gradient(to right, #f59e0b ${(temperature / 2) * 100}%, #e5e5e5 ${(temperature / 2) * 100}%)`
                    : '#e5e5e5'
                }}
              />
            </div>
            <p className="text-[10px] text-muted-light">
              {t("startSession.temperatureHint")}
            </p>
          </div>

          <label className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{t("startSession.workspaceLabel")}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-ink-100 text-ink-600 font-medium">{t("common.optional")}</span>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                placeholder={t("startSession.workspacePlaceholder")}
                value={cwd}
                onChange={(e) => onCwdChange(e.target.value)}
              />
              <button
                type="button"
                onClick={handleSelectDirectory}
                className="rounded-xl border border-ink-900/10 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-surface-tertiary transition-colors"
              >
                {t("common.browse")}
              </button>
            </div>
            <p className="text-[11px] text-muted-light">
              {t("startSession.workspaceHint")}
            </p>
            {recentCwds.length > 0 && (
              <div className="mt-2 grid gap-2 w-full">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-light">{t("startSession.recentLabel")}</div>
                <div className="flex flex-wrap gap-2 w-full min-w-0 max-h-32 overflow-y-auto">
                  {recentCwds.map((path) => (
                    <button
                      key={path}
                      type="button"
                      className={`truncate rounded-full border px-3 py-1.5 text-xs transition-colors whitespace-nowrap ${cwd === path ? "border-accent/60 bg-accent/10 text-ink-800" : "border-ink-900/10 bg-white text-muted hover:border-ink-900/20 hover:text-ink-700"}`}
                      onClick={() => onCwdChange(path)}
                      title={path}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </label>
          <label className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{t("startSession.initialMessageLabel")}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-ink-100 text-ink-600 font-medium">{t("common.optional")}</span>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-lg border border-ink-900/10 bg-surface-secondary px-2.5 py-1.5 text-xs text-ink-700"
                  >
                    {attachment.type === 'image' ? (
                      <img
                        src={attachment.dataUrl}
                        alt={attachment.name}
                        className="h-9 w-9 rounded-md object-cover border border-ink-900/10"
                      />
                    ) : (
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-tertiary text-[10px] text-muted">
                        {attachment.type.toUpperCase()}
                      </span>
                    )}
                    <span className="font-medium">{attachment.type}</span>
                    <span className="truncate max-w-[220px]">{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="text-ink-400 hover:text-error transition-colors"
                      aria-label={t("startSession.removeAttachment")}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              rows={4}
              className="rounded-xl border border-ink-900/10 bg-surface-secondary p-3 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors resize-none"
              placeholder={t("startSession.initialMessagePlaceholder")}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !pendingStart) {
                  e.preventDefault();
                  handleStart();
                }
              }}
            />
            <div className="text-xs text-muted text-center">
              <Trans
                i18nKey="startSession.startHint"
                values={{
                  shortcut: typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘ + Enter' : 'Ctrl + Enter'
                }}
                components={{
                  shortcut: <span className="font-medium text-ink-700" />
                }}
              />
            </div>
          </label>

          {/* Charter Template Selection */}
          <div className="rounded-xl border border-ink-900/10 bg-surface px-4 py-3">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="grid gap-0.5">
                  <div className="text-sm font-medium text-ink-800">主题化工作区 (Charter)</div>
                  <div className="text-[11px] text-muted-light">定义 Session 的目标、约束和完成标准</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CHARTER_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setCharterTemplate(template.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-all ${
                      charterTemplate === template.id
                        ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                        : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50'
                    }`}
                  >
                    <span className="text-lg">{template.icon}</span>
                    <span className="text-xs font-medium text-ink-700">{template.name}</span>
                  </button>
                ))}
              </div>
              {charterTemplate !== 'none' && (
                <div className="text-xs text-ink-500 bg-ink-50 rounded-lg p-2 mt-1">
                  {CHARTER_TEMPLATES.find(t => t.id === charterTemplate)?.description}
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-xl border border-ink-900/10 bg-surface px-4 py-3">
            <div className="grid gap-0.5">
              <div className="text-sm font-medium text-ink-800">{t("startSession.sessionGitTitle")}</div>
              <div className="text-[11px] text-muted-light">{t("startSession.sessionGitDescription")}</div>
            </div>
            <button
              type="button"
              onClick={() => setEnableSessionGitRepo(!enableSessionGitRepo)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enableSessionGitRepo ? 'bg-accent' : 'bg-ink-900/15'}`}
              aria-pressed={enableSessionGitRepo}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${enableSessionGitRepo ? 'translate-x-5' : 'translate-x-1'}`}
              />
            </button>
          </label>

          <button
            className="flex flex-col items-center rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-soft hover:bg-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => handleStart()}
            disabled={pendingStart}
          >
            {pendingStart ? (
              <svg aria-hidden="true" className="w-5 h-5 animate-spin" viewBox="0 0 100 101" fill="none">
                <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" opacity="0.3" />
                <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="white" />
              </svg>
            ) : t("startSession.startChat")}
          </button>
        </div>
      </div>
    </div>
  );
}
