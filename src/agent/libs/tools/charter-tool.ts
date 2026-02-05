/**
 * Charter Tool - Manage session charter (scope/constraints)
 */

import type { ToolDefinition, ToolResult, ToolExecutionContext } from './base-tool.js';
import type { CharterData, CharterItem, ADRItem } from '../../types.js';
import { computeCharterHash } from '../../types.js';
import { randomUUID } from 'crypto';

// Generate ADR ID in format: adr-YYYY-MM-DD-<short_id>
function generateADRId(): string {
  const date = new Date().toISOString().slice(0, 10);
  const shortId = randomUUID().slice(0, 8);
  return `adr-${date}-${shortId}`;
}

// Create ADR for charter change
function createCharterChangeADR(
  oldHash: string | undefined,
  newHash: string,
  changedFields: string[]
): ADRItem {
  return {
    id: generateADRId(),
    title: `Charter Update: ${changedFields.join(', ')}`,
    status: 'accepted',  // Charter changes are auto-accepted
    type: 'charter-change',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    context: `Charter was updated. Changed fields: ${changedFields.join(', ')}`,
    decision: 'Update charter to reflect new requirements/constraints',
    consequences: 'Session scope has been modified; Previous charter hash is now outdated',
    charterHashBefore: oldHash,
    charterHashAfter: newHash
  };
}

export const CharterToolDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "manage_charter",
    description: "Manage the session charter (goal, constraints, definition of done). Use this to set or update the charter that defines this session's scope.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["set", "update", "get"],
          description: "Action to perform: 'set' creates/replaces charter, 'update' modifies fields, 'get' retrieves current charter"
        },
        goal: {
          type: "string",
          description: "Primary objective (required for 'set' action)"
        },
        non_goals: {
          type: "array",
          items: { type: "string" },
          description: "Items explicitly out of scope"
        },
        definition_of_done: {
          type: "array",
          items: { type: "string" },
          description: "Acceptance criteria (required for 'set' action)"
        },
        constraints: {
          type: "array",
          items: { type: "string" },
          description: "Soft constraints (can be overridden with ADR)"
        },
        invariants: {
          type: "array",
          items: { type: "string" },
          description: "Hard constraints (NEVER violate)"
        },
        glossary: {
          type: "object",
          description: "Domain terminology (key-value pairs)"
        }
      },
      required: ["action"]
    }
  }
};

interface ManageCharterArgs {
  action: 'set' | 'update' | 'get';
  goal?: string;
  non_goals?: string[];
  definition_of_done?: string[];
  constraints?: string[];
  invariants?: string[];
  glossary?: Record<string, string>;
}

// Create a charter item with unique ID
function createCharterItem(content: string, prefix: string): CharterItem {
  return {
    id: `${prefix}-${randomUUID().slice(0, 8)}`,
    content
  };
}

// Parse charter from markdown (simplified parser)
export function parseCharterMarkdown(content: string): CharterData | null {
  try {
    const lines = content.split('\n');
    let currentSection = '';
    let goal = '';
    const nonGoals: string[] = [];
    const dod: string[] = [];
    const constraints: string[] = [];
    const invariants: string[] = [];
    const glossary: Record<string, string> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Section headers
      if (trimmed.startsWith('## Goal')) {
        currentSection = 'goal';
      } else if (trimmed.startsWith('## Non-Goals')) {
        currentSection = 'non_goals';
      } else if (trimmed.startsWith('## Definition of Done')) {
        currentSection = 'dod';
      } else if (trimmed.startsWith('## Constraints')) {
        currentSection = 'constraints';
      } else if (trimmed.startsWith('## Invariants')) {
        currentSection = 'invariants';
      } else if (trimmed.startsWith('## Glossary')) {
        currentSection = 'glossary';
      } else if (trimmed.startsWith('##')) {
        currentSection = '';
      } else if (trimmed && !trimmed.startsWith('<!--') && !trimmed.endsWith('-->')) {
        // Content lines
        if (currentSection === 'goal' && !trimmed.startsWith('#') && !trimmed.startsWith('[')) {
          goal = trimmed;
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
          const item = trimmed.replace(/^- (\[[x ]\] )?/, '').trim();
          if (item && !item.startsWith('[')) {
            switch (currentSection) {
              case 'non_goals': nonGoals.push(item); break;
              case 'dod': dod.push(item); break;
              case 'constraints': constraints.push(item); break;
              case 'invariants': invariants.push(item); break;
            }
          }
        } else if (currentSection === 'glossary' && trimmed.startsWith('**')) {
          // Parse glossary: **Term**: Definition
          const match = trimmed.match(/^\*\*([^*]+)\*\*:\s*(.+)$/);
          if (match) {
            glossary[match[1]] = match[2];
          }
        }
      }
    }

    if (!goal || dod.length === 0) {
      return null;
    }

    const now = Date.now();
    return {
      goal: createCharterItem(goal, 'goal'),
      nonGoals: nonGoals.map(ng => createCharterItem(ng, 'ng')),
      definitionOfDone: dod.map(d => createCharterItem(d, 'dod')),
      constraints: constraints.map(c => createCharterItem(c, 'con')),
      invariants: invariants.map(inv => createCharterItem(inv, 'inv')),
      glossary: Object.keys(glossary).length > 0 ? glossary : undefined,
      version: 1,
      createdAt: now,
      updatedAt: now
    };
  } catch (e) {
    console.error('[Charter] Failed to parse markdown:', e);
    return null;
  }
}

