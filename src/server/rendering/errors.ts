/** Deliberately public-safe errors: never include source content, transport payloads or credentials. */
export interface RenderingIssue {
  /** Schema-owned names only; arbitrary record keys and supplied values are not included. */
  path: string;
  code: string;
  rule?: string;
}
export class RenderingError extends Error {
  /** Completed interpreter diagnostics; no source content. */
  metrics?: Record<string, string | number>;
  constructor(public readonly code: string, message: string, public readonly retryable = false, public readonly issues?: readonly RenderingIssue[]) {
    super(message);
    this.name = 'RenderingError';
  }
}

export function safeRenderingError(error: unknown): RenderingError {
  return error instanceof RenderingError ? error : new RenderingError('INVALID_CONTENT', 'Content could not be validated for display.');
}
