/**
 * Session Validation - Charter and ADR integrity checks
 * 
 * Provides validation for session startup and compliance gates
 */

import type { CharterData, ADRItem, SessionInfo } from '../types.js';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
}

/**
 * Validate charter completeness
 * Required: goal, definitionOfDone (at least one item)
 * Optional but recommended: constraints, invariants
 */
export function validateCharter(charter: CharterData | undefined): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!charter) {
    // No charter is valid (optional feature)
    return { valid: true, errors: [], warnings: [] };
  }

  // Required: goal
  if (!charter.goal || !charter.goal.content?.trim()) {
    errors.push({
      code: 'CHARTER_MISSING_GOAL',
      message: 'Charter must have a goal defined',
      field: 'goal'
    });
  }

  // Required: at least one definition of done item
  if (!charter.definitionOfDone || charter.definitionOfDone.length === 0) {
    errors.push({
      code: 'CHARTER_MISSING_DOD',
      message: 'Charter must have at least one definition of done criterion',
      field: 'definitionOfDone'
    });
  } else {
    // Check for empty items
    const emptyDod = charter.definitionOfDone.filter(d => !d.content?.trim());
    if (emptyDod.length > 0) {
      warnings.push({
        code: 'CHARTER_EMPTY_DOD_ITEMS',
        message: `${emptyDod.length} definition of done item(s) are empty`,
        field: 'definitionOfDone'
      });
    }
  }

  // Recommended: constraints
  if (!charter.constraints || charter.constraints.length === 0) {
    warnings.push({
      code: 'CHARTER_NO_CONSTRAINTS',
      message: 'Consider adding constraints to define soft boundaries',
      field: 'constraints'
    });
  }

  // Recommended: invariants for important sessions
  if (!charter.invariants || charter.invariants.length === 0) {
    warnings.push({
      code: 'CHARTER_NO_INVARIANTS',
      message: 'Consider adding invariants for critical rules that must never be violated',
      field: 'invariants'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate ADR chain integrity
 * - All supersedes references must point to existing ADRs
 * - No circular supersedes chains
 */
export function validateADRChain(adrs: ADRItem[] | undefined): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!adrs || adrs.length === 0) {
    return { valid: true, errors: [], warnings: [] };
  }

  const adrIds = new Set(adrs.map(a => a.id));

  for (const adr of adrs) {
    // Check supersedes reference exists
    if (adr.supersedes && !adrIds.has(adr.supersedes)) {
      errors.push({
        code: 'ADR_INVALID_SUPERSEDES',
        message: `ADR ${adr.id} references non-existent ADR: ${adr.supersedes}`,
        field: `adrs[${adr.id}].supersedes`
      });
    }

    // Check for proposed ADRs that are old (>24h)
    if (adr.status === 'proposed') {
      const ageHours = (Date.now() - adr.createdAt) / (1000 * 60 * 60);
      if (ageHours > 24) {
        warnings.push({
          code: 'ADR_STALE_PROPOSED',
          message: `ADR ${adr.id} has been proposed for ${Math.floor(ageHours)}h - consider accepting or rejecting`,
          field: `adrs[${adr.id}].status`
        });
      }
    }

    // Check charter-change ADRs have hash references
    if (adr.type === 'charter-change') {
      if (!adr.charterHashAfter) {
        warnings.push({
          code: 'ADR_MISSING_CHARTER_HASH',
          message: `Charter-change ADR ${adr.id} missing charterHashAfter`,
          field: `adrs[${adr.id}].charterHashAfter`
        });
      }
    }
  }

  // Check for circular supersedes chains
  const visited = new Set<string>();
  const checkCircular = (id: string, path: string[]): boolean => {
    if (path.includes(id)) {
      errors.push({
        code: 'ADR_CIRCULAR_SUPERSEDES',
        message: `Circular supersedes chain detected: ${[...path, id].join(' → ')}`,
        field: 'adrs'
      });
      return true;
    }
    
    const adr = adrs.find(a => a.id === id);
    if (adr?.supersedes && !visited.has(id)) {
      visited.add(id);
      return checkCircular(adr.supersedes, [...path, id]);
    }
    return false;
  };

  for (const adr of adrs) {
    if (adr.supersedes && !visited.has(adr.id)) {
      checkCircular(adr.id, []);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Full session validation (charter + ADRs)
 */
export function validateSession(session: {
  charter?: CharterData;
  charterHash?: string;
  adrs?: ADRItem[];
}): ValidationResult {
  const charterResult = validateCharter(session.charter);
  const adrResult = validateADRChain(session.adrs);

  // Additional cross-validation
  const warnings: ValidationWarning[] = [
    ...charterResult.warnings,
    ...adrResult.warnings
  ];

  // If charter exists but has been modified without ADR
  if (session.charter && session.charterHash && session.adrs) {
    const charterChangeADRs = session.adrs.filter(a => a.type === 'charter-change');
    if (charterChangeADRs.length === 0 && session.charter.version && session.charter.version > 1) {
      warnings.push({
        code: 'CHARTER_CHANGE_NO_ADR',
        message: 'Charter has been updated but no charter-change ADR exists',
        field: 'charter'
      });
    }
  }

  return {
    valid: charterResult.valid && adrResult.valid,
    errors: [...charterResult.errors, ...adrResult.errors],
    warnings
  };
}

/**
 * Format validation result as human-readable text
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid && result.warnings.length === 0) {
    return '✅ Session validation passed';
  }

  if (!result.valid) {
    lines.push('❌ Session validation failed:');
    for (const error of result.errors) {
      lines.push(`  - [${error.code}] ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('⚠️ Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - [${warning.code}] ${warning.message}`);
    }
  }

  return lines.join('\n');
}
