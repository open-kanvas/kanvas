

import {z} from 'zod';

import type {Definition} from '../canonical.js';
import {id,name,record,source} from '../operation-fields.js';

/** import operation contracts. Domain services enforce current account, role and scope. */
export const importOperations: readonly Definition[] = [
{
        name: "kanvas.dataset.import", summary: "Import supplied CSV, JSON, or rows when preparing retained structured data for source-bound tables, charts, or numbers.",
        description: 'Import exactly one csv string, lossless json text, or rows array. Prefer json text or decimal strings when exact numeric lexemes matter. Limits: 2 MiB wire csv/json text, 20000 rows, 64 columns, column names 200 characters, cells 20000 characters; parsed dataset 5 MiB. Returns dataset ID and bounded preview for later source-bound table/chart/number submission. This is ordinary MCP data transfer, not automatic file access.',
        schema: z.strictObject({
            sessionId: id, name, csv: z.string().min(1).max(2 * 1024 * 1024).refine(value => Buffer.byteLength(value, 'utf8') <= 2 * 1024 * 1024).meta({ 'x-maxUtf8Bytes': 2 * 1024 * 1024, description: 'Original CSV text; maximum 2 MiB UTF-8 bytes as well as the character limit. Byte bound is enforced by the server.' }).optional(),
            json: z.string().min(1).max(2 * 1024 * 1024).refine(value => Buffer.byteLength(value, 'utf8') <= 2 * 1024 * 1024).meta({ 'x-maxUtf8Bytes': 2 * 1024 * 1024, description: 'Lossless original JSON text; maximum 2 MiB UTF-8 bytes as well as the character limit. Byte bound is enforced by the server.' }).optional(),
            rows: z.array(record).min(1).max(20000).optional(), source: source.optional(),
        }).refine(value => [value.csv, value.json, value.rows].filter(value => value !== undefined).length === 1),
        jsonSchemaExtras: { oneOf: ['csv', 'json', 'rows'].map(field => ({ required: [field], not: { anyOf: ['csv', 'json', 'rows'].filter(other => other !== field).map(other => ({ required: [other] })) } })) },
        domain: "import",
        requiredScope: "publish",
        discovery: {"group":"sources","hint":"Import exactly one of csv, json text, or rows. Pass the returned datasetId to a source-bound submission.","examples":[{"sessionId":"session-id","name":"Example measurements","rows":[{"label":"Example A","value":12}]}]},
        searchAliases: ["kanvas.dataset.import"]
    },
{
        name: "kanvas.asset.import", summary: "Import bounded base64 media bytes when transferring an actual file into a session's protected asset storage.",
        description: 'Ingest bounded media bytes as base64 with name and MIME type. The domain checks actual media and size; a filesystem path/URL is not a file transfer. Returned asset URLs remain browser-authenticated. Never pass publisher credentials in content or URLs.',
        schema: z.strictObject({ sessionId: id, name, mimeType: z.string().min(1).max(120), base64: z.string().min(4).max(8 * 1024 * 1024) }),
        domain: "import",
        requiredScope: "publish",
        discovery: {"group":"sources","hint":"Transfer actual base64 media bytes, not a filename or URL. This inert example is a complete 1×1 PNG.","examples":[{"sessionId":"session-id","name":"example-pixel.png","mimeType":"image/png","base64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII="}]},
        searchAliases: ["kanvas.asset.import"]
    },
{
        name: "kanvas.asset.export", summary: "Read authorized session asset bytes in bounded chunks when exporting an image or media file for attachment.", description: 'Export an authorized session asset/snapshot: base64, MIME, name, size, nextOffset. Decode each chunk (max32768 bytes), then concatenate bytes in offset order, not padded base64. URLs remain private; export grants no external sharing consent.', schema: z.strictObject({ sessionId: id, assetId: id, offset: z.number().int().nonnegative().max(10 * 1024 * 1024).default(0), length: z.number().int().min(1).max(32768).default(24576) }), readOnly: true,
        domain: "import",
        requiredScope: "read",
        discovery: {"group":"sources","hint":"Read authorized asset bytes in bounded base64 chunks for portable export. Decode then concatenate bytes in offset order.","examples":[{"sessionId":"session-id","assetId":"asset-id","offset":0,"length":24576}]},
        searchAliases: ["kanvas.asset.export"]
    }
];
