import { z } from 'zod';
import { type SessionConfig } from './types.js';
import { STYLE_PRESETS } from './styles.js';
import { readingFields } from './reading.js';
import { regionalFields } from './regional.js';
export const configPatchSchema = z.object({
  ...regionalFields, ...readingFields,
  syncMode: z.enum(['independent','presenter','shared']).optional(),
  presenterViewerId: z.string().max(128).regex(/^[a-zA-Z0-9_-]*$/).optional(),
  theme: z.enum(['dark','light','system']).optional(),
  style: z.enum(STYLE_PRESETS.map(value => value.id) as [string, ...string[]]).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict().refine(value=>Object.keys(value).length>0, 'Supply at least one setting').meta({ minProperties: 1 });
export const DEFAULT_CONFIG: SessionConfig = { theme:'dark', style:'ocean', accent:'#38bdf8' };
export function mergeConfig(current: SessionConfig, patch: Partial<SessionConfig>): SessionConfig {
  const style = patch.style ? STYLE_PRESETS.find(x=>x.id===patch.style) : undefined;
  return {...current, ...patch, ...(style && !patch.accent ? {accent:style.accent}:{})};
}
