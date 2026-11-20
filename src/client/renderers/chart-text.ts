export type ChartTextMeasure = (text: string) => number;
/** Wrap by measured glyph width, including identifiers with no spaces. Source text stays in the accessible label. */
export function wrapChartTick(label: string, width: number, measure: ChartTextMeasure): string[] {
  const lines: string[] = [];
  let line = '';
  const words = label.trim().split(/\s+/u);
  for (const word of words) {
    if (!word) continue;
    const joined = line ? `${line} ${word}` : word;
    if (measure(joined) <= width) { line = joined; continue; }
    if (line) { lines.push(line); line = ''; }
    if (measure(word) <= width) { line = word; continue; }
    const glyphs = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word), part => part.segment)
      : Array.from(word);
    for (const glyph of glyphs) {
      while (line && measure(line + glyph) > width) {
        const boundary = Math.max(line.lastIndexOf('-'), line.lastIndexOf('–'), line.lastIndexOf('/')) + 1;
        if (boundary && boundary < line.length) { lines.push(line.slice(0, boundary)); line = line.slice(boundary); }
        else { lines.push(line); line = ''; }
      }
      line += glyph;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export function chartMeasure(fontSize: number, fontFamily = 'Inter, system-ui, sans-serif'): ChartTextMeasure {
  if (typeof document !== 'undefined') {
    const context = document.createElement('canvas').getContext('2d');
    if (context) { context.font = `400 ${fontSize}px ${fontFamily}`; return text => context.measureText(text).width + (text ? 1 : 0); }
  }
  return text => Array.from(text).reduce((width, glyph) => width + (/\s/u.test(glyph) ? .3 : /[ilI.,'!|]/u.test(glyph) ? .3 : /[MW@]/u.test(glyph) ? .9 : /[^\x00-\xff]/u.test(glyph) ? 1 : .6), 0) * fontSize;
}
