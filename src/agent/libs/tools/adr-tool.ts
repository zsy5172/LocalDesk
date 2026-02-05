/**
 * ADR Tool - Manage Architecture Decision Records
 */

import type { ToolDefinition, ToolResult, ToolExecutionContext } from './base-tool.js';
import type { ADRItem, ADRStatus, ADRType } from '../../types.js';
import { randomUUID } from 'crypto';

export const ADRToolDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "manage_adr",
    description: "Manage Architecture Decision Records (ADRs) for this session. Use this to track important technical decisions, their context, and consequences.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "update_status", "list", "get"],
          description: "Action to perform: 'create' new ADR, 'update_status' change status, 'list' all ADRs, 'get' specific ADR"
        },
        adr_id: {
          type: "string",
          description: "ADR ID (required for 'update_status' and 'get' actions)"
        },
        title: {
          type: "string",
          description: "ADR title (required for 'create' action)"
        },
        status: {
          type: "string",
          enum: ["proposed", "accepted", "rejected", "deprecated", "superseded"],
          description: "ADR status (for 'create' defaults to 'proposed', for 'update_status' the new status)"
        },
        type: {
          type: "string",
          enum: ["architectural", "technical", "process", "charter-change", "constraint-override", "user-override"],
          description: "Type of decision (required for 'create' action)"
        },
        context: {
          type: "string",
          description: "Background and context for the decision (required for 'create' action)"
        },
        decision: {
          type: "string",
          description: "The decision made (required for 'create' action)"
        },
        consequences: {
          type: "array",
          items: { type: "string" },
          description: "List of consequences/implications of this decision"
        },
        alternatives: {
          type: "array",
          items: { type: "string" },
          description: "Alternative options that were considered"
        },
        charter_refs: {
          type: "array",
          items: { type: "string" },
          description: "References to charter items (e.g., 'goal-abc123', 'con-def456')"
        },
        supersedes: {
          type: "string",
          description: "ID of ADR this supersedes (for replacement decisions)"
        },
        charter_hash_before: {
          type: "string",
          description: "Charter hash before change (for charter-change type)"
        },
        charter_hash_after: {
          type: "string",
          description: "Charter hash after change (for charter-change type)"
        }
      },
      required: ["action"]
    }
  }
};

interface ManageADRArgs {
  action: 'create' | 'update_status' | 'list' | 'get';
  adr_id?: string;
  title?: string;
  status?: ADRStatus;
  type?: ADRType;
  context?: string;
  decision?: string;
  consequences?: string[];
  alternatives?: string[];
  charter_refs?: string[];
  supersedes?: string;
  charter_hash_before?: string;
  charter_hash_after?: string;
}

// Generate ADR ID in format: adr-YYYY-MM-DD-<short_id>
function generateADRId(): string {
  const date = new Date().toISOString().slice(0, 10);
  const shortId = randomUUID().slice(0, 8);
  return `adr-${date}-${shortId}`;
}

// Format ADR as markdown for display
function formatADRMarkdown(adr: ADRItem): string {
  const lines: string[] = [];
  
  lines.push(`# ADR: ${adr.title}`);
  lines.push('');
  lines.push(`**ID:** ${adr.id}`);
  lines.push(`**Status:** ${adr.status}`);
  lines.push(`**Type:** ${adr.type}`);
  lines.push(`**Date:** ${new Date(adr.createdAt).toISOString().slice(0, 10)}`);
  lines.push('');
  
  lines.push('## Context');
  lines.push(adr.context);
  lines.push('');
  
  lines.push('## Decision');
  lines.push(adr.decision);
  lines.push('');
  
  if (adr.consequences && adr.consequences.length > 0) {
    lines.push('## Consequences');
    for (const c of adr.consequences) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }
  
  if (adr.alternatives && adr.alternatives.length > 0) {
    lines.push('## Alternatives Considered');
    for (const alt of adr.alternatives) {
      lines.push(`- ${alt}`);
    }
    lines.push('');
  }
  
  if (adr.charterRefs && adr.charterRefs.length > 0) {
    lines.push('## Charter References');
    for (const ref of adr.charterRefs) {
      lines.push(`- ${ref}`);
    }
    lines.push('');
  }
  
  if (adr.supersedes) {
    lines.push(`**Supersedes:** ${adr.supersedes}`);
    lines.push('');
  }
  
  if (adr.charterHashBefore || adr.charterHashAfter) {
    lines.push('## Charter Change');
    if (adr.charterHashBefore) lines.push(`- Before: ${adr.charterHashBefore}`);
    if (adr.charterHashAfter) lines.push(`- After: ${adr.charterHashAfter}`);
    lines.push('');
  }
  
  return lines.join('\n');
}

