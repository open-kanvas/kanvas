import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import Ajv from 'ajv/dist/2020.js';
import { validateView } from '../../src/shared/view-schemas.js';

describe('reviewed Zod 4.6 compatibility and early rejection', () => {
  it('materializes safeParse error maps lazily once, while parse throws immediately', () => {
    let calls = 0;
    const schema = z.string({ error: () => { calls++; return 'Expected text'; } });
    const result = schema.safeParse(42);
    expect(result.success).toBe(false);
    expect(calls).toBe(0);
    if (result.success) throw new Error('Expected rejection');
    expect(result.error.issues[0].message).toBe('Expected text');
    expect(result.error.issues[0].message).toBe('Expected text');
    expect(calls).toBe(1);
    expect(() => schema.parse(42)).toThrow('Expected text');
    expect(calls).toBe(2);
  });

  it.each(['array', 'set', 'map'] as const)('rejects over-cap %s without parsing its elements', kind => {
    let visits = 0;
    const element = z.string().superRefine(() => { visits++; });
    const schema = kind === 'array' ? z.array(element).max(2) : kind === 'set' ? z.set(element).max(2) : z.map(element, element).max(2);
    const input = kind === 'array' ? ['a', 'b', 'c'] : kind === 'set' ? new Set(['a', 'b', 'c']) : new Map([['a', 'a'], ['b', 'b'], ['c', 'c']]);
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected rejection');
    expect(result.error.issues[0].code).toBe('too_big');
    expect(visits).toBe(0);
    const valid = kind === 'array' ? ['a', 'b'] : kind === 'set' ? new Set(['a', 'b']) : new Map([['a', 'a'], ['b', 'b']]);
    expect(schema.safeParse(valid).success).toBe(true);
    expect(visits).toBeGreaterThan(0);
  });

  it('keeps chained JSON Schema bounds conjunctive and consistent with runtime', () => {
    const schema = z.object({ hour: z.number().min(0).max(23).int(), divisible: z.number().multipleOf(2).multipleOf(3) });
    const emitted = z.toJSONSchema(schema, { io: 'input' });
    const check = new Ajv({ strict: false }).compile(emitted);
    for (const candidate of [{ hour: 12, divisible: 6 }, { hour: 24, divisible: 6 }, { hour: -1, divisible: 6 }, { hour: 12, divisible: 4 }, { hour: 1.5, divisible: 6 }]) {
      expect(check(candidate)).toBe(schema.safeParse(candidate).success);
    }
    expect(emitted.properties?.hour).toMatchObject({ minimum: 0, maximum: 23, type: 'integer' });
    const impossible = z.string().min(8).length(5);
    expect(z.toJSONSchema(impossible)).toMatchObject({ minLength: 8, maxLength: 5 });
  });

  it('retains valid emoji while rejecting component-only strings and enum reverse mappings', () => {
    for (const text of ['😀', '1️⃣', '🇳🇴', '👩‍💻']) expect(z.emoji().safeParse(text).success).toBe(true);
    for (const text of ['123', '#', '*', '‍', '️', '🏽']) expect(z.emoji().safeParse(text).success).toBe(false);
    enum Level { Low, High }
    expect(z.enum(Level).options).toEqual([0, 1]);
    expect(z.enum(Level).safeParse('Low').success).toBe(false);
  });

  it('preserves email acceptance and emits a portable pattern without lookaheads', () => {
    const schema = z.string().trim().toLowerCase().email().max(254);
    expect(schema.parse('  Person+tag@Example.COM ')).toBe('person+tag@example.com');
    for (const text of ['.a@example.com', 'a..b@example.com', 'a.@example.com', 'a@example', 'a@example.com\nBcc:x@y.org']) expect(schema.safeParse(text).success).toBe(false);
    const pattern = z.toJSONSchema(z.email()).pattern!;
    expect(pattern).not.toContain('(?=');
    expect(pattern).not.toContain('(?!');
    expect(new RegExp(pattern).test('person+tag@example.com')).toBe(true);
  });

  it('validates multi-megabyte composed base64 without regex stack overflow and preserves padding checks', () => {
    const schema = z.object({ value: z.base64() });
    expect(schema.safeParse({ value: 'YWJj'.repeat(524288) }).success).toBe(true);
    for (const value of ['Y', 'YW=', 'Y===', 'YW Jj', 'YWJj=']) expect(schema.safeParse({ value }).success).toBe(false);
    expect(z.base64url().safeParse('SGVsbG8').success).toBe(true);
    expect(z.base64url().safeParse('a').success).toBe(false);
    expect(z.toJSONSchema(z.base64()).pattern).toBeTruthy();
  });

  it('continues parsing recursive schemas repeatedly and exposes useful application errors', () => {
    const node: z.ZodType<{ name: string; children: unknown[] }> = z.object({ name: z.string(), children: z.array(z.lazy(() => node)) });
    for (let i = 0; i < 50; i++) expect(node.parse({ name: 'root', children: [{ name: 'leaf', children: [] }] }).name).toBe('root');
    expect(() => validateView({ version: 1, template: 'fact', data: { text: 42 } })).toThrow();
    expect(validateView({ version: 1, template: 'fact', data: { text: 'Preserved' } }).data.text).toBe('Preserved');
  });
});
