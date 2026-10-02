import { z } from 'zod';
/** Explicit decorations, never transformations of source values. Indexes are zero-based. */
export const emphasisSchema = z.array(z.object({
  row: z.number().int().min(0).max(19999).optional(), column: z.string().min(1).max(200).optional(),
  series: z.string().min(1).max(200).optional(), point: z.number().int().min(0).max(4999).optional(),
  label: z.string().max(200).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict().refine(v => v.row !== undefined || v.column !== undefined || v.point !== undefined, 'Supply a row, column or point selector')).max(500).describe('Optional emphasis: table/comparison row and/or column; chart series name + zero-based point index. Omit row to emphasize an entire column. Never changes values.');
export type Emphasis = z.infer<typeof emphasisSchema>;
export function cellEmphasis(emphasis: Emphasis | undefined, row: number, column: string) { return emphasis?.find(e => e.series === undefined && e.point === undefined && (e.row === undefined || e.row === row) && (e.column === undefined || e.column === column)); }
export function pointEmphasis(emphasis: Emphasis | undefined, series: string, point: number) { return emphasis?.find(e => e.row === undefined && e.column === undefined && e.point === point && (e.series === undefined || e.series === series)); }
