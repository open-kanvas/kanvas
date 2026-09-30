/** Muted categorical colours for charts that must tell several series or
 * categories apart. Deliberately separate from the single UI accent, which is
 * used only when a chart has one series. Themes may override each variable. */
export const CATEGORICAL_PALETTE = [
  'var(--chart-blue, #6fb1e4)', 'var(--chart-orange, #e3ab75)', 'var(--chart-green, #8fc79a)', 'var(--chart-violet, #bb9de7)',
  'var(--chart-rose, #e98d9d)', 'var(--chart-teal, #71c5b1)', 'var(--chart-gold, #d9c36a)', 'var(--chart-brown, #b08968)',
] as const;
export const categoricalColor = (index: number): string => CATEGORICAL_PALETTE[((index % CATEGORICAL_PALETTE.length) + CATEGORICAL_PALETTE.length) % CATEGORICAL_PALETTE.length];
/** One series keeps the session accent; several series get categorical colours. */
export const seriesColor = (index: number, total: number): string => total <= 1 ? 'var(--accent)' : categoricalColor(index);
