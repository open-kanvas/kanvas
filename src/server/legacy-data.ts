import type { ViewSpec } from '../shared/types.js';

/** Compatibility at the storage boundary, not a supported public input shape. */
const retiredSettings = ['density', 'mode', 'modeExplicit', 'model', 'language', 'sourceLanguage', 'retainOriginal', 'updatePolicy'];
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function normalizeLegacyView(value: unknown): unknown {
  if (!object(value)) return value;
  if (value.template === 'settings' && object(value.data) && value.data.dimension === 'density') return {...value, data:{...value.data, dimension:'all'}};
  if (value.template === 'game') return { version: 1, template: 'fact', data: { text: 'This retired view is no longer available.' } } satisfies ViewSpec;
  if (value.template === 'presentation' && object(value.data) && Array.isArray(value.data.slides)) return { ...value, data: { ...value.data, slides: value.data.slides.map(normalizeLegacyView) } };
  return value;
}
export function normalizeLegacyRecord<T>(kind: string, value: T): T {
  if (!object(value)) return value;
  const record: Record<string, any> = value;
  if (['session', 'preferences', 'session-context', 'group'].includes(kind)) {
    for (const key of ['config', 'overrides', 'defaults', 'appearanceOverrides', 'configOverrides']) if (object(record[key])) for (const field of retiredSettings) delete record[key][field];
  }
  if (['display', 'display-history', 'view-pin'].includes(kind)) record.view = normalizeLegacyView(record.view);
  if (kind === 'deck' && Array.isArray(record.slides)) record.slides = record.slides.map(normalizeLegacyView);
  if (kind === 'update' && object(record.metrics)) {
    record.metrics = Object.fromEntries(Object.entries(record.metrics).filter(([key]) => /^(?:renderMs|appliedAfterMs|targetDisplays|validationMs|path|display\.[^.]+\.(?:validationMs|path))$/.test(key)));
  }
  return value;
}
