/**
 * CharterPanel - Displays session charter (goal, constraints, definition of done)
 * Similar to TodoPanel but for charter data
 */

import { useState } from "react";
import type { CharterData, CharterItem } from "../types";

interface CharterPanelProps {
  charter?: CharterData;
  charterHash?: string;
}

export function CharterPanel({
  charter,
  charterHash
}: CharterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false); // Default collapsed to save space
  const [showHelp, setShowHelp] = useState(false);

  if (!charter) {
    return (
      <div className="rounded-lg border border-ink-200 bg-surface-secondary p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-ink-400">
            <span className="text-lg">📋</span>
            <span className="text-sm">No charter defined for this session</span>
          </div>
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="text-xs text-ink-400 hover:text-ink-600 transition-colors"
          >
            如何使用?
          </button>
        </div>
        {showHelp && (
          <div className="mt-3 p-3 bg-ink-50 rounded text-xs text-ink-600 space-y-2">
            <p className="font-medium text-ink-700">💡 Charter (会话宪章) 使用指南:</p>
            <div className="space-y-1.5">
              <p><span className="font-medium">创建 Charter:</span></p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>新建会话时选择合适的 Charter 模板</li>
                <li>或者说: "请创建一个 Charter，目标是..."</li>
              </ul>
              
              <p><span className="font-medium">Charter 包含:</span></p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li><strong>🎯 Goal:</strong> 会话的核心目标</li>
                <li><strong>🚫 Non-Goals:</strong> 明确不做的事情</li>
                <li><strong>✅ Definition of Done:</strong> 完成标准</li>
                <li><strong>⚠️ Constraints:</strong> 软约束（可通过 ADR 修改）</li>
                <li><strong>🔒 Invariants:</strong> 硬约束（绝不可违反）</li>
                <li><strong>📖 Glossary:</strong> 术语表</li>
              </ul>

              <p><span className="font-medium">更新 Charter:</span></p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>说: "请更新 Charter，添加约束：..."</li>
                <li>每次更新会自动创建 ADR 记录变更原因</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }

  const renderCharterItem = (item: CharterItem, prefix: string) => (
    <div key={item.id} className="flex items-start gap-2 py-1">
      <span className="text-ink-400 text-xs font-mono">{prefix}</span>
      <span className="text-sm text-ink-700">{item.content}</span>
    </div>
  );

  const renderSection = (
    title: string,
    icon: string,
    items: CharterItem[] | undefined
  ) => {
    if (!items || items.length === 0) {
      return null;
    }

    return (
      <div className="mt-3">
        <div className="flex items-center gap-2 mb-1">
          <span>{icon}</span>
          <span className="text-xs font-medium text-ink-600 uppercase tracking-wide">{title}</span>
        </div>
        <div className="pl-6">
          {items.map((item, idx) => renderCharterItem(item, `${idx + 1}.`))}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-ink-200 bg-surface-secondary">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-surface-tertiary transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <span className="text-sm font-medium text-ink-800">Session Charter</span>
          {charterHash && (
            <span className="text-xs text-ink-400 font-mono">#{charterHash.slice(0, 8)}</span>
          )}
          {charter.version && (
            <span className="text-xs bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">
              v{charter.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowHelp(!showHelp);
            }}
            className="text-xs text-ink-400 hover:text-ink-600 px-2 py-1 rounded hover:bg-ink-100 transition-colors"
          >
            ?
          </button>
          <span className={`text-ink-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </button>

      {/* Help Section */}
      {showHelp && (
        <div className="px-3 pb-3 border-t border-ink-100">
          <div className="mt-3 p-3 bg-ink-50 rounded text-xs text-ink-600 space-y-2">
            <p className="font-medium text-ink-700">💡 如何使用 Charter:</p>
            <div className="space-y-1">
              <p><strong>更新 Charter:</strong> 说 "请更新 Charter，添加约束：..."</p>
              <p><strong>自动 ADR:</strong> 每次更新会自动创建决策记录</p>
              <p><strong>约束类型:</strong></p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li><strong>⚠️ Constraints:</strong> 软约束（可通过 ADR 修改）</li>
                <li><strong>🔒 Invariants:</strong> 硬约束（绝不违反）</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-ink-100 max-h-96 overflow-y-auto">
          {/* Goal */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1">
              <span>🎯</span>
              <span className="text-xs font-medium text-ink-600 uppercase tracking-wide">Goal</span>
            </div>
            <div className="pl-6 text-sm text-ink-800 font-medium">
              {charter.goal.content}
            </div>
          </div>

          {/* Non-Goals */}
          {charter.nonGoals && charter.nonGoals.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <span>🚫</span>
                <span className="text-xs font-medium text-ink-600 uppercase tracking-wide">Non-Goals</span>
              </div>
              <div className="pl-6">
                {charter.nonGoals.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 py-0.5">
                    <span className="text-ink-400">•</span>
                    <span className="text-sm text-ink-600">{item.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Definition of Done */}
          {renderSection('Definition of Done', '✅', charter.definitionOfDone)}

          {/* Constraints (soft) */}
          {charter.constraints && charter.constraints.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <span>⚠️</span>
                <span className="text-xs font-medium text-ink-600 uppercase tracking-wide">Constraints</span>
                <span className="text-xs text-ink-400">(can be overridden with ADR)</span>
              </div>
              <div className="pl-6">
                {charter.constraints.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 py-0.5">
                    <span className="text-yellow-500">⚡</span>
                    <span className="text-sm text-ink-600">{item.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invariants (hard) */}
          {charter.invariants && charter.invariants.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <span>🔒</span>
                <span className="text-xs font-medium text-ink-600 uppercase tracking-wide">Invariants</span>
                <span className="text-xs text-red-500">(NEVER violate)</span>
              </div>
              <div className="pl-6">
                {charter.invariants.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 py-0.5">
                    <span className="text-red-500">🛑</span>
                    <span className="text-sm text-ink-700 font-medium">{item.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Glossary */}
          {charter.glossary && Object.keys(charter.glossary).length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <span>📖</span>
                <span className="text-xs font-medium text-ink-600 uppercase tracking-wide">Glossary</span>
              </div>
              <div className="pl-6">
                {Object.entries(charter.glossary).map(([term, definition]) => (
                  <div key={term} className="flex items-start gap-2 py-0.5">
                    <span className="text-sm font-medium text-ink-700">{term}:</span>
                    <span className="text-sm text-ink-600">{definition}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="mt-4 pt-3 border-t border-ink-100 flex gap-4 text-xs text-ink-400">
            {charter.createdAt && (
              <span>Created: {new Date(charter.createdAt).toLocaleDateString()}</span>
            )}
            {charter.updatedAt && charter.updatedAt !== charter.createdAt && (
              <span>Updated: {new Date(charter.updatedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
