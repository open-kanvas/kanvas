import { passiveSvg } from './passive-svg.js';
import { RenderingError } from './errors.js';

export const MEDIA_LIMITS = { bytes: 10 * 1024 * 1024, pixels: 64_000_000, dimension: 20_000 } as const;
export const ALLOWED_MEDIA_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'application/pdf'] as const;
export interface MediaInput { name: string; mimeType: string; base64: string }
export interface ValidatedMedia {
  name: string; mimeType: typeof ALLOWED_MEDIA_TYPES[number]; bytes: Buffer; size: number;
  kind: 'image'|'video'|'document'; disposition: 'inline'|'attachment'; width?: number; height?: number;
}

function reject(message: string, code = 'INVALID_MEDIA'): never { throw new RenderingError(code, message); }
function ascii(bytes: Buffer, start: number, end: number): string { return bytes.toString('ascii', start, end); }
function dimensions(width: number, height: number): { width: number; height: number } {
  if (!width || !height || width > MEDIA_LIMITS.dimension || height > MEDIA_LIMITS.dimension || width * height > MEDIA_LIMITS.pixels) reject('Image dimensions exceed the supported decode budget.', 'MEDIA_TOO_LARGE');
  return { width, height };
}
function jpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  let position = 2;
  while (position + 3 < bytes.length) {
    if (bytes[position] !== 0xff) return undefined;
    while (bytes[position] === 0xff) position++;
    const marker = bytes[position++];
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (position + 2 > bytes.length) return undefined;
    const length = bytes.readUInt16BE(position);
    if (length < 2 || position + length > bytes.length) return undefined;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) return undefined;
      return dimensions(bytes.readUInt16BE(position + 5), bytes.readUInt16BE(position + 3));
    }
    position += length;
  }
  return undefined;
}

/** SVG is reconstructed as passive shapes/text. PDF is download-only. No HTML or scripts. */
export function validateMedia(input: MediaInput): ValidatedMedia {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || /[\u0000-\u001f\u007f/\\]/.test(input.name)) reject('Media name must be a short filename, without paths or control characters.','INVALID_MEDIA_NAME');
  if (typeof input.mimeType !== 'string') reject('Media type is required.');
  const mimeType = input.mimeType.toLowerCase().trim();
  if (!ALLOWED_MEDIA_TYPES.includes(mimeType as typeof ALLOWED_MEDIA_TYPES[number])) reject('Supported assets are images (including passive SVG), MP4/WebM video, and PDF downloads. HTML is not accepted.', 'UNSUPPORTED_MEDIA_TYPE');
  if (typeof input.base64 !== 'string' || !input.base64.length || input.base64.length > 4 * Math.ceil(MEDIA_LIMITS.bytes / 3)) reject('Media exceeds the 10 MiB limit or is empty.', 'MEDIA_TOO_LARGE');
  // Linear checks (not a repeated-group regexp, which overflows V8's stack on large media).
  const padding = input.base64.endsWith('==') ? 2 : input.base64.endsWith('=') ? 1 : 0;
  const firstPadding = input.base64.indexOf('=');
  if (input.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(input.base64) || (firstPadding !== -1 && firstPadding !== input.base64.length - padding)) reject('Media requires canonical base64, without a data URL prefix or whitespace.','INVALID_MEDIA_BASE64');
  if (input.base64.length / 4 * 3 - padding > MEDIA_LIMITS.bytes) reject('Media exceeds the 10 MiB limit.', 'MEDIA_TOO_LARGE');
  let bytes = Buffer.from(input.base64, 'base64');
  if (!bytes.length || bytes.length > MEDIA_LIMITS.bytes || bytes.toString('base64') !== input.base64) reject('Media base64 or decoded size is invalid.','INVALID_MEDIA_BASE64');
  let valid = false, size: {width:number;height:number} | undefined;
  switch (mimeType) {
    case 'image/svg+xml': { const svg=passiveSvg(bytes);bytes=svg.bytes;size=dimensions(svg.width,svg.height);valid=true;break; }
    case 'image/png':
      valid = bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.readUInt32BE(8) === 13 && ascii(bytes, 12, 16) === 'IHDR' && ascii(bytes, bytes.length - 8, bytes.length - 4) === 'IEND';
      if (valid) size = dimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
      break;
    case 'image/jpeg':
      valid = bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
      if (valid) { size = jpegDimensions(bytes); valid = Boolean(size); }
      break;
    case 'image/gif':
      valid = bytes.length >= 14 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6)) && bytes[bytes.length - 1] === 0x3b;
      if (valid) size = dimensions(bytes.readUInt16LE(6), bytes.readUInt16LE(8));
      break;
    case 'image/webp':
      valid = bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length && ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(bytes, 12, 16));
      if (valid && ascii(bytes, 12, 16) === 'VP8X') size = dimensions(bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1);
      else if (valid && ascii(bytes, 12, 16) === 'VP8L' && bytes[20] === 0x2f) {
        const bits = bytes.readUInt32LE(21); size = dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      } else if (valid && ascii(bytes, 12, 16) === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) size = dimensions(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff);
      valid &&= Boolean(size);
      break;
    case 'image/avif':
    case 'video/mp4': {
      valid = bytes.length >= 24 && ascii(bytes, 4, 8) === 'ftyp';
      if (valid) {
        const length = bytes.readUInt32BE(0);
        valid = length >= 16 && length <= Math.min(bytes.length, 1024) && length % 4 === 0;
        const brands = [ascii(bytes, 8, 12)];
        if (valid) for (let i = 16; i < length; i += 4) brands.push(ascii(bytes, i, i + 4));
        valid &&= mimeType === 'image/avif' ? brands.some((brand) => ['avif', 'avis'].includes(brand)) : brands.some((brand) => ['isom', 'iso2', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V '].includes(brand)) && !brands.some((brand) => ['avif', 'avis', 'heic', 'mif1'].includes(brand));
        if (valid && mimeType === 'image/avif') {
          const ispe = bytes.indexOf(Buffer.from('ispe'), length);
          valid = ispe >= 4 && ispe + 16 <= bytes.length && bytes.readUInt32BE(ispe - 4) >= 20;
          if (valid) size = dimensions(bytes.readUInt32BE(ispe + 8), bytes.readUInt32BE(ispe + 12));
        }
      }
      break;
    }
    case 'video/webm':
      valid = bytes.length >= 16 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && bytes.subarray(4, Math.min(bytes.length, 256)).includes(Buffer.from('webm'));
      break;
    case 'application/pdf':
      valid = bytes.length >= 16 && /^%PDF-[12]\.\d/.test(ascii(bytes, 0, 8)) && bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from('%%EOF'));
      break;
  }
  if (!valid) reject('Media bytes do not match the declared MIME type.');
  return { name: input.name, mimeType: mimeType as ValidatedMedia['mimeType'], bytes, size: bytes.length, kind: mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'document', disposition: mimeType === 'application/pdf' ? 'attachment' : 'inline', ...size };
}
