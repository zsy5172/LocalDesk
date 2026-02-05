// @ts-nocheck
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Trans, useTranslation } from "react-i18next";
import type { 
  ApiSettings, 
  WebSearchProvider, 
  ZaiApiUrl, 
  ZaiReaderApiUrl, 
  LLMProvider,
  LLMModel,
  LLMProviderSettings,
  LLMProviderType,
  Skill
} from "../types";
import { SkillsTab } from "./SkillsTab";
import { getPlatform } from "../platform";
import { useAppStore } from "../store/useAppStore";
import { applyLanguageSetting } from "../i18n";

type SettingsModalProps = {
  onClose: () => void;
  onSave: (settings: ApiSettings) => void;
  currentSettings: ApiSettings | null;
};

type TabId = 'llm-models' | 'web-tools' | 'tools' | 'language' | 'skills' | 'memory-mode';

export function SettingsModal({ onClose, onSave, currentSettings }: SettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('llm-models');
  
  // Original API settings state
  const [apiKey, setApiKey] = useState(currentSettings?.apiKey || "");
  const [baseUrl, setBaseUrl] = useState(currentSettings?.baseUrl || "");
  const [model, setModel] = useState(currentSettings?.model || "");
  const [temperature, setTemperature] = useState(currentSettings?.temperature?.toString() || "0.3");
  const [tavilyApiKey, setTavilyApiKey] = useState(currentSettings?.tavilyApiKey || "");
  const [enableTavilySearch, setEnableTavilySearch] = useState(currentSettings?.enableTavilySearch || false);
  const [zaiApiKey, setZaiApiKey] = useState(currentSettings?.zaiApiKey || "");
  const [webSearchProvider, setWebSearchProvider] = useState<WebSearchProvider>(currentSettings?.webSearchProvider || 'tavily');
  const [zaiApiUrl, setZaiApiUrl] = useState<ZaiApiUrl>(currentSettings?.zaiApiUrl || 'default');
  const [permissionMode, setPermissionMode] = useState<'default' | 'ask'>(currentSettings?.permissionMode || 'ask');
  const [enableMemory, setEnableMemory] = useState(currentSettings?.enableMemory || false);
  const [enableZaiReader, setEnableZaiReader] = useState(currentSettings?.enableZaiReader || false);
  const [zaiReaderApiUrl, setZaiReaderApiUrl] = useState<ZaiReaderApiUrl>(currentSettings?.zaiReaderApiUrl || 'default');
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [memoryDirty, setMemoryDirty] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  // New tool group toggles
  const [enableGitTools, setEnableGitTools] = useState(currentSettings?.enableGitTools || false);
  const [enableBrowserTools, setEnableBrowserTools] = useState(currentSettings?.enableBrowserTools || false);
  const [enableDuckDuckGo, setEnableDuckDuckGo] = useState(currentSettings?.enableDuckDuckGo || false);
  const [enableFetchTools, setEnableFetchTools] = useState(currentSettings?.enableFetchTools || false);
  const [enableImageTools, setEnableImageTools] = useState(currentSettings?.enableImageTools ?? false);
  const [conversationDataDir, setConversationDataDir] = useState(currentSettings?.conversationDataDir || "");
  const [enableSessionGitRepo, setEnableSessionGitRepo] = useState(currentSettings?.enableSessionGitRepo ?? false);
  const [enablePreview, setEnablePreview] = useState(currentSettings?.enablePreview ?? false);
  const [previewMode, setPreviewMode] = useState<'always' | 'ask' | 'never'>(currentSettings?.previewMode ?? 'always');
  const [language, setLanguage] = useState<ApiSettings["language"]>(currentSettings?.language || "auto");
  const [sessionGitChecking, setSessionGitChecking] = useState(false);
  const [sessionGitError, setSessionGitError] = useState<string | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [showTavilyPassword, setShowTavilyPassword] = useState(false);
  const [showZaiPassword, setShowZaiPassword] = useState(false);

  // LLM Provider settings - get from global store
  const globalLlmProviders = useAppStore((s) => s.llmProviders);
  const globalLlmModels = useAppStore((s) => s.llmModels);
  
  // Local state for editing (initialized from store)
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>(globalLlmProviders);
  const [llmModels, setLlmModels] = useState<LLMModel[]>(globalLlmModels);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  
  // Sync local state when global store updates
  useEffect(() => {
    if (globalLlmProviders.length > 0) {
      setLlmProviders(globalLlmProviders);
    }
  }, [globalLlmProviders]);
  
  useEffect(() => {
    if (globalLlmModels.length > 0) {
      setLlmModels(globalLlmModels);
    }
  }, [globalLlmModels]);

  // Skills state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsMarketplaceUrl, setSkillsMarketplaceUrl] = useState("");
  const [skillsLastFetched, setSkillsLastFetched] = useState<number | undefined>();
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  const loadMemoryContent = useCallback(async () => {
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const content = await getPlatform().invoke<string>('read-memory');
      setMemoryContent(content || "");
      setMemoryLoaded(true);
      setMemoryDirty(false);
    } catch (error) {
      console.error('Failed to load memory:', error);
      setMemoryContent("");
      setMemoryLoaded(false);
      setMemoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setMemoryLoading(false);
    }
  }, [t]);

  const handleSessionGitToggle = useCallback(async (nextEnabled: boolean) => {
    if (!nextEnabled) {
      setEnableSessionGitRepo(false);
      setSessionGitError(null);
      return;
    }

    setSessionGitChecking(true);
    setSessionGitError(null);
    try {
      const available = await getPlatform().invoke<boolean>("check-git-available");
      if (available) {
        setEnableSessionGitRepo(true);
      } else {
        setEnableSessionGitRepo(false);
        setSessionGitError(t("settings.sessionGit.notFound"));
      }
    } catch (error) {
      console.error("[SettingsModal] Failed to check Git availability:", error);
      setEnableSessionGitRepo(false);
      setSessionGitError(t("settings.sessionGit.checkFailed"));
    } finally {
      setSessionGitChecking(false);
    }
  }, []);

  const saveMemoryContent = async () => {
    try {
      await getPlatform().invoke('write-memory', memoryContent);
    } catch (error) {
      console.error('Failed to save memory:', error);
      setMemoryError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (currentSettings) {
      setApiKey(currentSettings.apiKey || "");
      setBaseUrl(currentSettings.baseUrl || "");
      setModel(currentSettings.model || "");
      setTemperature(currentSettings.temperature?.toString() || "0.3");
      setTavilyApiKey(currentSettings.tavilyApiKey || "");
      setEnableTavilySearch(currentSettings.enableTavilySearch || false);
      setZaiApiKey(currentSettings.zaiApiKey || "");
      setWebSearchProvider(currentSettings.webSearchProvider || 'tavily');
      setZaiApiUrl(currentSettings.zaiApiUrl || 'default');
      setPermissionMode(currentSettings.permissionMode || 'ask');
      setEnableMemory(currentSettings.enableMemory || false);
      setEnableZaiReader(currentSettings.enableZaiReader || false);
      setZaiReaderApiUrl(currentSettings.zaiReaderApiUrl || 'default');
      // New tool group toggles
      setEnableGitTools(currentSettings.enableGitTools || false);
      setEnableBrowserTools(currentSettings.enableBrowserTools || false);
      setEnableDuckDuckGo(currentSettings.enableDuckDuckGo || false);
      setEnableFetchTools(currentSettings.enableFetchTools || false);
      setEnableImageTools(currentSettings.enableImageTools ?? false);
      setConversationDataDir(currentSettings.conversationDataDir || "");
      setEnableSessionGitRepo(currentSettings.enableSessionGitRepo ?? false);
      setEnablePreview(currentSettings.enablePreview ?? false);
      setPreviewMode(currentSettings.previewMode ?? 'always');
      setLanguage(currentSettings.language || "auto");
      setSessionGitChecking(false);
      setSessionGitError(null);
    }
    
    // ALWAYS load LLM providers from separate file
    console.log('[SettingsModal] Loading LLM providers from file...');
    loadLlmProviders();
    
    // Load memory content if memory is enabled
    if (currentSettings?.enableMemory) {
      loadMemoryContent();
    }
  }, [currentSettings, loadMemoryContent]);

  // Avoid overwriting memory.md with an empty string unless the user edited it.
  const setMemoryContentUser = useCallback((value: string) => {
    setMemoryContent(value);
    setMemoryDirty(true);
  }, []);

  // Auto-load memory when enabled so Save won't truncate the file.
  useEffect(() => {
    if (!enableMemory) return;
    if (memoryLoaded || memoryLoading) return;
    void loadMemoryContent();
  }, [enableMemory, memoryLoaded, memoryLoading, loadMemoryContent]);

  const loadLlmProviders = () => {
    // Data comes from global store, just trigger refresh
    setLlmLoading(true);
    setLlmError(null);
    getPlatform().sendClientEvent({ type: "llm.providers.get" });
    
    // Loading state will be cleared when global store updates
    setTimeout(() => setLlmLoading(false), 500);
  };

  const fetchProviderModels = async (providerId: string) => {
    setLlmLoading(true);
    setLlmError(null);
    
    getPlatform().sendClientEvent({ type: "llm.models.fetch", payload: { providerId } });
    
    const unsubscribe = getPlatform().onServerEvent((event) => {
      if (event.type === "llm.models.fetched") {
        const { models } = event.payload;
        setLlmModels(models);
        setLlmLoading(false);
        unsubscribe();
        loadLlmProviders(); // Reload to get updated settings
      } else if (event.type === "llm.models.error") {
        setLlmError(event.payload.message);
        setLlmLoading(false);
        unsubscribe();
      }
    });

    (window as any).__llmModelsUnsubscribe = unsubscribe;
  };

  const toggleModelEnabled = (modelId: string) => {
    setLlmModels(prev => prev.map(m => 
      m.id === modelId ? { ...m, enabled: !m.enabled } : m
    ));
  };

  const toggleProviderEnabled = (providerId: string) => {
    setLlmProviders(prev => prev.map(p => 
      p.id === providerId ? { ...p, enabled: !p.enabled } : p
    ));
  };

  const deleteProvider = (providerId: string) => {
    setLlmProviders(prev => prev.filter(p => p.id !== providerId));
    setLlmModels(prev => prev.filter(m => m.providerId !== providerId));
  };

  // Skills functions
  const loadSkills = useCallback(() => {
    setSkillsLoading(true);
    setSkillsError(null);
    getPlatform().sendClientEvent({ type: "skills.get" });
  }, []);

  const refreshSkills = useCallback(() => {
    setSkillsLoading(true);
    setSkillsError(null);
    getPlatform().sendClientEvent({ type: "skills.refresh" });
  }, []);

  const toggleSkill = useCallback((skillId: string, enabled: boolean) => {
    getPlatform().sendClientEvent({ type: "skills.toggle", payload: { skillId, enabled } });
    setSkills(prev => prev.map(s => s.id === skillId ? { ...s, enabled } : s));
  }, []);

  const setMarketplaceUrl = useCallback((url: string) => {
    getPlatform().sendClientEvent({ type: "skills.set-marketplace", payload: { url } });
    setSkillsMarketplaceUrl(url);
  }, []);

  // Load skills on mount
  useEffect(() => {
    loadSkills();
    
    const unsubscribe = getPlatform().onServerEvent((event) => {
      if (event.type === "skills.loaded") {
        setSkills(event.payload.skills);
        setSkillsMarketplaceUrl(event.payload.marketplaceUrl);
        setSkillsLastFetched(event.payload.lastFetched);
        setSkillsLoading(false);
      } else if (event.type === "skills.error") {
        setSkillsError(event.payload.message);
        setSkillsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [loadSkills]);

  const handleSave = async () => {
    const tempValue = parseFloat(temperature);
    
    if (enableMemory) {
      if (memoryLoading) {
        setMemoryError(t("settings.memory.stillLoading"));
        return;
      }
      if (memoryDirty) {
        await saveMemoryContent();
      }
    }

    // Prepare LLM provider settings
    const llmProviderSettings: LLMProviderSettings = {
      providers: llmProviders,
      models: llmModels
    };
    
    console.log('[SettingsModal] Saving settings...');
    console.log('[SettingsModal] Providers count:', llmProviders.length);
    console.log('[SettingsModal] Models count:', llmModels.length);
    console.log('[SettingsModal] Providers:', llmProviders);
    console.log('[SettingsModal] Models:', llmModels);
    
    const settingsToSave = {
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      temperature: !isNaN(tempValue) ? tempValue : 0.3,
      tavilyApiKey: tavilyApiKey.trim() || undefined,
      enableTavilySearch,
      zaiApiKey: zaiApiKey.trim() || undefined,
      webSearchProvider,
      zaiApiUrl,
      permissionMode,
      enableMemory,
      enableZaiReader,
      zaiReaderApiUrl,
      enableGitTools,
      enableBrowserTools,
      enableDuckDuckGo,
      enableFetchTools,
      enableImageTools,
      language,
      llmProviders: llmProviderSettings,
      conversationDataDir: conversationDataDir.trim() || undefined,
      enableSessionGitRepo,
      enablePreview,
      previewMode
    };
    
    console.log('[SettingsModal] Full settings to save:', settingsToSave);
    
    // Save API settings
    onSave(settingsToSave);
    
    // Also save LLM providers separately
    console.log('[SettingsModal] Saving LLM providers separately...');
    getPlatform().sendClientEvent({
      type: "llm.providers.save",
      payload: { settings: llmProviderSettings }
    });
    
    onClose();
  };

  const handleReset = () => {
    setApiKey("");
    setBaseUrl("");
    setModel("");
    setTemperature("0.3");
    setTavilyApiKey("");
    setEnableTavilySearch(true);
    setZaiApiKey("");
    setWebSearchProvider('tavily');
    setZaiApiUrl('default');
    setPermissionMode('ask');
    setEnableMemory(false);
    setEnableZaiReader(false);
    setZaiReaderApiUrl('default');
    setLlmProviders([]);
    setLlmModels([]);
    setEnableGitTools(false);
    setEnableBrowserTools(false);
    setEnableDuckDuckGo(false);
    setEnableFetchTools(false);
    setEnableImageTools(false);
    setConversationDataDir("");
    setEnableSessionGitRepo(false);
    setLanguage("auto");
    applyLanguageSetting("auto");
    setSessionGitChecking(false);
    setSessionGitError(null);
  };

  const handleLanguageChange = useCallback((nextLanguage: ApiSettings["language"]) => {
    setLanguage(nextLanguage);
    applyLanguageSetting(nextLanguage);
  }, []);

  useEffect(() => {
    return () => {
      if ((window as any).__llmProvidersUnsubscribe) {
        (window as any).__llmProvidersUnsubscribe();
      }
      if ((window as any).__llmModelsUnsubscribe) {
        (window as any).__llmModelsUnsubscribe();
      }
    };
  }, []);

  return (
    <Dialog.Root open onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[90vh] rounded-2xl border border-ink-900/10 bg-surface shadow-2xl flex flex-col">
          <div className="px-6 pt-6 pb-4 border-b border-ink-900/10">
            <Dialog.Title className="text-xl font-semibold text-ink-900">
              {t("settings.title")}
            </Dialog.Title>
          </div>

          <div className="flex border-b border-ink-900/10 overflow-x-auto">
            <button
              onClick={() => setActiveTab('llm-models')}
              className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'llm-models'
                  ? 'text-ink-900 border-b-2 border-accent'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {t("settings.tabs.llmModels")}
            </button>
            <button
              onClick={() => setActiveTab('web-tools')}
              className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'web-tools'
                  ? 'text-ink-900 border-b-2 border-accent'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {t("settings.tabs.webTools")}
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'tools'
                  ? 'text-ink-900 border-b-2 border-accent'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {t("settings.tabs.tools")}
            </button>
            <button
              onClick={() => setActiveTab('language')}
              className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'language'
                  ? 'text-ink-900 border-b-2 border-accent'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {t("settings.tabs.language")}
            </button>
            <button
              onClick={() => setActiveTab('skills')}
              className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'skills'
                  ? 'text-ink-900 border-b-2 border-accent'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {t("settings.tabs.skills")}
            </button>
            <button
              onClick={() => setActiveTab('memory-mode')}
              className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'memory-mode'
                  ? 'text-ink-900 border-b-2 border-accent'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {t("settings.tabs.memoryMode")}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'llm-models' ? (
              <LLMModelsTab
                providers={llmProviders}
                models={llmModels}
                loading={llmLoading}
                error={llmError}
                onToggleModel={toggleModelEnabled}
                onToggleProvider={toggleProviderEnabled}
                onDeleteProvider={deleteProvider}
                onFetchModels={fetchProviderModels}
                onReloadProviders={loadLlmProviders}
                setLlmProviders={setLlmProviders}
                setLlmModels={setLlmModels}
              />
            ) : activeTab === 'web-tools' ? (
              <WebToolsTab
                tavilyApiKey={tavilyApiKey}
                setTavilyApiKey={setTavilyApiKey}
                enableTavilySearch={enableTavilySearch}
                setEnableTavilySearch={setEnableTavilySearch}
                zaiApiKey={zaiApiKey}
                setZaiApiKey={setZaiApiKey}
                webSearchProvider={webSearchProvider}
                setWebSearchProvider={setWebSearchProvider}
                zaiApiUrl={zaiApiUrl}
                setZaiApiUrl={setZaiApiUrl}
                enableZaiReader={enableZaiReader}
                setEnableZaiReader={setEnableZaiReader}
                zaiReaderApiUrl={zaiReaderApiUrl}
                setZaiReaderApiUrl={setZaiReaderApiUrl}
                showTavilyPassword={showTavilyPassword}
                setShowTavilyPassword={setShowTavilyPassword}
                showZaiPassword={showZaiPassword}
                setShowZaiPassword={setShowZaiPassword}
              />
            ) : activeTab === 'tools' ? (
              <ToolsTab
                enableGitTools={enableGitTools}
                setEnableGitTools={setEnableGitTools}
                enableBrowserTools={enableBrowserTools}
                setEnableBrowserTools={setEnableBrowserTools}
                enableDuckDuckGo={enableDuckDuckGo}
                setEnableDuckDuckGo={setEnableDuckDuckGo}
                enableFetchTools={enableFetchTools}
                setEnableFetchTools={setEnableFetchTools}
                enableImageTools={enableImageTools}
                setEnableImageTools={setEnableImageTools}
                conversationDataDir={conversationDataDir}
                setConversationDataDir={setConversationDataDir}
                enableSessionGitRepo={enableSessionGitRepo}
                sessionGitChecking={sessionGitChecking}
                sessionGitError={sessionGitError}
                onToggleSessionGitRepo={handleSessionGitToggle}
                enablePreview={enablePreview}
                setEnablePreview={setEnablePreview}
                previewMode={previewMode}
                setPreviewMode={setPreviewMode}
              />
            ) : activeTab === 'language' ? (
              <LanguageTab
                language={language}
                onLanguageChange={handleLanguageChange}
              />
            ) : activeTab === 'skills' ? (
              <div className="p-6">
                <SkillsTab
                  skills={skills}
                  marketplaceUrl={skillsMarketplaceUrl}
                  lastFetched={skillsLastFetched}
                  loading={skillsLoading}
                  error={skillsError}
                  onToggleSkill={toggleSkill}
                  onRefresh={refreshSkills}
                  onSetMarketplaceUrl={setMarketplaceUrl}
                />
              </div>
            ) : (
              <MemoryModeTab
                enableMemory={enableMemory}
                setEnableMemory={setEnableMemory}
                memoryContent={memoryContent}
                setMemoryContent={setMemoryContentUser}
                memoryLoading={memoryLoading}
                loadMemoryContent={loadMemoryContent}
                memoryError={memoryError}
                permissionMode={permissionMode}
                setPermissionMode={setPermissionMode}
              />
            )}
          </div>

          <div className="px-6 py-4 border-t border-ink-900/10 flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-600 bg-ink-50 rounded-lg hover:bg-ink-100 transition-colors"
            >
              {t("common.reset")}
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-600 bg-ink-50 rounded-lg hover:bg-ink-100 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-ink-900 rounded-lg hover:bg-ink-800 transition-colors"
            >
              {t("common.save")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LLMModelsTab({
  providers,
  models,
  loading,
  error,
  onToggleModel,
  onToggleProvider,
  onDeleteProvider,
  onFetchModels,
  onReloadProviders,
  setLlmProviders,
  setLlmModels
}: {
  providers: LLMProvider[];
  models: LLMModel[];
  loading: boolean;
  error: string | null;
  onToggleModel: (modelId: string) => void;
  onToggleProvider: (providerId: string) => void;
  onDeleteProvider: (providerId: string) => void;
  onFetchModels: (providerId: string) => Promise<void>;
  onReloadProviders: () => void;
  setLlmProviders: (providers: LLMProvider[]) => void;
  setLlmModels: (models: LLMModel[]) => void;
}) {
  const { t } = useTranslation();
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
  const [providerSearchQueries, setProviderSearchQueries] = useState<Record<string, string>>({});
  const [collapsedProviders, setCollapsedProviders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initialCollapsed: Record<string, boolean> = {};
    providers.forEach(p => {
      initialCollapsed[p.id] = true;
    });
    setCollapsedProviders(initialCollapsed);
  }, [providers.length]);

  const handleProviderSearchChange = (providerId: string, query: string) => {
    setProviderSearchQueries(prev => ({ ...prev, [providerId]: query }));
  };

  const toggleProviderCollapse = (providerId: string) => {
    setCollapsedProviders(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const filterModels = (providerModels: LLMModel[], searchQuery: string) => {
    let filtered = providerModels;
    
    if (showOnlyEnabled) {
      filtered = filtered.filter(m => m.enabled);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.name.toLowerCase().includes(query) || 
        (m.description && m.description.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  };

  return (
      <div className="px-6 py-4 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-ink-900">{t("settings.llmProviders.title")}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOnlyEnabled(!showOnlyEnabled)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              showOnlyEnabled
                ? 'bg-accent text-white'
                : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            }`}
          >
            {t("settings.llmProviders.onlyEnabled")}
          </button>
          <AddProviderButton 
            onAdd={onReloadProviders} 
            providers={providers}
            models={models}
            setLlmProviders={setLlmProviders}
            setLlmModels={setLlmModels}
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {providers.length === 0 ? (
        <div className="p-6 bg-ink-50 rounded-lg border-2 border-dashed border-ink-200 text-center">
          <p className="text-sm text-ink-600 mb-2">
            {t("settings.llmProviders.emptyState")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((provider) => {
            const providerModels = models.filter(m => m.providerId === provider.id);
            const enabledModelsCount = providerModels.filter(m => m.enabled).length;
            const searchQuery = providerSearchQueries[provider.id] || '';
            const filteredModels = filterModels(providerModels, searchQuery);

            return (
              <div key={provider.id} className="border border-ink-200 rounded-lg overflow-hidden">
                <div 
                  className="px-4 py-3 bg-ink-50 flex items-center justify-between min-h-[68px] cursor-pointer hover:bg-ink-100/50 transition-colors"
                  onClick={() => toggleProviderCollapse(provider.id)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleProvider(provider.id);
                      }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        provider.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    </button>
                    <div className="flex-1 flex items-center gap-2">
                      <div>
                        <p className="font-medium text-ink-900">{provider.name}</p>
                        <p className="text-xs text-ink-500 uppercase">{provider.type}</p>
                      </div>
                      <svg 
                        className={`w-4 h-4 text-ink-400 transition-transform ${collapsedProviders[provider.id] ? '' : 'rotate-180'}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-600">
                      {t("settings.llmProviders.modelsCount", { enabled: enabledModelsCount, total: providerModels.length })}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFetchModels(provider.id);
                      }}
                      disabled={loading}
                      className="p-2 hover:bg-ink-200 rounded transition-colors disabled:opacity-50"
                      title={t("settings.llmProviders.loadModels")}
                    >
                      <svg className="w-4 h-4 text-ink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProvider(provider.id);
                      }}
                      className="p-2 hover:bg-red-100 rounded transition-colors text-red-600"
                      title={t("settings.llmProviders.deleteProvider")}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {!collapsedProviders[provider.id] && providerModels.length > 0 && (
                  <>
                    {providerModels.length > 5 && (
                      <div className="px-4 py-2 bg-ink-50 border-t border-ink-200">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => handleProviderSearchChange(provider.id, e.target.value)}
                          placeholder={t("settings.llmProviders.searchModelsPlaceholder")}
                          className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      </div>
                    )}
                    
                    <div className="px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
                      {filteredModels.map((model) => (
                        <div key={model.id} className="flex items-center justify-between py-2 border-b border-ink-100 last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink-900 truncate">{model.name}</p>
                            {model.description && (
                              <p className="text-xs text-ink-500 truncate">{model.description}</p>
                            )}
                          </div>
                          <button
                            onClick={() => onToggleModel(model.id)}
                            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                              model.enabled ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                            }`}
                          >
                            {model.enabled ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ))}
                      
                      {filteredModels.length === 0 && (
                        <div className="text-center py-4">
                          <p className="text-sm text-ink-500">
                            {searchQuery || showOnlyEnabled
                              ? t("settings.llmProviders.noMatchingModels")
                              : t("settings.llmProviders.noModelsAvailable")}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {providerModels.length === 0 && (
                  <div className="px-4 py-6 text-center min-h-[100px] flex flex-col items-center justify-center">
                    <p className="text-sm text-ink-500 mb-2">
                      {t("settings.llmProviders.noLoadedModels")}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFetchModels(provider.id);
                      }}
                      disabled={loading}
                      className="text-sm text-accent hover:underline disabled:opacity-50"
                    >
                      {loading ? t("settings.llmProviders.loading") : t("settings.llmProviders.loadModels")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddProviderButton({ onAdd, providers, models, setLlmProviders, setLlmModels }: { 
  onAdd: () => void; 
  providers: LLMProvider[]; 
  models: LLMModel[];
  setLlmProviders: (providers: LLMProvider[]) => void;
  setLlmModels: (models: LLMModel[]) => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<LLMProviderType>('openai');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [zaiApiPrefix, setZaiApiPrefix] = useState<'default' | 'coding'>('default');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [availableModels, setAvailableModels] = useState<LLMModel[]>([]);

  // Auto-fill base URL for Z.AI when prefix changes
  useEffect(() => {
    if (type === 'zai') {
      if (zaiApiPrefix === 'default') {
        setBaseUrl('https://api.z.ai/api/paas/v4');
      } else if (zaiApiPrefix === 'coding') {
        setBaseUrl('https://api.z.ai/api/coding/paas/v4');
      }
    }
  }, [type, zaiApiPrefix]);

  // Auto-select default prefix when Z.AI is chosen
  useEffect(() => {
    if (type === 'zai' && zaiApiPrefix !== 'default') {
      setZaiApiPrefix('default');
    }
  }, [type]);

  const handleTestConnection = async () => {
    setError('');
    setTestSuccess(false);
    setTesting(true);
    setAvailableModels([]);

    if (!apiKey.trim()) {
      setError(t("settings.llmProviders.errors.apiKeyRequired"));
      setTesting(false);
      return;
    }
    if (type === 'openai' && !baseUrl.trim()) {
      setError(t("settings.llmProviders.errors.baseUrlRequired"));
      setTesting(false);
      return;
    }

    // Create temporary provider for testing
    const tempProvider: LLMProvider = {
      id: `temp-${Date.now()}`,
      type,
      name: name.trim() || t("settings.llmProviders.testProvider"),
      apiKey: apiKey.trim(),
      baseUrl: type === 'openrouter' ? undefined : baseUrl.trim(),
      zaiApiPrefix: type === 'zai' ? zaiApiPrefix : undefined,
      enabled: true,
    };

    // Send test request
    getPlatform().sendClientEvent({
      type: "llm.models.test",
      payload: { provider: tempProvider }
    });

    // Listen for response
    const removeListener = getPlatform().onServerEvent((event) => {
      if (event.type === "llm.models.fetched" && event.payload.providerId === tempProvider.id) {
        setTesting(false);
        setTestSuccess(true);
        setAvailableModels(event.payload.models);
        setError('');
        removeListener();
      } else if (event.type === "llm.models.error" && event.payload.providerId === tempProvider.id) {
        setTesting(false);
        setTestSuccess(false);
        setError(t("settings.llmProviders.errors.connectionFailed", { message: event.payload.message }));
        removeListener();
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (testing) {
        setTesting(false);
        setError(t("settings.llmProviders.errors.connectionTimeout"));
        removeListener();
      }
    }, 30000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t("settings.llmProviders.errors.nameRequired"));
      return;
    }
    if (!apiKey.trim()) {
      setError(t("settings.llmProviders.errors.apiKeyRequired"));
      return;
    }
    if (type === 'openai' && !baseUrl.trim()) {
      setError(t("settings.llmProviders.errors.baseUrlRequired"));
      return;
    }

    // Create provider
    const newProvider: LLMProvider = {
      id: `${type}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      type,
      name: name.trim(),
      apiKey: apiKey.trim(),
      baseUrl: type === 'openrouter' ? undefined : baseUrl.trim(),
      zaiApiPrefix: type === 'zai' ? zaiApiPrefix : undefined,
      enabled: true,
    };

    console.log('[AddProvider] Creating new provider:', newProvider);
    console.log('[AddProvider] Available models count:', availableModels.length);

    // Prepare models with correct provider ID
    const newModels = availableModels.length > 0 
      ? availableModels.map(m => ({ 
          ...m, 
          providerId: newProvider.id, 
          id: `${newProvider.id}::${m.id.split('::')[1] || m.id}` 
        })) 
      : [];

    console.log('[AddProvider] Prepared models count:', newModels.length);
    console.log('[AddProvider] Current providers:', providers);
    console.log('[AddProvider] Current models:', models);

    // Save to settings
    const updatedSettings = {
      providers: [...providers, newProvider],
      models: [...models, ...newModels]
    };

    console.log('[AddProvider] Updated settings to send:', updatedSettings);

    // Immediately update local state
    setLlmProviders([...providers, newProvider]);
    setLlmModels([...models, ...newModels]);

    console.log('[AddProvider] Local state updated');
    console.log('[AddProvider] Sending llm.providers.save event...');

    getPlatform().sendClientEvent({
      type: "llm.providers.save",
      payload: { settings: updatedSettings }
    });

    onAdd();
    setIsOpen(false);
    setName('');
    setApiKey('');
    setBaseUrl('');
    setZaiApiPrefix('default');
    setError('');
    setTestSuccess(false);
    setAvailableModels([]);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors"
      >
        {t("settings.llmProviders.addProviderButton")}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-ink-900 mb-4">{t("settings.llmProviders.addProviderTitle")}</h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">
                  {t("settings.llmProviders.providerType")}
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as LLMProviderType)}
                  className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  <option value="openai">{t("settings.llmProviders.providerOpenAI")}</option>
                  <option value="openrouter">{t("settings.llmProviders.providerOpenRouter")}</option>
                  <option value="zai">{t("settings.llmProviders.providerZai")}</option>
                </select>
              </div>

              {type === 'openai' && (
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-2">
                    {t("settings.llmProviders.baseUrl")}
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={t("settings.llmProviders.baseUrlPlaceholder")}
                    className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              )}

              {type === 'zai' && (
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-2">
                    {t("settings.llmProviders.endpoint")}
                  </label>
                  <select
                    value={zaiApiPrefix}
                    onChange={(e) => setZaiApiPrefix(e.target.value as 'default' | 'coding')}
                    className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
                  >
                    <option value="default">{t("settings.llmProviders.endpointDefault")}</option>
                    <option value="coding">{t("settings.llmProviders.endpointCoding")}</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">
                  {t("settings.llmProviders.apiKey")}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("settings.llmProviders.apiKeyPlaceholder")}
                  className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              
              {/* Test Connection Button */}
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !apiKey.trim() || (type === 'openai' && !baseUrl.trim())}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {testing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t("settings.llmProviders.testing")}
                  </>
                ) : testSuccess ? (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {t("settings.llmProviders.connectionSuccess")}
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {t("settings.llmProviders.testConnection")}
                  </>
                )}
              </button>

              {/* Available Models Dropdown - shown after successful test */}
              {testSuccess && availableModels.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-green-700 mb-2">
                    {t("settings.llmProviders.foundModels", { count: availableModels.length })}
                  </label>
                  <div className="max-h-40 overflow-y-auto p-3 bg-green-50 border border-green-200 rounded-lg space-y-1">
                    {availableModels.map((model) => (
                      <div key={model.id} className="text-xs text-green-700 py-0.5">
                        • {model.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Name field - only shown after successful test */}
              {testSuccess && (
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-2">
                    {t("settings.llmProviders.providerName")}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("settings.llmProviders.providerNamePlaceholder")}
                    className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              )}
              
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              {testSuccess && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setName('');
                      setApiKey('');
                      setBaseUrl('');
                      setZaiApiPrefix('default');
                      setError('');
                      setTestSuccess(false);
                      setAvailableModels([]);
                    }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-600 bg-ink-50 rounded-lg hover:bg-ink-100 transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={!name.trim()}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("common.add")}
                  </button>
                </div>
              )}

              {!testSuccess && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setName('');
                    setApiKey('');
                    setBaseUrl('');
                    setZaiApiPrefix('default');
                    setError('');
                    setTestSuccess(false);
                    setAvailableModels([]);
                  }}
                  className="w-full px-4 py-2.5 text-sm font-medium text-ink-600 bg-ink-50 rounded-lg hover:bg-ink-100 transition-colors"
                >
                  {t("common.cancel")}
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function WebToolsTab({
  tavilyApiKey,
  setTavilyApiKey,
  enableTavilySearch,
  setEnableTavilySearch,
  zaiApiKey,
  setZaiApiKey,
  webSearchProvider,
  setWebSearchProvider,
  zaiApiUrl,
  setZaiApiUrl,
  enableZaiReader,
  setEnableZaiReader,
  zaiReaderApiUrl,
  setZaiReaderApiUrl,
  showTavilyPassword,
  setShowTavilyPassword,
  showZaiPassword,
  setShowZaiPassword
}: any) {
  const { t } = useTranslation();
  return (
    <div className="px-6 py-4 space-y-6">
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-2">
          {t("settings.webTools.providerLabel")}
          <span className="ml-2 text-xs font-normal text-ink-500">{t("settings.webTools.providerHint")}</span>
        </label>
        <select
          value={webSearchProvider}
          onChange={(e) => setWebSearchProvider(e.target.value as WebSearchProvider)}
          className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
        >
          <option value="tavily">{t("settings.webTools.providerTavily")}</option>
          <option value="zai">{t("settings.webTools.providerZai")}</option>
        </select>
      </div>

      {webSearchProvider === 'tavily' && (
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">
            {t("settings.webTools.tavilyApiKey")}
          </label>
          <div className="relative">
            <input
              type={showTavilyPassword ? "text" : "password"}
              value={tavilyApiKey}
              onChange={(e) => setTavilyApiKey(e.target.value)}
              placeholder={t("settings.webTools.tavilyPlaceholder")}
              className="w-full px-4 py-2.5 pr-10 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowTavilyPassword(!showTavilyPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-700"
            >
              {showTavilyPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            <Trans
              i18nKey="settings.webTools.tavilyApiKeyHint"
              components={{
                link: <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" className="text-ink-700 hover:underline" />
              }}
            />
          </p>
          
          <div className="mt-4 flex items-center justify-between">
            <div>
              <span className={`text-sm font-medium ${tavilyApiKey ? 'text-ink-700' : 'text-ink-400'}`}>{t("settings.webTools.enableWebSearch")}</span>
              <p className="text-xs text-ink-500">{t("settings.webTools.tavilyDescription")}</p>
            </div>
            <button
              type="button"
              onClick={() => tavilyApiKey && setEnableTavilySearch(!enableTavilySearch)}
              disabled={!tavilyApiKey}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                !tavilyApiKey ? "bg-ink-200 cursor-not-allowed" : enableTavilySearch ? "bg-accent" : "bg-ink-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enableTavilySearch && tavilyApiKey ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {webSearchProvider === 'zai' && (
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">
            {t("settings.webTools.zaiApiKey")}
          </label>
          <div className="relative">
            <input
              type={showZaiPassword ? "text" : "password"}
              value={zaiApiKey}
              onChange={(e) => setZaiApiKey(e.target.value)}
              placeholder={t("settings.webTools.zaiPlaceholder")}
              className="w-full px-4 py-2.5 pr-10 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowZaiPassword(!showZaiPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-700"
            >
              {showZaiPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            <Trans
              i18nKey="settings.webTools.zaiApiKeyHint"
              components={{
                link: <a href="https://chat.z.ai/manage-apikey/apikey-list" target="_blank" rel="noopener noreferrer" className="text-ink-700 hover:underline" />
              }}
            />
          </p>
        </div>
      )}

      {webSearchProvider === 'zai' && (
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">
            {t("settings.webTools.zaiApiUrl")}
            <span className="ml-2 text-xs font-normal text-ink-500">{t("settings.webTools.endpointHint")}</span>
          </label>
          <select
            value={zaiApiUrl}
            onChange={(e) => setZaiApiUrl(e.target.value as ZaiApiUrl)}
            className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
          >
            <option value="default">{t("settings.webTools.zaiSearchDefault")}</option>
            <option value="coding">{t("settings.webTools.zaiSearchCoding")}</option>
          </select>
        </div>
      )}

      <div className="border-t border-ink-900/10 pt-4">
        <label className="block text-sm font-medium text-ink-700 mb-2">
          {t("settings.webTools.readerLabel")}
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex-1">
            <span className="block text-sm font-medium text-ink-700">{t("settings.webTools.enableReader")}</span>
            <p className="mt-1 text-xs text-ink-500">
              {t("settings.webTools.readerDescription")}
            </p>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={enableZaiReader}
              onChange={(e) => setEnableZaiReader(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </div>
        </label>
      </div>

      {enableZaiReader && (
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">
            {t("settings.webTools.readerApiUrl")}
            <span className="ml-2 text-xs font-normal text-ink-500">{t("settings.webTools.endpointHint")}</span>
          </label>
          <select
            value={zaiReaderApiUrl}
            onChange={(e) => setZaiReaderApiUrl(e.target.value as ZaiReaderApiUrl)}
            className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
          >
            <option value="default">{t("settings.webTools.zaiReaderDefault")}</option>
            <option value="coding">{t("settings.webTools.zaiReaderCoding")}</option>
          </select>
          {!zaiApiKey && (
            <p className="mt-1 text-xs text-amber-600">
              {t("settings.webTools.readerKeyWarning")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LanguageTab({ language, onLanguageChange }: { language: ApiSettings["language"]; onLanguageChange: (language: ApiSettings["language"]) => void; }) {
  const { t } = useTranslation();
  return (
    <div className="px-6 py-4 space-y-6">
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-2">
          {t("settings.language.label")}
          <span className="ml-2 text-xs font-normal text-ink-500">{t("settings.language.hint")}</span>
        </label>
        <select
          value={language || "auto"}
          onChange={(e) => onLanguageChange?.(e.target.value as ApiSettings["language"])}
          className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
        >
          <option value="auto">{t("settings.language.auto")}</option>
          <option value="en">{t("settings.language.english")}</option>
          <option value="zh-CN">{t("settings.language.chinese")}</option>
        </select>
      </div>
    </div>
  );
}

function ToolsTab({
  enableGitTools,
  setEnableGitTools,
  enableBrowserTools,
  setEnableBrowserTools,
  enableDuckDuckGo,
  setEnableDuckDuckGo,
  enableFetchTools,
  setEnableFetchTools,
  enableImageTools,
  setEnableImageTools,
  conversationDataDir,
  setConversationDataDir,
  enableSessionGitRepo,
  sessionGitChecking,
  sessionGitError,
  onToggleSessionGitRepo,
  enablePreview,
  setEnablePreview,
  previewMode,
  setPreviewMode
}: any) {
  const { t } = useTranslation();
  const [defaultDir, setDefaultDir] = useState<string>("");

  // Load default conversations directory on mount
  useEffect(() => {
    const loadDefaultDir = async () => {
      try {
        const invoke = (window as any).__TAURI_INVOKE__ as ((cmd: string) => Promise<string>) | undefined;
        if (!invoke) return;
        const dir = await invoke("get_default_conversations_dir");
        setDefaultDir(dir);
      } catch (err) {
        console.error("[SettingsModal] Failed to get default conversations dir:", err);
      }
    };
    loadDefaultDir();
  }, []);

  return (
    <div className="px-6 py-4 space-y-6">

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-3">
          {t("settings.conversationDir.label")}
          <span className="ml-2 text-xs font-normal text-ink-500">{t("settings.conversationDir.hint")}</span>
        </label>
        {defaultDir && (
          <div className="mb-2 text-xs text-ink-500">
            {t("settings.conversationDir.defaultHint", { dir: defaultDir })}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={conversationDataDir || ''}
            onChange={(e) => setConversationDataDir(e.target.value)}
            placeholder={defaultDir || t("settings.conversationDir.placeholder")}
            className="flex-1 px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                const dir = await getPlatform().selectDirectory();
                if (dir) setConversationDataDir(dir);
              } catch (error) {
                console.error('[SettingsModal] selectDirectory failed', { error });
              }
            }}
            className="px-4 py-2.5 text-sm font-medium text-ink-700 bg-ink-50 rounded-lg hover:bg-ink-100 transition-colors"
          >
            {t("common.browse")}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          <span className="font-mono">{t("settings.conversationDir.usage")}</span>
        </p>
      </div>

      <div className="border-t border-ink-900/10 pt-4">
        <label className="block text-sm font-medium text-ink-700 mb-3">
          {t("settings.sessionGit.label")}
          <span className="ml-2 text-xs font-normal text-ink-500">{t("settings.sessionGit.hint")}</span>
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex-1">
            <span className="block text-sm font-medium text-ink-700">{t("settings.sessionGit.toggleLabel")}</span>
            <p className="mt-0.5 text-xs text-ink-500">
              {sessionGitChecking
                ? t("settings.sessionGit.checking")
                : t("settings.sessionGit.requirement")}
            </p>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={!!enableSessionGitRepo}
              onChange={(e) => onToggleSessionGitRepo?.(e.target.checked)}
              disabled={sessionGitChecking}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50"></div>
          </div>
        </label>
        {sessionGitError && (
          <p className="mt-2 text-xs text-error">
            {sessionGitError}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-3">
          {t("settings.toolGroups.label")}
          <span className="ml-2 text-xs font-normal text-ink-500">{t("settings.toolGroups.hint")}</span>
        </label>
        
        {/* Git Tools */}
        <label className="flex items-center justify-between cursor-pointer mb-4">
          <div className="flex-1">
            <span className="block text-sm font-medium text-ink-700">{t("settings.toolGroups.gitTools")}</span>
            <p className="mt-0.5 text-xs text-ink-500">
              {t("settings.toolGroups.gitToolsHint")}
            </p>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={enableGitTools}
              onChange={(e) => setEnableGitTools(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </div>
        </label>

        {/* Browser Tools */}
        <label className="flex items-center justify-between cursor-pointer mb-4">
          <div className="flex-1">
            <span className="block text-sm font-medium text-ink-700">{t("settings.toolGroups.browserTools")}</span>
            <p className="mt-0.5 text-xs text-ink-500">
              {t("settings.toolGroups.browserToolsHint")}
            </p>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={enableBrowserTools}
              onChange={(e) => setEnableBrowserTools(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </div>
        </label>

        {/* DuckDuckGo Search */}
        <label className="flex items-center justify-between cursor-pointer mb-4">
          <div className="flex-1">
            <span className="block text-sm font-medium text-ink-700">{t("settings.toolGroups.duckduckgo")}</span>
            <p className="mt-0.5 text-xs text-ink-500">
              {t("settings.toolGroups.duckduckgoHint")}
            </p>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={enableDuckDuckGo}
              onChange={(e) => setEnableDuckDuckGo(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </div>
        </label>

        {/* Fetch Tools */}
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex-1">
            <span className="block text-sm font-medium text-ink-700">{t("settings.toolGroups.fetchTools")}</span>
            <p className="mt-0.5 text-xs text-ink-500">
              {t("settings.toolGroups.fetchToolsHint")}
            </p>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={enableFetchTools}
              onChange={(e) => setEnableFetchTools(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </div>
        </label>

        {/* Image Tools */}
        <label className="flex items-center justify-between cursor-pointer mt-4">
          <div className="flex-1">
            <span className="block text-sm font-medium text-ink-700">{t("settings.toolGroups.imageTools")}</span>
            <p className="mt-0.5 text-xs text-ink-500">
              {t("settings.toolGroups.imageToolsHint")}
            </p>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={enableImageTools}
              onChange={(e) => setEnableImageTools(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </div>
        </label>

        {/* Preview System */}
        <div className="border-t border-ink-900/10 pt-4 mt-4">
          <label className="block text-sm font-medium text-ink-700 mb-3">
            Change Preview
            <span className="ml-2 text-xs font-normal text-ink-500">Review file changes before they are applied</span>
          </label>
          <label className="flex items-center justify-between cursor-pointer mb-4">
            <div className="flex-1">
              <span className="block text-sm font-medium text-ink-700">Enable Preview Mode</span>
              <p className="mt-0.5 text-xs text-ink-500">
                {enablePreview 
                  ? "File changes will be shown for approval before execution"
                  : "File changes are applied immediately"}
              </p>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={enablePreview}
                onChange={(e) => setEnablePreview(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </div>
          </label>
          
          {enablePreview && (
            <div className="ml-4">
              <label className="block text-sm font-medium text-ink-700 mb-2">Preview Mode</label>
              <select
                value={previewMode}
                onChange={(e) => setPreviewMode(e.target.value as 'always' | 'ask' | 'never')}
                className="w-full px-3 py-2 border border-ink-900/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="always">Always preview file changes</option>
                <option value="ask">Ask for each tool (not yet implemented)</option>
                <option value="never">Never preview (use permission mode instead)</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MemoryModeTab({
  enableMemory,
  setEnableMemory,
  memoryContent,
  setMemoryContent,
  memoryLoading,
  loadMemoryContent,
  memoryError,
  permissionMode,
  setPermissionMode
}: any) {
  const { t } = useTranslation();
  return (
    <div className="px-6 py-4 space-y-6">
      <div>
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex-1">
            <span className="block text-sm font-medium text-ink-700">{t("settings.memory.enable")}</span>
            <p className="mt-1 text-xs text-ink-500">
              {t("settings.memory.description")}
            </p>
          </div>
          <div className="relative">
            <input
              type="checkbox"
              checked={enableMemory}
              onChange={(e) => {
                setEnableMemory(e.target.checked);
                if (e.target.checked && !memoryLoading) {
                  loadMemoryContent();
                }
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </div>
        </label>
        {enableMemory && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-ink-700">
                {t("settings.memory.contentLabel")}
              </label>
              <button
                onClick={loadMemoryContent}
                disabled={memoryLoading}
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                {memoryLoading ? t("settings.memory.loading") : t("settings.memory.reload")}
              </button>
            </div>
            {memoryError && (
              <p className="mb-2 text-xs text-error">
                {t("settings.memory.error", { error: memoryError })}
              </p>
            )}
            <textarea
              value={memoryContent}
              onChange={(e) => setMemoryContent(e.target.value)}
              placeholder={t("settings.memory.placeholder")}
              className="w-full h-32 px-3 py-2 text-xs border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all resize-none font-mono"
            />
            <p className="mt-1 text-xs text-ink-500">
              {t("settings.memory.fileLabel")} <code className="bg-ink-50 px-1 py-0.5 rounded">~/.valera/memory.md</code>
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-ink-900/10 pt-6">
        <label className="block text-sm font-medium text-ink-700 mb-2">
          {t("settings.permissionMode.label")}
        </label>
        <select
          value={permissionMode}
          onChange={(e) => setPermissionMode(e.target.value as 'default' | 'ask')}
          className="w-full px-4 py-2.5 text-sm border border-ink-900/20 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ink-900/20 transition-all"
        >
          <option value="default">{t("settings.permissionMode.auto")}</option>
          <option value="ask">{t("settings.permissionMode.ask")}</option>
        </select>
        <p className="mt-1 text-xs text-ink-500">
          {t("settings.permissionMode.hint")}
        </p>
      </div>
    </div>
  );
}
