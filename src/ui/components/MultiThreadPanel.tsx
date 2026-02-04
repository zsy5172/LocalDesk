import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { MultiThreadTask, SessionInfo } from "../types";

interface MultiThreadPanelProps {
  multiThreadTasks: Record<string, MultiThreadTask>;
  sessions: Record<string, SessionInfo>;
  onSelectSession: (sessionId: string) => void;
  onDeleteTask: (taskId: string) => void;
  sendEvent: (event: any) => void;
}

export function MultiThreadPanel({
  multiThreadTasks,
  sessions,
  onSelectSession,
  onDeleteTask,
  sendEvent
}: MultiThreadPanelProps) {
  const { t } = useTranslation();
  // Extract model name from full ID (provider::model -> model)
  const getModelDisplayName = (modelId: string | undefined): string => {
    if (!modelId) return t("common.unknown");
    // If it contains ::, take the part after it
    if (modelId.includes('::')) {
      return modelId.split('::')[1] || modelId;
    }
    return modelId;
  };
  const sortedTasks = useMemo(() => {
    return Object.values(multiThreadTasks).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [multiThreadTasks]);

  if (sortedTasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-2">
      <div className="flex gap-4 overflow-x-auto pb-2">
        {sortedTasks.map((task) => {
          const threads = task.threadIds.map(id => sessions[id]).filter(Boolean);
          const runningCount = threads.filter(t => t?.status === "running").length;
          const completedCount = threads.filter(t => t?.status === "completed").length;
          const errorCount = threads.filter(t => t?.status === "error").length;
          const totalCount = threads.length;

          // Calculate total tokens for this task (threads + summary)
          const threadInputTokens = threads.reduce((sum, t) => sum + (t?.inputTokens || 0), 0);
          const threadOutputTokens = threads.reduce((sum, t) => sum + (t?.outputTokens || 0), 0);
          const summaryInputTokens = task.summaryThreadId
            ? (sessions[task.summaryThreadId]?.inputTokens || 0)
            : 0;
          const summaryOutputTokens = task.summaryThreadId
            ? (sessions[task.summaryThreadId]?.outputTokens || 0)
            : 0;
          const totalInputTokens = threadInputTokens + summaryInputTokens;
          const totalOutputTokens = threadOutputTokens + summaryOutputTokens;
          const totalTokens = totalInputTokens + totalOutputTokens;

          const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
          const isCreated = task.status === 'created';
          const isRunning = task.status === 'running' || runningCount > 0;
          const isCompleted = task.status === 'completed';

          return (
            <div
              key={task.id}
              className={`flex-shrink-0 w-80 rounded-xl border p-3 transition-all ${
                isCompleted
                  ? 'border-success/30 bg-success/5'
                  : isRunning
                    ? 'border-info/30 bg-info/5'
                    : isCreated
                      ? 'border-warning/30 bg-warning/5'
                      : 'border-ink-900/10 bg-surface'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isCreated && (
                    <span className="w-2 h-2 rounded-full bg-warning" title={t("multiThread.readyToStart")} />
                  )}
                  {isRunning && (
                    <span className="w-2 h-2 rounded-full bg-info animate-pulse" />
                  )}
                  {isCompleted && (
                    <span className="w-2 h-2 rounded-full bg-success" />
                  )}
                  <span className="text-xs font-semibold text-ink-700 truncate">
                    {task.title}
                  </span>
                </div>
                <button
                  onClick={() => onDeleteTask(task.id)}
                  className="text-muted hover:text-error transition-colors flex-shrink-0"
                  title={t("multiThread.removeTask")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Mode badge */}
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-accent/10 text-accent">
                  {task.mode === 'consensus' ? t("taskItem.modeConsensus") : t("taskItem.modeDifferent")}
                </span>
                {task.shareWebCache && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-ink-100 text-ink-600">
                    {t("sidebar.sharedCache")}
                  </span>
                )}
                {task.autoSummary && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-purple-100 text-purple-600">
                    {t("sidebar.autoSummary")}
                  </span>
                )}
              </div>

              {/* Progress bar - hide when created */}
              {!isCreated && (
                <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isCompleted
                        ? 'bg-success'
                        : isRunning
                          ? 'bg-info'
                          : 'bg-ink-300'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {/* Status */}
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted">
                  {isCreated
                    ? t("sidebar.threadsReady", { count: totalCount })
                    : t("sidebar.threadsDone", { completed: completedCount, total: totalCount })
                  }
                </span>
                {totalTokens > 0 && (
                  <span className="text-[10px] text-muted bg-ink-100 px-1.5 py-0.5 rounded-full">
                    {t("sidebar.tokensLabel", { value: totalTokens.toLocaleString() })}
                  </span>
                )}
                {isCreated && (
                  <button
                    onClick={() => sendEvent({ type: 'task.start', payload: { taskId: task.id } })}
                    className="text-xs font-medium px-2 py-1 bg-warning text-white rounded hover:bg-warning/80 transition-colors"
                  >
                    {t("multiThread.startAllThreads")}
                  </button>
                )}
                {isRunning && (
                  <span className="text-info font-medium">
                    {t("sidebar.runningCount", { count: runningCount })}
                  </span>
                )}
                {isCompleted && (
                  <span className="text-success font-medium">
                    {t("multiThread.complete")}
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-error font-medium">
                    {t("sidebar.errors", { count: errorCount })}
                  </span>
                )}
              </div>

              {/* Thread block - visually grouped together */}
              <div className="border border-ink-200 rounded-lg bg-surface/50 p-2">
                <div className="text-[10px] font-medium text-ink-500 mb-1 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {t("multiThread.threadsWorking")}
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {threads.map((thread) => {
                    const isSummaryThread = thread.id === task.summaryThreadId;
                    return (
                      <button
                        key={thread.id}
                        onClick={() => onSelectSession(thread.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-ink-50 transition-colors text-left ${
                          isSummaryThread ? 'bg-purple-50 border border-purple-200' : ''
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            thread.status === 'running'
                              ? 'bg-info animate-pulse'
                              : thread.status === 'completed'
                                ? 'bg-success'
                                : thread.status === 'error'
                                  ? 'bg-error'
                                  : 'bg-ink-300'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className={`text-xs truncate ${isSummaryThread ? 'text-purple-700 font-medium' : 'text-ink-600'}`}>
                              {isSummaryThread ? t("sidebar.summary") : getModelDisplayName(thread.model)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
