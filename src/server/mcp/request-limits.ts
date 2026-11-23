/** Generous per-request abuse bounds, not an account call-rate quota. */
export const MCP_MAX_BODY_BYTES = 15 * 1024 * 1024;
export const MCP_MAX_BATCH_MESSAGES = 100;
export const MCP_MAX_INPUT_ELEMENTS = 1_500_000;
export const MCP_MAX_INPUT_DEPTH = 128;

/** Inspect JSON iteratively before SDK/Zod validation can amplify invalid input. */
export function mcpRequestLimit(body: unknown): string | undefined {
  if (Array.isArray(body) && body.length > MCP_MAX_BATCH_MESSAGES)
    return 'MCP batches may contain at most 100 messages; send additional requests separately.';
  const stack: { value: unknown; depth: number }[] = [{ value: body, depth: 0 }];
  let elements = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (value === null || typeof value !== 'object') continue;
    if (depth > MCP_MAX_INPUT_DEPTH) return 'MCP request nesting exceeds 128 levels.';
    const keys = Object.keys(value);
    elements += keys.length;
    if (elements > MCP_MAX_INPUT_ELEMENTS)
      return 'MCP request exceeds 1500000 input elements; split the data into separate calls.';
    for (const key of keys) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== null && typeof child === 'object') stack.push({ value: child, depth: depth + 1 });
    }
  }
  return undefined;
}
