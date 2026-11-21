import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateView } from '../../src/shared/view-schemas';
import { Renderer } from '../../src/client/renderers/Renderer';
import { monthWeeks } from '../../src/client/renderers/Time';
import { scheduleIndex } from '../../src/client/renderers/Time';
import { scheduleMonths } from '../../src/client/renderers/Time';
import { draftMarks } from '../../src/client/renderers/Drafting';
import { sameConfig } from '../../src/client/hooks';
import { coverageSlots } from '../../src/shared/roster';
import { rosterDataSchema } from '../../src/shared/roster';
import { rosterMonths } from '../../src/shared/roster';
import { rosterTotals } from '../../src/shared/roster';
import { browserKind } from '../../src/shared/devices-view';
import { deviceKind } from '../../src/shared/devices-view';

describe("device coverage 1", () => {


const html = (view: unknown) => renderToStaticMarkup(<Renderer view={validateView(view)} />);
const schedule = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, template: 'schedule', ...extra, data: { timeZone: 'UTC', events: [], ...data } });
const roster = { mode: 'individual', start: '2026-11-02', end: '2026-11-15', person: 'Supplied nurse',
  shifts: [{ id: 'day', label: 'Day shift', code: 'D', segment: 'morning' }, { id: 'night', label: 'Night shift', code: 'W14', segment: 'night' }, { id: 'leave', label: 'Vacation', code: 'F' }],
  assignments: [{ date: '2026-11-02', shift: 'day' }, { date: '2026-11-03', shift: 'night' }, { date: '2026-11-04', shift: 'leave' }] };

describe("device contracts", () => {

  it('shows devices with type, browser, online state and shared-session colours', () => {
    expect(deviceKind({ device: 'iPhone' })).toBe('phone'); expect(deviceKind({ device: 'TV' })).toBe('tv'); expect(deviceKind({ device: 'Mac', name: 'MacBook Air' })).toBe('laptop'); expect(browserKind('Microsoft Edge')).toBe('edge');
    const out = html({ version: 1, template: 'devices', data: { devices: [{ name: 'Office laptop', device: 'Mac', browser: 'Safari', connected: true, windows: [{ name: 'Main', connected: true, sessionId: 's1', sessionName: 'Planning' }, { name: 'Second', connected: false, sessionId: 's1', sessionName: 'Planning' }] }] } });
    expect(out).toContain('Office laptop'); expect(out).toContain('Online'); expect(out).toContain('is-shared'); expect(out).toContain('Planning');
  });});
});
