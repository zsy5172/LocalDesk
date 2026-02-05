/**
 * Compliance Gate - Check action compliance against charter constraints
 * 
 * Provides soft and hard compliance checks before tool execution
 */

import type { CharterData, CharterItem, ADRItem } from '../types.js';

export interface ActionIntent {
  /** Brief summary of what the action does */
  summary: string;
  /** Files/resources this action touches */
  touches: string[];
  /** Charter item references (e.g., 'goal-abc123', 'con-def456') */
  charterRefs?: string[];
  /** Whether this action requires a decision (ADR) */
  requiresDecision?: boolean;
  /** Tool name being executed */
  toolName: string;
  /** Tool input/args */
  toolInput: unknown;
}

export interface ComplianceResult {
  allowed: boolean;
  /** 'pass' | 'soft_fail' | 'hard_fail' */
  status: 'pass' | 'soft_fail' | 'hard_fail';
  /** Human-readable reason */
  reason?: string;
  /** Violated invariants (hard fail) */
  violatedInvariants?: CharterItem[];
  /** Violated constraints (soft fail) */
  violatedConstraints?: CharterItem[];
  /** Warnings (informational) */
  warnings?: string[];
}

/**
 * Extract potential charter references from action intent
 * This is a heuristic based on file paths, tool names, and content
 */
export function inferCharterRefs(
  intent: ActionIntent,
  charter: CharterData | undefined
): string[] {
  if (!charter) return [];
  
  const refs: string[] = [];
  const summaryLower = intent.summary.toLowerCase();
  const touchesStr = intent.touches.join(' ').toLowerCase();

  // Check if action relates to goal
  if (charter.goal) {
    const goalKeywords = extractKeywords(charter.goal.content);
    if (goalKeywords.some(kw => summaryLower.includes(kw) || touchesStr.includes(kw))) {
      refs.push(charter.goal.id);
    }
  }

  // Check constraints
  if (charter.constraints) {
    for (const constraint of charter.constraints) {
      const keywords = extractKeywords(constraint.content);
      if (keywords.some(kw => summaryLower.includes(kw) || touchesStr.includes(kw))) {
        refs.push(constraint.id);
      }
    }
  }

  // Check invariants
  if (charter.invariants) {
    for (const invariant of charter.invariants) {
      const keywords = extractKeywords(invariant.content);
      if (keywords.some(kw => summaryLower.includes(kw) || touchesStr.includes(kw))) {
        refs.push(invariant.id);
      }
    }
  }

  return [...new Set(refs)]; // Dedupe
}

/**
 * Extract meaningful keywords from text (simple heuristic)
 */
