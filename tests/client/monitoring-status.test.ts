import { describe, expect, it } from 'vitest';
import { sourceStatusText } from '../../src/client/monitoring-status';
import type { MonitoringHealth } from '../../src/shared/monitoring';
const time = Date.parse('2026-09-14T12:00:00Z');
const health: MonitoringHealth = { jobId:'j', status:'healthy', lastSuccessAt:new Date(time-1000).toISOString(), nextPollAt:new Date(time+30_000).toISOString(), expiresAt:new Date(time+60_000).toISOString(), consecutiveFailures:0 };
describe('source freshness cues', () => {
  it('does not add chrome to a fresh source result', () => { expect(sourceStatusText(health,time,true)).toBeNull(); });
  it('does not trust cached healthy state when the viewer disconnects', () => { expect(sourceStatusText(health,time,false)).toContain('unconfirmed'); });
  it('marks a missed check overdue without deleting the last valid content', () => { expect(sourceStatusText(health,time+46_000,true)).toContain('overdue'); });
  it('does not call unchanged prior content a successful first sample', () => { expect(sourceStatusText({...health,status:'starting',lastSuccessAt:undefined},time,true)).toContain('previous content is unchanged'); });
  it('shows expiry and failure even without a new server notification', () => { expect(sourceStatusText(health,time+61_000,true)).toContain('stopped'); expect(sourceStatusText({...health,status:'stale'},time,true)).toContain('failed'); });
});
