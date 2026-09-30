import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionsHome } from '../../src/client/SessionsHome';
import type { SessionRecord } from '../../src/shared/types';

const session = (id: string, name: string, extra: Partial<SessionRecord> = {}) => ({ id, name, ownerId: 'user', config: {} as SessionRecord['config'], configRevision: 0, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z', role: 'owner', ...extra }) as SessionRecord;

describe('account home (reported regression)', () => {
  it('lists open sessions newest first, offers a new session and the live screen, and folds ended sessions', () => {
    const html = renderToStaticMarkup(<SessionsHome onChoose={() => {}} onCreate={() => {}} sessions={[
      session('a', 'Planning'), session('b', 'Board', { updatedAt: '2026-09-25T10:00:00Z', role: 'editor' }), session('c', 'Archive', { endedAt: '2026-09-10T10:00:00Z' }),
    ]} />);
    expect(html.indexOf('Board')).toBeLessThan(html.indexOf('Planning'));
    expect(html).toContain('Your sessions'); expect(html).toContain('New session'); expect(html).toContain('href="/start"');
    expect(html).toContain('1 ended session'); expect(html).toContain('Editor');
  });
});
