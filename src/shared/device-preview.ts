import { z } from 'zod';
import { extendedSchemas } from './extended-templates.js';
/** CSS viewport presets, not hardware pixels or a claim to emulate a device engine. */
export const DEVICE_VIEWPORTS = {
  'small-phone': { name: 'Small phone', width: 360, height: 780 },
  'iphone': { name: 'iPhone-class portrait', width: 390, height: 844 },
  'pixel': { name: 'Pixel / Android large phone', width: 412, height: 915 },
  'galaxy': { name: 'Galaxy-class portrait', width: 384, height: 832 },
  'tablet': { name: 'Tablet portrait', width: 768, height: 1024 },
  'laptop': { name: 'Laptop', width: 1366, height: 768 },
  'desktop': { name: 'Desktop monitor', width: 1920, height: 1080 },
} as const;
const viewport=z.union([z.enum(['small-phone','iphone','pixel','galaxy','tablet','laptop','desktop']),z.object({name:z.string().min(1).max(80),width:z.number().int().min(240).max(3840),height:z.number().int().min(240).max(2160)}).strict()]);
export const devicePreviewDataSchema=extendedSchemas.html.extend({gridSize:z.enum(['standard','compact']).default('standard').describe('Preview-only frame scale and spacing; compact fits more CSS viewports without changing their internal dimensions.'),viewports:z.array(viewport).min(1).max(8).default(['small-phone','iphone','tablet','laptop'])}).describe('Static HTML/CSS rendered in independent CSS viewports, not email-client or device-engine emulation. Named presets are representative CSS dimensions; use custom name/width/height for an exact target.');
export type DevicePreviewData=z.infer<typeof devicePreviewDataSchema>;
export function staticPreviewDocument(html:string,css='') {return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;font-family:system-ui;background:#151515;color:#fafafa}*{box-sizing:border-box}${css.replace(/<\/style/gi,'')}</style></head><body>${html}</body></html>`;}
