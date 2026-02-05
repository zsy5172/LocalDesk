/**
 * Preview Manager - Manages preview batches and approval flow
 * 
 * This module handles:
 * 1. Creating preview batches before tool execution
 * 2. Waiting for user approval
 * 3. Processing approval responses
 * 4. Resuming tool execution with approved/modified content
 */

import { randomUUID } from "crypto";
import type { 
  ChangePreview, 
  PreviewBatch, 
  PreviewApproval, 
  BatchApproval,
  PreviewType,
  ApprovalAction
} from "../types.js";

// Pending batches waiting for approval
const pendingBatches = new Map<string, {
  batch: PreviewBatch;
  resolve: (result: PreviewBatchResult) => void;
}>();

// Result of a preview batch after user response
export interface PreviewBatchResult {
  batchId: string;
  approved: boolean;
  previews: Array<{
    id: string;
    action: ApprovalAction;
    content?: string;  // Final content to use (original or modified)
  }>;
}

/**
 * Create a change preview object
 */
export function createChangePreview(
  type: PreviewType,
  target: string,
  options: {
    before?: string;
    after?: string;
    command?: string;
    description?: string;
  }
): ChangePreview {
  return {
    id: randomUUID(),
    type,
    target,
    before: options.before,
    after: options.after,
    command: options.command,
    description: options.description,
    status: "pending",
    createdAt: Date.now(),
  };
}

/**
 * Create a preview batch from multiple changes
 */
export function createPreviewBatch(
  sessionId: string,
  toolCallId: string,
  toolName: string,
  previews: ChangePreview[]
): PreviewBatch {
  return {
    id: randomUUID(),
    sessionId,
    toolCallId,
    toolName,
    previews,
    status: "pending",
    createdAt: Date.now(),
  };
}

/**
 * Request preview approval from user
 * Returns a promise that resolves when user responds
 */
export function requestPreviewApproval(
  batch: PreviewBatch,
  sendEvent: (event: any) => void
): Promise<PreviewBatchResult> {
  return new Promise((resolve) => {
    // Store pending batch
    pendingBatches.set(batch.id, { batch, resolve });
    
    // Send preview request to UI
    sendEvent({
      type: "preview.request",
      payload: { batch }
    });
  });
}

/**
 * Handle single preview approval from user
 */
export function handlePreviewApproval(approval: PreviewApproval): void {
  const pending = pendingBatches.get(approval.batchId);
  if (!pending) {
    console.warn(`[PreviewManager] No pending batch found: ${approval.batchId}`);
    return;
  }
  
  const { batch, resolve } = pending;
  
  // Update preview status
  const preview = batch.previews.find(p => p.id === approval.previewId);
  if (preview) {
    preview.status = approval.action === "approve" ? "approved" 
      : approval.action === "approve_modified" ? "modified"
      : "rejected";
    
    if (approval.modifiedContent) {
      preview.userModifiedContent = approval.modifiedContent;
    }
  }
  
  // Check if all previews are resolved
  const allResolved = batch.previews.every(p => p.status !== "pending");
  
  if (allResolved) {
    batch.status = "resolved";
    pendingBatches.delete(approval.batchId);
    
    // Build result
    const result: PreviewBatchResult = {
      batchId: batch.id,
      approved: batch.previews.some(p => p.status === "approved" || p.status === "modified"),
      previews: batch.previews.map(p => ({
        id: p.id,
        action: p.status === "approved" ? "approve"
          : p.status === "modified" ? "approve_modified"
          : p.status === "rejected" ? "reject_skip"
          : "reject_skip",
        content: p.status === "modified" ? p.userModifiedContent : p.after,
      })),
    };
    
    resolve(result);
  }
}

/**
 * Handle batch approval (approve all or reject all)
 */
export function handleBatchApproval(batchApproval: BatchApproval): void {
  const pending = pendingBatches.get(batchApproval.batchId);
  if (!pending) {
    console.warn(`[PreviewManager] No pending batch found: ${batchApproval.batchId}`);
    return;
  }
  
  const { batch, resolve } = pending;
  const action = batchApproval.action;
  
  // Update all previews
  batch.previews.forEach(preview => {
    preview.status = action === "approve_all" ? "approved" : "rejected";
  });
  
  batch.status = "resolved";
  pendingBatches.delete(batchApproval.batchId);
  
  // Build result
  const result: PreviewBatchResult = {
    batchId: batch.id,
    approved: action === "approve_all",
    previews: batch.previews.map(p => ({
      id: p.id,
      action: action === "approve_all" ? "approve" : "reject_skip",
      content: p.after,
    })),
  };
  
  resolve(result);
}

/**
 * Cancel a pending preview batch (e.g., session stopped)
 */
export function cancelPendingBatch(batchId: string): void {
  const pending = pendingBatches.get(batchId);
  if (pending) {
    pendingBatches.delete(batchId);
    pending.resolve({
      batchId,
      approved: false,
      previews: pending.batch.previews.map(p => ({
        id: p.id,
        action: "reject_skip",
      })),
    });
  }
}

/**
 * Cancel all pending batches for a session
 */
export function cancelSessionBatches(sessionId: string): void {
  for (const [batchId, pending] of pendingBatches) {
    if (pending.batch.sessionId === sessionId) {
      cancelPendingBatch(batchId);
    }
  }
}

/**
 * Get pending batch by ID
 */
export function getPendingBatch(batchId: string): PreviewBatch | undefined {
  return pendingBatches.get(batchId)?.batch;
}

/**
 * Check if there are pending batches for a session
 */
export function hasPendingBatches(sessionId: string): boolean {
  for (const pending of pendingBatches.values()) {
    if (pending.batch.sessionId === sessionId) {
      return true;
    }
  }
  return false;
}
