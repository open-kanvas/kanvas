import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { draftingDataSchema, isDraftTextBoundary } from '../../src/shared/drafting';
import { validateView } from '../../src/shared/view-schemas';
import { DraftingRenderer, draftAtEnd, draftTextEdit } from '../../src/client/renderers/Drafting';
import { Renderer } from '../../src/client/renderers/Renderer';

describe('drafting reading and review surface', () => {
  it('renders exact draft text, purpose and supplied status with no recording or external-send controls', () => {
    const text = 'Keep  these spaces, 👋 Unicode & <script>inert</script>.\n\nA second passage.';
    const view = validateView({ version: 1, template: 'drafting', data: { text, purpose: 'Email draft', status: 'reviewing' } });
    const html = renderToStaticMarkup(<Renderer view={view} actionable revision={7} onRespond={async () => {}} />);
    expect(html).toContain('template-drafting'); expect(html).toContain('drafting-source');
    expect(html).toContain('Keep  these spaces, 👋 Unicode &amp; &lt;script&gt;inert&lt;/script&gt;.\n\n');
    expect(html).toContain('A second passage.'); expect(html).toContain('Email draft'); expect(html).toContain('Reviewing');
    expect(html).toContain('role="button"'); expect(html).toContain('aria-live="off"');
    expect(html).not.toMatch(/<script>|<textarea|contentEditable|Start recording|Listening|Send email|Accept suggestion|Reject suggestion/);
  });

  it('shows suggestions inline (struck-through original, escaped replacement, reason) without changing the source', () => {
    const text = 'Keep the original sentence.';
    const view = validateView({ version: 1, template: 'drafting', data: { text, status: 'reviewing', suggestions: [{ id: 'word', start: 9, end: 17, replacement: '<img src=x onerror=bad()>', reason: 'Review this wording' }], focus: { start: 9, end: 17, label: 'Look at this word' } } });
    const html = renderToStaticMarkup(<DraftingRenderer view={view} actionable revision={2} onRespond={async () => {}} />);
    expect(html).toContain('Keep the '); expect(html).toContain('<del class="drafting-del">original</del>'); expect(html).toContain(' sentence.');
    expect(html).toContain('data-suggestion-id="word"'); expect(html).toContain('<ins class="drafting-ins" data-draft-extra="">&lt;img src=x onerror=bad()&gt;</ins>');
    expect(html).toContain('Review this wording'); expect(html).toContain('1 suggested edit'); expect(html).toContain('Look at this word');
    expect(html).not.toContain('<img'); expect(html).not.toContain('drafting-suggestions'); expect(html).not.toContain('Review this passage');
    expect(view.data.text).toBe(text);
  });

  it('does not expose feedback controls to view-only or preview surfaces', () => {
    const view = validateView({ version: 1, template: 'drafting', data: { text: 'A note.', suggestions: [{ id: 'edit', start: 0, end: 1, replacement: 'The' }] } });
    for (const props of [{ actionable: false }, { actionable: true, preview: true }]) {
      const html = renderToStaticMarkup(<DraftingRenderer {...props} view={view} revision={1} onRespond={async () => {}} />);
      expect(html).not.toContain('role="button"'); expect(html).not.toContain('Review this passage'); expect(html).not.toContain('Review selected text');
      expect(html).toContain('View only.');
    }
    expect(renderToStaticMarkup(<DraftingRenderer view={{ version: 1, template: 'drafting', data: draftingDataSchema.parse({ text: '' }) }} />)).toContain('Your draft will appear here.');
  });

  it('uses character-safe minimal edits that retain unchanged native text nodes', () => {
    for (const [before, after] of [
      ['Original 👋 source.', 'Original 👋 source. New  text.'],
      ['Keep 😃 this ending', 'Keep 😄 this ending'],
      ['A source sentence', 'A revised source sentence'],
      ['A source sentence', 'A sentence'],
      ['👋', ''], ['', '👋'], ['Same source', 'Same source'],
      ['𐀀 tail', '𐐀 tail'], ['prefix 👋', 'prefix 💬'],
    ]) {
      const edit = draftTextEdit(before, after);
      expect(before.slice(0, edit.start) + edit.insert + before.slice(edit.start + edit.deleteCount)).toBe(after);
      expect(isDraftTextBoundary(before, edit.start)).toBe(true);
      expect(isDraftTextBoundary(before, edit.start + edit.deleteCount)).toBe(true);
    }
    expect(draftTextEdit('Keep 👋 this.', 'Keep 👋 this. Appended')).toEqual({ start: 'Keep 👋 this.'.length, deleteCount: 0, insert: ' Appended' });
  });

  it('recognizes the end of the actual scroll region, including short text and browser rounding', () => {
    expect(draftAtEnd({ scrollHeight: 1600, clientHeight: 500, scrollTop: 1100 })).toBe(true);
    expect(draftAtEnd({ scrollHeight: 1600, clientHeight: 500, scrollTop: 1099.5 })).toBe(true);
    expect(draftAtEnd({ scrollHeight: 1600, clientHeight: 500, scrollTop: 600 })).toBe(false);
    expect(draftAtEnd({ scrollHeight: 500, clientHeight: 500, scrollTop: 0 })).toBe(true);
  });
});
