import { useState, useMemo, Fragment } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { diffLines as computeDiffLines } from "diff";
import type { 
  ChangePreview, 
  PreviewBatch, 
  ApprovalAction,
  PreviewApproval 
} from "../types";

interface PreviewPanelProps {
  batch: PreviewBatch | null;
  open: boolean;
  onClose: () => void;
  onApprove: (approval: PreviewApproval) => void;
  onApproveAll: (batchId: string) => void;
  onRejectAll: (batchId: string, reason?: string) => void;
}

interface DiffLineItem {
  type: "added" | "removed" | "unchanged";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface SyncedDiffLine {
  oldLine?: DiffLineItem;
  newLine?: DiffLineItem;
}

function computeSyncedDiffLines(oldContent: string, newContent: string): SyncedDiffLine[] {
  if (!oldContent && !newContent) return [];
  
  const changes = computeDiffLines(oldContent || "", newContent || "");
  const result: SyncedDiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;
  let i = 0;
  
  while (i < changes.length) {
    const change = changes[i];
    const lines = change.value.split("\n");
    if (change.value.endsWith("\n") && lines[lines.length - 1] === "") {
      lines.pop();
    }
    
    if (change.removed) {
      const nextChange = i + 1 < changes.length ? changes[i + 1] : null;
      const removedLines = lines;
      const addedLines = nextChange?.added ? nextChange.value.split("\n") : [];
      
      if (nextChange?.added && nextChange.value.endsWith("\n") && addedLines[addedLines.length - 1] === "") {
        addedLines.pop();
      }
      
      const maxLines = Math.max(removedLines.length, addedLines.length);
      for (let j = 0; j < maxLines; j++) {
        result.push({
          oldLine: j < removedLines.length ? {
            type: "removed",
            content: removedLines[j],
            oldLineNumber: oldLineNum++,
          } : undefined,
          newLine: j < addedLines.length ? {
            type: "added",
            content: addedLines[j],
            newLineNumber: newLineNum++,
          } : undefined,
        });
      }
      
      if (nextChange?.added) {
        i += 2;
      } else {
        i++;
      }
    } else if (change.added) {
      for (let j = 0; j < lines.length; j++) {
        result.push({
          newLine: {
            type: "added",
            content: lines[j],
            newLineNumber: newLineNum++,
          },
        });
      }
      i++;
    } else {
      for (let j = 0; j < lines.length; j++) {
        result.push({
          oldLine: {
            type: "unchanged",
            content: lines[j],
            oldLineNumber: oldLineNum++,
          },
          newLine: {
            type: "unchanged",
            content: lines[j],
            newLineNumber: newLineNum++,
          },
        });
      }
      i++;
    }
  }
  
  return result;
}

function PreviewTypeIcon({ type }: { type: ChangePreview["type"] }) {
  switch (type) {
    case "file_create":
      return (
        <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      );
    case "file_edit":
      return (
        <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    case "file_delete":
      return (
        <svg className="w-4 h-4 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      );
    case "command_exec":
      return (
        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
  }
}

function PreviewTypeLabel({ type }: { type: ChangePreview["type"] }) {
  switch (type) {
    case "file_create": return "Create File";
    case "file_edit": return "Edit File";
    case "file_delete": return "Delete File";
    case "command_exec": return "Execute Command";
  }
}

function PreviewItem({ 
  preview, 
  isSelected,
  onSelect,
  onApprove 
}: { 
  preview: ChangePreview;
  isSelected: boolean;
  onSelect: () => void;
  onApprove: (action: ApprovalAction) => void;
}) {
  const statusColors = {
    pending: "bg-warning/10 text-warning border-warning/30",
    approved: "bg-success/10 text-success border-success/30",
    rejected: "bg-error/10 text-error border-error/30",
    modified: "bg-primary/10 text-primary border-primary/30",
  };

  return (
    <div 
      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
        isSelected ? "border-primary bg-primary/5" : "border-ink-900/10 hover:border-ink-900/20"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <PreviewTypeIcon type={preview.type} />
          <span className="text-sm font-medium text-ink-800">
            <PreviewTypeLabel type={preview.type} />
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[preview.status]}`}>
          {preview.status}
        </span>
      </div>
      
      <div className="text-sm text-ink-600 font-mono truncate mb-2">
        {preview.target}
      </div>
      
      {preview.description && (
        <div className="text-xs text-ink-500 mb-2">
          {preview.description}
        </div>
      )}
      
      {preview.status === "pending" && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e) => { e.stopPropagation(); onApprove("approve"); }}
            className="flex-1 px-2 py-1 text-xs bg-success/10 text-success hover:bg-success/20 rounded transition-colors"
          >
            Approve
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onApprove("approve_modified"); }}
            className="flex-1 px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onApprove("reject_skip"); }}
            className="flex-1 px-2 py-1 text-xs bg-error/10 text-error hover:bg-error/20 rounded transition-colors"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

function DiffViewer({ preview }: { preview: ChangePreview }) {
  const diffLines = useMemo(() => {
    if (preview.type === "command_exec") return [];
    return computeSyncedDiffLines(preview.before || "", preview.after || "");
  }, [preview.before, preview.after, preview.type]);

  if (preview.type === "command_exec") {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-ink-900/10 bg-surface-secondary">
          <div className="text-sm font-medium text-ink-700 mb-2">Command to Execute:</div>
          <pre className="bg-ink-900 text-ink-100 p-3 rounded-lg font-mono text-sm overflow-x-auto">
            {preview.command || preview.target}
          </pre>
        </div>
        {preview.description && (
          <div className="p-4">
            <div className="text-sm font-medium text-ink-700 mb-2">Description:</div>
            <div className="text-sm text-ink-600">{preview.description}</div>
          </div>
        )}
      </div>
    );
  }

  if (preview.type === "file_create") {
    return (
      <div className="h-full overflow-auto">
        <div className="sticky top-0 bg-surface-tertiary px-4 py-2 border-b border-ink-900/10 text-sm font-medium text-success">
          New File Content
        </div>
        <pre className="p-4 font-mono text-sm text-ink-700 whitespace-pre-wrap">
          {preview.after || "(empty file)"}
        </pre>
      </div>
    );
  }

  if (preview.type === "file_delete") {
    return (
      <div className="h-full overflow-auto">
        <div className="sticky top-0 bg-surface-tertiary px-4 py-2 border-b border-ink-900/10 text-sm font-medium text-error">
          File to Delete
        </div>
        <pre className="p-4 font-mono text-sm text-ink-500 whitespace-pre-wrap line-through">
          {preview.before || "(no content)"}
        </pre>
      </div>
    );
  }

  // file_edit - show diff
  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-2">
        <div className="sticky top-0 bg-surface-tertiary px-4 py-2 border-b border-r border-ink-900/10 text-sm font-medium text-ink-700 z-10">
          Before
        </div>
        <div className="sticky top-0 bg-surface-tertiary px-4 py-2 border-b border-ink-900/10 text-sm font-medium text-ink-700 z-10">
          After
        </div>

        {diffLines.map((syncedLine, idx) => {
          const oldLine = syncedLine.oldLine;
          const newLine = syncedLine.newLine;
          
          return (
            <Fragment key={`diff-${idx}`}>
              <div
                className={`px-4 py-0.5 flex items-start font-mono text-sm border-r border-ink-900/10 ${
                  oldLine?.type === "removed"
                    ? "bg-error/10 text-error"
                    : oldLine?.type === "unchanged"
                    ? "text-ink-700"
                    : "bg-surface-secondary"
                }`}
              >
                {oldLine ? (
                  <>
                    <span className="text-ink-400 mr-4 select-none w-8 text-right shrink-0">
                      {oldLine.oldLineNumber || " "}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap break-words">
                      {oldLine.content || " "}
                    </span>
                  </>
                ) : (
                  <span className="flex-1">&nbsp;</span>
                )}
              </div>

              <div
                className={`px-4 py-0.5 flex items-start font-mono text-sm ${
                  newLine?.type === "added"
                    ? "bg-success/10 text-success"
                    : newLine?.type === "unchanged"
                    ? "text-ink-700"
                    : "bg-surface-secondary"
                }`}
              >
                {newLine ? (
                  <>
                    <span className="text-ink-400 mr-4 select-none w-8 text-right shrink-0">
                      {newLine.newLineNumber || " "}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap break-words">
                      {newLine.content || " "}
                    </span>
                  </>
                ) : (
                  <span className="flex-1">&nbsp;</span>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function PreviewPanel({ 
  batch, 
  open, 
  onClose, 
  onApprove,
  onApproveAll,
  onRejectAll 
}: PreviewPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingContent, setEditingContent] = useState<string | null>(null);

  const selectedPreview = batch?.previews[selectedIndex] || null;
  const pendingCount = batch?.previews.filter(p => p.status === "pending").length || 0;
  const totalCount = batch?.previews.length || 0;

  const handleApproveItem = (action: ApprovalAction) => {
    if (!batch || !selectedPreview) return;
    
    if (action === "approve_modified") {
      // Enter edit mode
      setEditingContent(selectedPreview.after || selectedPreview.before || "");
      return;
    }
    
    onApprove({
      batchId: batch.id,
      previewId: selectedPreview.id,
      action,
    });
    
    // Move to next pending item
    const nextPending = batch.previews.findIndex((p, i) => i > selectedIndex && p.status === "pending");
    if (nextPending >= 0) {
      setSelectedIndex(nextPending);
    }
  };

  const handleSaveEdit = () => {
    if (!batch || !selectedPreview || editingContent === null) return;
    
    onApprove({
      batchId: batch.id,
      previewId: selectedPreview.id,
      action: "approve_modified",
      modifiedContent: editingContent,
    });
    
    setEditingContent(null);
    
    // Move to next pending item
    const nextPending = batch.previews.findIndex((p, i) => i > selectedIndex && p.status === "pending");
    if (nextPending >= 0) {
      setSelectedIndex(nextPending);
    }
  };

  const handleCancelEdit = () => {
    setEditingContent(null);
  };

  if (!batch) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] h-[85vh] bg-surface border border-ink-900/10 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-900/10">
            <div className="flex items-center gap-4">
              <Dialog.Title className="text-lg font-semibold text-ink-800">
                Preview Changes
              </Dialog.Title>
              <span className="text-sm text-ink-500">
                {pendingCount} of {totalCount} pending
              </span>
              <span className="text-xs px-2 py-1 bg-ink-900/5 rounded text-ink-600">
                Tool: {batch.toolName}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {pendingCount > 0 && (
                <>
                  <button
                    onClick={() => onApproveAll(batch.id)}
                    className="px-3 py-1.5 text-sm bg-success text-white hover:bg-success/90 rounded-lg transition-colors"
                  >
                    Approve All ({pendingCount})
                  </button>
                  <button
                    onClick={() => onRejectAll(batch.id)}
                    className="px-3 py-1.5 text-sm bg-error text-white hover:bg-error/90 rounded-lg transition-colors"
                  >
                    Reject All
                  </button>
                </>
              )}
              <Dialog.Close asChild>
                <button
                  className="text-ink-400 hover:text-ink-600 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left sidebar - Preview list */}
            <div className="w-80 border-r border-ink-900/10 overflow-y-auto p-4 space-y-3">
              {batch.previews.map((preview, index) => (
                <PreviewItem
                  key={preview.id}
                  preview={preview}
                  isSelected={index === selectedIndex}
                  onSelect={() => setSelectedIndex(index)}
                  onApprove={handleApproveItem}
                />
              ))}
            </div>

            {/* Right content - Diff viewer or editor */}
            <div className="flex-1 overflow-hidden">
              {editingContent !== null ? (
                // Edit mode
                <div className="h-full flex flex-col">
                  <div className="px-4 py-2 border-b border-ink-900/10 bg-surface-secondary flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-700">
                      Editing: {selectedPreview?.target}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1 text-sm text-ink-600 hover:text-ink-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="px-3 py-1 text-sm bg-primary text-white hover:bg-primary/90 rounded transition-colors"
                      >
                        Save & Approve
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none bg-surface"
                    spellCheck={false}
                  />
                </div>
              ) : selectedPreview ? (
                <DiffViewer preview={selectedPreview} />
              ) : (
                <div className="h-full flex items-center justify-center text-ink-500">
                  Select a preview to view details
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