// Render charter to markdown
export function renderCharterMarkdown(charter: CharterData): string {
  const lines: string[] = [];
  
  lines.push('# Session Charter');
  lines.push('');
  lines.push('## Goal');
  lines.push(charter.goal.content);
  lines.push('');
  
  if (charter.nonGoals && charter.nonGoals.length > 0) {
    lines.push('## Non-Goals');
    for (const ng of charter.nonGoals) {
      lines.push(`- ${ng.content}`);
    }
    lines.push('');
  }
  
  lines.push('## Definition of Done');
  for (const dod of charter.definitionOfDone) {
    lines.push(`- [ ] ${dod.content}`);
  }
  lines.push('');
  
  if (charter.constraints && charter.constraints.length > 0) {
    lines.push('## Constraints');
    for (const c of charter.constraints) {
      lines.push(`- ${c.content}`);
    }
    lines.push('');
  }
  
  if (charter.invariants && charter.invariants.length > 0) {
    lines.push('## Invariants');
    for (const inv of charter.invariants) {
      lines.push(`- ${inv.content}`);
    }
    lines.push('');
  }
  
  if (charter.glossary && Object.keys(charter.glossary).length > 0) {
    lines.push('## Glossary');
    for (const [term, def] of Object.entries(charter.glossary)) {
      lines.push(`- **${term}**: ${def}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

export async function executeCharterTool(
  args: ManageCharterArgs,
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
  
  switch (action) {
    case 'get': {
      if (!session?.charter) {
        return {
          success: true,
          output: 'No charter defined for this session yet. Use action="set" to create one.'
        };
      }
      
      return {
        success: true,
        output: renderCharterMarkdown(session.charter),
        data: { charter: session.charter }
      };
    }
    
    case 'set': {
      if (!args.goal) {
        return { success: false, error: 'Missing required field: goal' };
      }
      if (!args.definition_of_done || args.definition_of_done.length === 0) {
        return { success: false, error: 'Missing required field: definition_of_done (at least one criterion required)' };
      }
      
      const now = Date.now();
      const charter: CharterData = {
        goal: createCharterItem(args.goal, 'goal'),
        nonGoals: args.non_goals?.map(ng => createCharterItem(ng, 'ng')),
        definitionOfDone: args.definition_of_done.map(d => createCharterItem(d, 'dod')),
        constraints: args.constraints?.map(c => createCharterItem(c, 'con')),
        invariants: args.invariants?.map(inv => createCharterItem(inv, 'inv')),
        glossary: args.glossary,
        version: 1,
        createdAt: now,
        updatedAt: now
      };
      
      const charterHash = computeCharterHash(charter);
      
      // Update session
      sessionStore.updateSession(context.sessionId, { charter, charterHash });
      
      // Emit update event
      if (context.onCharterChanged) {
        context.onCharterChanged(charter, charterHash);
      }
      
      return {
        success: true,
        output: `Charter created successfully.\n\nHash: ${charterHash}\n\n${renderCharterMarkdown(charter)}`,
        data: { charter, charterHash }
      };
    }
    
    case 'update': {
      if (!session?.charter) {
        return { success: false, error: 'No charter exists. Use action="set" first.' };
      }
      
      const oldCharterHash = session.charterHash;
      const now = Date.now();
      const updated: CharterData = {
        ...session.charter,
        updatedAt: now,
        version: (session.charter.version || 0) + 1
      };
      
      // Track which fields changed
      const changedFields: string[] = [];
      
      if (args.goal) {
        updated.goal = createCharterItem(args.goal, 'goal');
        changedFields.push('goal');
      }
      if (args.non_goals) {
        updated.nonGoals = args.non_goals.map(ng => createCharterItem(ng, 'ng'));
        changedFields.push('non_goals');
      }
      if (args.definition_of_done) {
        updated.definitionOfDone = args.definition_of_done.map(d => createCharterItem(d, 'dod'));
        changedFields.push('definition_of_done');
      }
      if (args.constraints) {
        updated.constraints = args.constraints.map(c => createCharterItem(c, 'con'));
        changedFields.push('constraints');
      }
      if (args.invariants) {
        updated.invariants = args.invariants.map(inv => createCharterItem(inv, 'inv'));
        changedFields.push('invariants');
      }
      if (args.glossary) {
        updated.glossary = { ...(updated.glossary || {}), ...args.glossary };
        changedFields.push('glossary');
      }
      
      const charterHash = computeCharterHash(updated);
      
      // Auto-create ADR for charter change
      const adrs: ADRItem[] = session.adrs || [];
      const charterADR = createCharterChangeADR(oldCharterHash, charterHash, changedFields);
      adrs.push(charterADR);
      
      // Update session with both charter and ADR
      sessionStore.updateSession(context.sessionId, { 
        charter: updated, 
        charterHash,
        adrs
      });
      
      // Emit update events
      if (context.onCharterChanged) {
        context.onCharterChanged(updated, charterHash);
      }
      if (context.onADRsChanged) {
        context.onADRsChanged(adrs);
      }
      
      return {
        success: true,
        output: `Charter updated (v${updated.version}).\n\nHash: ${charterHash}\n\nADR created: ${charterADR.id}\n\n${renderCharterMarkdown(updated)}`,
        data: { charter: updated, charterHash, adr: charterADR }
      };
    }
    
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}
