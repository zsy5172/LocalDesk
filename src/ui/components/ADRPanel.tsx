/**
 * ADRPanel - Displays Architecture Decision Records for a session
 * Shows list of ADRs with status, allows status changes
 * 
 * Usage Tips:
 * - ADRs are automatically created when Charter is updated
 * - To create an ADR manually, say: "请记录一个技术决策：使用 PostgreSQL 作为数据库"
 * - To update ADR status, say: "请接受 ADR adr-xxx 的决策"
 */

import { useState } from "react";
import type { ADRItem, ADRStatus, ADRType } from "../types";

interface ADRPanelProps {
  adrs?: ADRItem[];
  onStatusChange?: (adrId: string, newStatus: ADRStatus) => void;
}

const statusConfig: Record<ADRStatus, { color: string; icon: string; label: string }> = {
  proposed: { color: 'bg-yellow-100 text-yellow-700', icon: '📝', label: 'Proposed' },
  accepted: { color: 'bg-green-100 text-green-700', icon: '✅', label: 'Accepted' },
  rejected: { color: 'bg-red-100 text-red-700', icon: '❌', label: 'Rejected' },
  deprecated: { color: 'bg-gray-100 text-gray-600', icon: '📦', label: 'Deprecated' },
  superseded: { color: 'bg-blue-100 text-blue-600', icon: '🔄', label: 'Superseded' }
};

const typeConfig: Record<ADRType, { icon: string; label: string }> = {
  architectural: { icon: '🏗️', label: 'Architectural' },
  technical: { icon: '⚙️', label: 'Technical' },
  process: { icon: '📋', label: 'Process' },
  'charter-change': { icon: '📜', label: 'Charter Change' },
  'constraint-override': { icon: '⚠️', label: 'Constraint Override' },
  'user-override': { icon: '👤', label: 'User Override' }
};

export function ADRPanel({ adrs, onStatusChange }: ADRPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false); // Default collapsed to save space
  const [selectedADR, setSelectedADR] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  if (!adrs || adrs.length === 0) {
    return (
      <div className="rounded-lg border border-ink-200 bg-surface-secondary p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-ink-400">
            <span className="text-lg">📑</span>
            <span className="text-sm">No decisions recorded yet</span>
          </div>
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="text-xs text-ink-400 hover:text-ink-600"
          >
            How to use?
          </button>
        </div>
        {showHelp && (
          <div className="mt-2 p-2 bg-ink-50 rounded text-xs text-ink-600">
            <p className="font-medium mb-1">💡 ADR (Architecture Decision Records) 使用方法:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>更新 Charter 时会自动创建 ADR</li>
              <li>手动创建: "请记录一个技术决策：使用 Redis 做缓存"</li>
              <li>接受决策: "请接受 ADR adr-xxx"</li>
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Sort ADRs by date (newest first)
  const sortedADRs = [...adrs].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Count by status
  const statusCounts = adrs.reduce((acc, adr) => {
    acc[adr.status] = (acc[adr.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const renderADRItem = (adr: ADRItem) => {
    const status = statusConfig[adr.status];
    const type = typeConfig[adr.type];
    const isSelected = selectedADR === adr.id;

    return (
      <div 
        key={adr.id}
        className={`border rounded-lg transition-all ${
          isSelected 
            ? 'border-accent-300 bg-accent-50' 
            : 'border-ink-100 bg-white hover:border-ink-200'
        }`}
      >
        {/* ADR Header */}
        <button
          onClick={() => setSelectedADR(isSelected ? null : adr.id)}
          className="w-full flex items-start gap-3 p-3 text-left"
        >
          <span className="text-lg">{status.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-ink-800 truncate">
                {adr.title}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${status.color}`}>
                {status.label}
              </span>
              <span className="text-xs text-ink-400 bg-ink-100 px-1.5 py-0.5 rounded">
                {type.icon} {type.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-ink-400">
              <span className="font-mono">{adr.id}</span>
              <span>{new Date(adr.createdAt || 0).toLocaleDateString()}</span>
            </div>
          </div>
          <span className={`text-ink-400 transition-transform ${isSelected ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {/* ADR Details (expanded) */}
        {isSelected && (
          <div className="px-3 pb-3 border-t border-ink-100 mt-2 pt-3">
            {/* Context */}
            <div className="mb-3">
              <div className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
                Context
              </div>
              <div className="text-sm text-ink-700 whitespace-pre-wrap">
                {adr.context}
              </div>
            </div>

            {/* Decision */}
            <div className="mb-3">
              <div className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
                Decision
              </div>
              <div className="text-sm text-ink-800 font-medium whitespace-pre-wrap">
                {adr.decision}
              </div>
            </div>

            {/* Consequences */}
            {adr.consequences && (
              <div className="mb-3">
                <div className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
                  Consequences
                </div>
                <div className="text-sm text-ink-600 whitespace-pre-wrap">
                  {adr.consequences}
                </div>
              </div>
            )}

            {/* Alternatives */}
            {adr.alternatives && (
              <div className="mb-3">
                <div className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
                  Alternatives Considered
                </div>
                <div className="text-sm text-ink-600 whitespace-pre-wrap">
                  {adr.alternatives}
                </div>
              </div>
            )}

            {/* Charter References */}
            {adr.charterRefs && adr.charterRefs.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
                  Charter References
                </div>
                <div className="flex flex-wrap gap-1">
                  {adr.charterRefs.map((ref) => (
                    <span 
                      key={ref}
                      className="text-xs font-mono bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Charter Hash Changes */}
            {(adr.charterHashBefore || adr.charterHashAfter) && (
              <div className="mb-3 p-2 bg-ink-50 rounded">
                <div className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-1">
                  Charter Change
                </div>
                <div className="text-xs font-mono text-ink-600">
                  {adr.charterHashBefore && (
                    <div>Before: #{adr.charterHashBefore.slice(0, 8)}</div>
                  )}
                  {adr.charterHashAfter && (
                    <div>After: #{adr.charterHashAfter.slice(0, 8)}</div>
                  )}
                </div>
              </div>
            )}

            {/* Supersedes */}
            {adr.supersedes && (
              <div className="mb-3">
                <span className="text-xs text-ink-500">Supersedes: </span>
                <span className="text-xs font-mono text-ink-600">{adr.supersedes}</span>
              </div>
            )}

            {/* Status Actions */}
            {onStatusChange && adr.status === 'proposed' && (
              <div className="flex gap-2 mt-4 pt-3 border-t border-ink-100">
                <button
                  onClick={() => onStatusChange(adr.id, 'accepted')}
                  className="flex-1 px-3 py-1.5 text-sm font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                >
                  ✅ Accept
                </button>
                <button
                  onClick={() => onStatusChange(adr.id, 'rejected')}
                  className="flex-1 px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  ❌ Reject
                </button>
              </div>
            )}
          </div>
        )}
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
          <span className="text-lg">📑</span>
          <span className="text-sm font-medium text-ink-800">Decisions (ADRs)</span>
          <span className="text-xs bg-ink-200 text-ink-600 px-1.5 py-0.5 rounded">
            {adrs.length}
          </span>
          {/* Status summary badges */}
          <div className="flex gap-1 ml-2">
            {statusCounts.proposed > 0 && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                {statusCounts.proposed} pending
              </span>
            )}
            {statusCounts.accepted > 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                {statusCounts.accepted} accepted
              </span>
            )}
          </div>
        </div>
        <span className={`text-ink-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-ink-100 space-y-2 pt-3 max-h-96 overflow-y-auto">
          {sortedADRs.map(renderADRItem)}
        </div>
      )}
    </div>
  );
}
