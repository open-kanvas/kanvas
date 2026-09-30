import type { MonitoringHealth } from '../shared/monitoring';

/** Cached healthy state must not imply a live source after a disconnected or overdue check. */
export function sourceStatusText(health: MonitoringHealth | undefined, clock: number, connected: boolean): string | null {
  if (!health) return null;
  if (health.status === 'stopped' || Date.parse(health.expiresAt) <= clock) return 'Source updates stopped';
  if (!health.lastSuccessAt || health.status === 'starting') return 'Waiting for the first source check · previous content is unchanged';
  if (health.status === 'stale') return 'Source update failed · showing the last valid result';
  if (!connected) return 'Source status unconfirmed · reconnecting';
  if (health.nextPollAt && Date.parse(health.nextPollAt) + 15_000 < clock) return 'Source check overdue · showing the last valid result';
  return null;
}
