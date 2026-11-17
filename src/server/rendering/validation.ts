import {z} from 'zod';
import {viewSchema} from '../../shared/view-schemas.js';
import type {RenderingIssue} from './errors.js';
import {STATIC_HTML_RULE} from '../../shared/html-schema.js';
import {COUNTDOWN_TARGET_TIME_RULE,timerValidationRule} from '../../shared/timer.js';

const safeFields = new Set(['action', 'view', 'template', 'dataRef']);
function collectFields(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value) && 'properties' in value && value.properties && typeof value.properties === 'object') for (const key of Object.keys(value.properties)) safeFields.add(key);
  for (const child of Object.values(value)) collectFields(child);
}
collectFields(z.toJSONSchema(viewSchema, { io: 'input', reused: 'ref' }));

/** Never echo Zod messages, invalid enum values, or unknown object keys from source data. */
export function safeSchemaIssues(error: unknown, prefix: string[] = []): RenderingIssue[] {
  if (!(error instanceof z.ZodError)) return [];
  const issues: RenderingIssue[] = [];
  const visit = (issue: z.core.$ZodIssue): void => {
    if (issues.length >= 8) return;
    const timerRule = timerValidationRule(issue);
    if (timerRule) {
      issues.push({ path: [...prefix, ...issue.path.map(part => typeof part === 'number' ? String(part) : safeFields.has(String(part)) ? String(part) : '<record-key>')].join('.') || '$', code: issue.code, rule: timerRule });
      return;
    }
    if (issue.code === 'invalid_union') {
      // A discriminated view is validated separately, so any remaining union is a field type.
      issues.push({ path: [...prefix, ...issue.path.map(part => typeof part === 'number' ? String(part) : safeFields.has(String(part)) ? String(part) : '<record-key>')].join('.') || '$', code: 'invalid_union', rule: 'Use a permitted type or layout from the supplied schema.' });
      return;
    }
    const path = [...prefix, ...issue.path.map(part => typeof part === 'number' ? String(part) : safeFields.has(String(part)) ? String(part) : '<record-key>')].join('.') || '$';
    if (issue.code === 'unrecognized_keys' && issue.keys.includes('targetTime')) {
      issues.push({ path: `${path}.targetTime`, code: 'unrecognized_keys', rule: COUNTDOWN_TARGET_TIME_RULE });
      if (issue.keys.length === 1 || issues.length >= 8) return;
    }
    let rule: string;
    switch (issue.code) {
      case 'invalid_type': rule = `Expected ${['string', 'number', 'boolean', 'array', 'object', 'null', 'int'].includes(issue.expected) ? issue.expected : 'the schema type'}.`; break;
      case 'unrecognized_keys': rule = 'Remove unsupported fields; allowed property names are in the supplied schema.'; break;
      case 'invalid_value': rule = 'Use one of the exact enum/constant values in the supplied schema.'; break;
      case 'too_small': rule = `Value must meet the schema minimum${typeof issue.minimum === 'number' ? ` (${issue.minimum})` : ''}.`; break;
      case 'too_big': rule = `Value must fit the schema maximum${typeof issue.maximum === 'number' ? ` (${issue.maximum})` : ''}.`; break;
      case 'invalid_format': rule = 'Use the exact format required by the supplied schema.'; break;
      default: rule = issue.code === 'custom' && issue.message === STATIC_HTML_RULE ? STATIC_HTML_RULE : 'The fields must satisfy this template’s source and layout constraints.';
    }
    issues.push({ path, code: issue.code, rule });
  };
  error.issues.forEach(visit);
  return issues;
}