// Format ADR list as markdown
function formatADRList(adrs: ADRItem[]): string {
  if (adrs.length === 0) {
    return 'No ADRs recorded for this session.';
  }
  
  const lines: string[] = [];
  lines.push('# Architecture Decision Records');
  lines.push('');
  lines.push('| ID | Title | Status | Type | Date |');
  lines.push('|----|-------|--------|------|------|');
  
  for (const adr of adrs) {
    const date = new Date(adr.createdAt).toISOString().slice(0, 10);
    lines.push(`| ${adr.id} | ${adr.title} | ${adr.status} | ${adr.type} | ${date} |`);
  }
  
  return lines.join('\n');
}

export async function executeADRTool(
  args: ManageADRArgs,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const { action } = args;
  
  // Get session store
  const sessionStore = (global as any).sessionStore;
  if (!sessionStore || !context.sessionId) {
    return {
      success: false,
      error: 'Session store not available or no session ID'
    };
  }
  
  const session = sessionStore.getSession(context.sessionId);
  const adrs: ADRItem[] = session?.adrs || [];
  
  switch (action) {
    case 'list': {
      return {
        success: true,
        output: formatADRList(adrs),
        data: { adrs, count: adrs.length }
      };
    }
    
    case 'get': {
      if (!args.adr_id) {
        return { success: false, error: 'Missing required field: adr_id' };
      }
      
      const adr = adrs.find(a => a.id === args.adr_id);
      if (!adr) {
        return { success: false, error: `ADR not found: ${args.adr_id}` };
      }
      
      return {
        success: true,
        output: formatADRMarkdown(adr),
        data: { adr }
      };
    }
    
    case 'create': {
      if (!args.title) {
        return { success: false, error: 'Missing required field: title' };
      }
      if (!args.type) {
        return { success: false, error: 'Missing required field: type' };
      }
      if (!args.context) {
        return { success: false, error: 'Missing required field: context' };
      }
      if (!args.decision) {
        return { success: false, error: 'Missing required field: decision' };
      }
      
      const newADR: ADRItem = {
        id: generateADRId(),
        title: args.title,
        status: args.status || 'proposed',
        type: args.type,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        context: args.context,
        decision: args.decision,
        consequences: args.consequences?.join('; ') || '',
        alternatives: args.alternatives?.join('; '),
        charterRefs: args.charter_refs,
        supersedes: args.supersedes,
        charterHashBefore: args.charter_hash_before,
        charterHashAfter: args.charter_hash_after
      };
      
      // If superseding another ADR, mark the old one as superseded
      const updatedADRs = [...adrs];
      if (args.supersedes) {
        const supersededIdx = updatedADRs.findIndex(a => a.id === args.supersedes);
        if (supersededIdx >= 0) {
          updatedADRs[supersededIdx] = {
            ...updatedADRs[supersededIdx],
            status: 'superseded'
          };
        }
      }
      
      updatedADRs.push(newADR);
      
      // Update session
      sessionStore.updateSession(context.sessionId, { adrs: updatedADRs });
      
      // Emit update event
      if (context.onADRsChanged) {
        context.onADRsChanged(updatedADRs);
      }
      
      return {
        success: true,
        output: `ADR created: ${newADR.id}\n\n${formatADRMarkdown(newADR)}`,
        data: { adr: newADR, totalADRs: updatedADRs.length }
      };
    }
    
    case 'update_status': {
      if (!args.adr_id) {
        return { success: false, error: 'Missing required field: adr_id' };
      }
      if (!args.status) {
        return { success: false, error: 'Missing required field: status' };
      }
      
      const adrIdx = adrs.findIndex(a => a.id === args.adr_id);
      if (adrIdx < 0) {
        return { success: false, error: `ADR not found: ${args.adr_id}` };
      }
      
      const updatedADRs = [...adrs];
      const updatedADR = { ...updatedADRs[adrIdx], status: args.status };
      updatedADRs[adrIdx] = updatedADR;
      
      // Update session
      sessionStore.updateSession(context.sessionId, { adrs: updatedADRs });
      
      // Emit update event
      if (context.onADRsChanged) {
        context.onADRsChanged(updatedADRs);
      }
      
      return {
        success: true,
        output: `ADR ${args.adr_id} status updated to: ${args.status}\n\n${formatADRMarkdown(updatedADR)}`,
        data: { adr: updatedADR }
      };
    }
    
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}
