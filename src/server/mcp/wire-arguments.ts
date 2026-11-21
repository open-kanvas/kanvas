import {canonicalToolDefinitions} from './canonical.js';
import {schemaTypes} from './schema-properties.js';
import {InputError} from '../input-errors.js';

const definitions = new Map(canonicalToolDefinitions().map(tool => [tool.name, tool.inputSchema.properties ?? {}]));
const MAX_ENCODED_ARGUMENT_BYTES = 5 * 1024 * 1024;

function decimal(value: string): string | undefined {
  if (value.length > 128) return undefined;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) return undefined;
  let digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent)) return undefined;
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
  return `${match[1]}${digits}e${exponent}`;
}

/** Compatibility for hosts using a cached/untyped parameter projection. Decode
 * one layer of JSON only where the selected canonical schema excludes text.
 * Never recurse into source text, infer consent, or change the REST contract. */
export function decodeWireArguments(canonicalName: string, raw: unknown): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return raw;
    const properties = definitions.get(canonicalName);
    if (!properties)
        return raw;
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => {
        const allowed = Object.hasOwn(properties, key) ? schemaTypes(properties[key]) : undefined;
        if (typeof value !== 'string' || !allowed || allowed.includes('string'))
            return [key, value];
        if (Buffer.byteLength(value) > MAX_ENCODED_ARGUMENT_BYTES)
            throw new InputError([{ path: key, problem: 'Encoded argument exceeds 5 MiB. Send a bounded native value or import the source separately.', maximum: MAX_ENCODED_ARGUMENT_BYTES, actual: Buffer.byteLength(value), unit: 'bytes' }]);
        let parsed: unknown;
        try {
            parsed = JSON.parse(value, (_key: string, child: unknown, context?: {
                source?: string;
            }) => {
                if (typeof child === 'number' && (!Number.isFinite(child) || (Number.isInteger(child) && !Number.isSafeInteger(child))
                    || (context?.source && decimal(context.source) !== decimal(String(child))))) {
                    throw new InputError([{ path: key, problem: "JSON contains a number that cannot be represented exactly. Send exact values as decimal strings or use kanvas_call with operationId:\"kanvas.dataset.import\" and arguments:{\u2026} with original json text." }]);
                }
                return child;
            });
        }
        catch (error) {
            if (error instanceof InputError)
                throw error;
            throw new InputError([{ path: key, problem: 'Expected a native structured value. This JSON-encoded argument could not be decoded. Send an object/array directly, or valid JSON with escaped paragraph newlines and quotes. Do not shorten or remove source fields to repair encoding.' }]);
        }
        const type = parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
        return [key, allowed.includes(type) || (type === 'number' && allowed.includes('integer')) ? parsed : value];
    }));
}
