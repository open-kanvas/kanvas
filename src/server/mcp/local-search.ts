/** Dependency-free concept-aware retrieval. No model, network, account data,
 * or query history. Scores are ranking signals, not semantic probabilities. */
export interface SearchDocument { id: string; title: string; summary: string; keywords?: string; text?: string; /** Curated everyday phrasings this entry must answer first. Matched word for word, including common words. */ priority?: string }
const stop = new Set('a an the this that my your our their to of for on in at with from and or by is are be it its as me i we you how can could please want need use using do does did something only all currently'.split(' '));
const concepts = [
  'screen display monitor television tv', 'browser window tab receiver',
  'show publish display present render put', 'read inspect get retrieve fetch see look',
  'create new add make start begin', 'remove delete erase discard purge',
  'stop halt end cease cancel disable revoke', 'pause suspend freeze hold', 'resume continue unpause',
  'update edit change modify revise replace', 'restore recover recall back undo earlier previous retained history',
  'save retain remember bookmark pin', 'import ingest upload spreadsheet excel csv dataset', 'share invite invitation guest member access permission',
  'team organization group colleague coworker', 'slides slide deck presentation keynote powerpoint',
  'autoplay automatic automatically timed play advance slideshow',
  'checklist tasks todo tick checked checkboxes', 'draft writing prose text document letter',
  'bigger larger enlarge magnify zoom scale', 'smaller shrink reduce zoom', 'scroll page navigate move position',
  'capture screenshot photo image snapshot actual consent browser',
  'spreadsheet excel csv rows dataset import data table', 'asset upload attachment file image bytes media',
  'refresh polling poll feed monitoring public source health uptime',
  'countdown stopwatch timer clock time', 'chart graph plot visualization numbers',
  'map geography location coordinates route nearby', 'feedback report bug issue problem error',
  'session topic workspace conversation', 'connected online live active', 'watch watching viewer audience participant people', 'revoke logout disconnect forbid block unpair deny',
  'receipt status delivery applied painted acknowledgement', 'preferences settings appearance theme font typography',
];
function stem(token: string): string {
  return token.length > 5 ? token.replace(/(?:ing|ers|es|s)$/, '') : token.length > 3 ? token.replace(/s$/, '') : token;
}
/** Every word, common ones included: for curated phrasings such as "how do I use this". */
export function rawTokens(text: string): string[] {
  return [...new Set((text.toLowerCase().normalize('NFKD').match(/[a-z0-9]+/g) ?? []).filter(t => t !== 'kanvas').map(stem))].slice(0, 256);
}
export function tokens(text: string): string[] {
  return [...new Set((text.toLowerCase().normalize('NFKD').match(/[a-z0-9]+/g) ?? []).filter(t => !stop.has(t) && t !== 'kanvas').map(stem))].slice(0, 2048);
}
const groups = concepts.map(group => new Set(tokens(group)));
const conceptTerms = new Map<string, Set<string>>();
for (const group of groups) for (const term of group) conceptTerms.set(term, new Set([...(conceptTerms.get(term) ?? []), ...group]));
const related = (a: string, b: string): boolean => conceptTerms.get(a)?.has(b) ?? false;
function typo(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diffs = [...a].map((c, i) => c !== b[i] ? i : -1).filter(i => i >= 0);
    return diffs.length === 1 || (diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]]);
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0; while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}
export class LocalSearch<T extends SearchDocument> {
  private rows: { document: T; fields: { terms: string[]; weight: number }[]; all: Set<string> }[];
  private frequency = new Map<string, number>();
  constructor(documents: readonly T[]) {
    this.rows = documents.map(document => {
      const fields = [{ terms: tokens(document.id), weight: 10 }, { terms: tokens(document.title), weight: 7 }, { terms: tokens(document.summary), weight: 4 }, { terms: tokens(document.keywords ?? ''), weight: 5 }, { terms: tokens(document.text ?? ''), weight: 1 }, ...(document.priority ? [{ terms: rawTokens(document.priority), weight: 12 }] : [])];
      const all = new Set(fields.flatMap(f => f.terms));
      for (const term of all) this.frequency.set(term, (this.frequency.get(term) ?? 0) + 1);
      return { document, fields, all };
    });
  }
  search(query: string): { document: T; score: number }[] {
    const normalized = query.trim().toLowerCase(), meaningful = tokens(query).slice(0, 40);
    // A question made only of common words ("how do I use this") is still a question.
    const terms = meaningful.length ? meaningful : rawTokens(query).slice(0, 40);
    const exact = this.rows.find(row => row.document.id.toLowerCase() === normalized);
    if (exact) return [{ document: exact.document, score: 1000 }];
    if (!terms.length || /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+){2,}$/.test(normalized)) return [];
    const similarities = new Map<string, number>();
    const results = this.rows.map(({ document, fields }) => {
      let score = 0, matched = 0;
      for (const term of terms) {
        let best = 0;
        for (const field of fields) for (const candidate of field.terms) {
          const key = `${term}:${candidate}`;
          let similarity = similarities.get(key);
          if (similarity === undefined) { similarity = term === candidate ? 1 : typo(term, candidate) ? .72 : related(term, candidate) ? .52 : 0; similarities.set(key, similarity); }
          if (!similarity) continue;
          const idf = 1 + Math.log(1 + this.rows.length / (1 + (this.frequency.get(candidate) ?? 0)));
          best = Math.max(best, field.weight * similarity * idf);
        }
        if (best) matched++;
        score += best;
      }
      // Prefer a complete concept match over one rare token in a long query.
      score *= Math.pow(matched / terms.length, 1.5);
      return { document, score: Math.round(score * 1000) / 1000 };
    });
    return results.filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id, 'en'));
  }
}