function extractKeywords(text: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'also', 'now', 'any', 'this', 'that', 'these', 'those'
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Check if action violates any invariants (hard constraints)
 */
function checkInvariants(
  intent: ActionIntent,
  invariants: CharterItem[] | undefined
): CharterItem[] {
  if (!invariants || invariants.length === 0) return [];
  
  const violated: CharterItem[] = [];
  const summaryLower = intent.summary.toLowerCase();
  const touchesStr = intent.touches.join(' ').toLowerCase();
  const inputStr = JSON.stringify(intent.toolInput).toLowerCase();

  for (const inv of invariants) {
    const content = inv.content.toLowerCase();
    
    // Check for "never" or "do not" rules
    if (content.includes('never') || content.includes('do not') || content.includes('must not')) {
      // Extract what should not be done
      const forbiddenPatterns = extractForbiddenPatterns(content);
      
      for (const pattern of forbiddenPatterns) {
        if (summaryLower.includes(pattern) || 
            touchesStr.includes(pattern) || 
            inputStr.includes(pattern)) {
          violated.push(inv);
          break;
        }
      }
    }
    
    // Check for file/path restrictions
    if (content.includes('file') || content.includes('path') || content.includes('directory')) {
      const pathPatterns = extractPathPatterns(content);
      for (const pattern of pathPatterns) {
        if (intent.touches.some(t => t.includes(pattern))) {
          violated.push(inv);
          break;
        }
      }
    }
  }

  return violated;
}

/**
 * Extract patterns of what's forbidden from an invariant
 */
function extractForbiddenPatterns(content: string): string[] {
  const patterns: string[] = [];
  
  // "never X" pattern
  const neverMatch = content.match(/never\s+(\w+(?:\s+\w+){0,3})/gi);
  if (neverMatch) {
    patterns.push(...neverMatch.map(m => m.replace(/^never\s+/i, '')));
  }
  
  // "do not X" pattern
  const doNotMatch = content.match(/do\s+not\s+(\w+(?:\s+\w+){0,3})/gi);
  if (doNotMatch) {
    patterns.push(...doNotMatch.map(m => m.replace(/^do\s+not\s+/i, '')));
  }
  
  // "must not X" pattern
  const mustNotMatch = content.match(/must\s+not\s+(\w+(?:\s+\w+){0,3})/gi);
  if (mustNotMatch) {
    patterns.push(...mustNotMatch.map(m => m.replace(/^must\s+not\s+/i, '')));
  }
  
  return patterns;
}

/**
 * Extract path/file patterns from invariant
 */
function extractPathPatterns(content: string): string[] {
  const patterns: string[] = [];
  
  // Look for quoted paths
  const quotedPaths = content.match(/["']([^"']+)["']/g);
  if (quotedPaths) {
    patterns.push(...quotedPaths.map(p => p.replace(/["']/g, '')));
  }
  
  // Look for common path patterns
  const pathLike = content.match(/\b[\w\-./]+\/[\w\-./]+\b/g);
  if (pathLike) {
    patterns.push(...pathLike);
  }
  
  return patterns;
}

/**
 * Check action compliance against session charter
 */
export function checkActionCompliance(
  intent: ActionIntent,
  session: {
    charter?: CharterData;
    adrs?: ADRItem[];
  }
): ComplianceResult {
  // No charter = no restrictions
  if (!session.charter) {
    return {
      allowed: true,
      status: 'pass',
      reason: 'No charter defined'
    };
  }

  const warnings: string[] = [];
  
  // Check invariants (hard fail)
  const violatedInvariants = checkInvariants(intent, session.charter.invariants);
  if (violatedInvariants.length > 0) {
    return {
      allowed: false,
      status: 'hard_fail',
      reason: `Action violates ${violatedInvariants.length} invariant(s)`,
      violatedInvariants,
      warnings
    };
  }

  // Infer charter refs if not provided
  const charterRefs = intent.charterRefs || inferCharterRefs(intent, session.charter);
  
  // Soft fail: no charter refs (action not clearly tied to charter)
  if (charterRefs.length === 0) {
    warnings.push('Action has no clear connection to charter items');
    
    // Still allowed but flagged
    return {
      allowed: true,
      status: 'soft_fail',
      reason: 'Action does not reference any charter items',
      warnings
    };
  }

  // Check if action requires a decision (ADR)
  if (intent.requiresDecision) {
    // Check if there's a related ADR
    const hasRelatedADR = session.adrs?.some(adr => 
      adr.status === 'accepted' && 
      adr.charterRefs?.some(ref => charterRefs.includes(ref))
    );
    
    if (!hasRelatedADR) {
      warnings.push('Action may require an ADR (architectural decision)');
    }
  }

  return {
    allowed: true,
    status: 'pass',
    reason: `Action references ${charterRefs.length} charter item(s)`,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Create action intent from tool execution
 */
export function createActionIntent(
  toolName: string,
  toolInput: unknown,
  summary?: string
): ActionIntent {
  const input = toolInput as Record<string, any>;
  const touches: string[] = [];
  
  // Extract touched files/resources based on tool type
  switch (toolName) {
    case 'write_file':
    case 'read_file':
    case 'edit_file':
      if (input.path) touches.push(input.path);
      break;
    case 'bash':
      // Try to extract file paths from command
      if (input.command) {
        const pathMatches = input.command.match(/[^\s"']+\.[a-z]+/gi);
        if (pathMatches) touches.push(...pathMatches);
      }
      break;
    case 'glob':
    case 'grep':
      if (input.pattern) touches.push(`pattern:${input.pattern}`);
      if (input.path) touches.push(input.path);
      break;
  }

  return {
    summary: summary || `Execute ${toolName}`,
    touches,
    toolName,
    toolInput,
    requiresDecision: ['bash', 'write_file', 'edit_file'].includes(toolName)
  };
}

/**
 * Format compliance result as human-readable text
 */
export function formatComplianceResult(result: ComplianceResult): string {
  const lines: string[] = [];

  if (result.status === 'pass') {
    lines.push(`✅ Compliance check passed: ${result.reason}`);
  } else if (result.status === 'soft_fail') {
    lines.push(`⚠️ Compliance warning: ${result.reason}`);
  } else {
    lines.push(`❌ Compliance failed: ${result.reason}`);
    if (result.violatedInvariants) {
      lines.push('Violated invariants:');
      for (const inv of result.violatedInvariants) {
        lines.push(`  - [${inv.id}] ${inv.content}`);
      }
    }
  }

  if (result.warnings && result.warnings.length > 0) {
    for (const warning of result.warnings) {
      lines.push(`  ⚠️ ${warning}`);
    }
  }

  return lines.join('\n');
}
