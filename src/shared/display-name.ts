/** The label a person is shown by on a display. An email address is an
 * account identifier, never an on-screen label: on a TV, in a meeting room or
 * a shop it is a small privacy leak. A missing or email-shaped display name
 * falls back to the part before the @. */
const emailLike = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
export function displayNameUnset(user: { displayName?: string | null; username?: string | null; email?: string | null }): boolean {
  const name = user.displayName?.trim();
  return !name || emailLike(name) || name === user.username || name === user.email;
}
export function personLabel(user: { displayName?: string | null; username?: string | null; email?: string | null } | undefined | null, fallback = 'Someone'): string {
  if (!user) return fallback;
  const name = user.displayName?.trim();
  if (name && !emailLike(name)) return name;
  const source = (name && emailLike(name) ? name : user.email ?? user.username ?? '').trim();
  const local = emailLike(source) ? source.slice(0, source.indexOf('@')) : source;
  return local || fallback;
}
/** Strip an address from any label that is about to be painted or returned as a name. */
export const safeLabel = (value: string | undefined | null, fallback = 'Someone'): string => {
  const text = value?.trim();
  if (!text) return fallback;
  return emailLike(text) ? text.slice(0, text.indexOf('@')) || fallback : text;
};
