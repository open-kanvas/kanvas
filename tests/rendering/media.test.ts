import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MEDIA_LIMITS, validateMedia } from '../../src/server/rendering/media.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
describe('uploaded media boundary', () => {
  it.each([['jpg', 'image/jpeg'], ['webp', 'image/webp'], ['gif', 'image/gif'], ['avif', 'image/avif'], ['mp4', 'video/mp4'], ['webm', 'video/webm']])('accepts a real synthetic %s media file', (extension, mimeType) => {
    const bytes = readFileSync(new URL(`./fixtures/sample.${extension}`, import.meta.url));
    const result = validateMedia({ name: `sample.${extension}`, mimeType, base64: bytes.toString('base64') });
    expect(result.size).toBe(bytes.length); expect(result.mimeType).toBe(mimeType);
    if (mimeType.startsWith('image/')) expect(result).toMatchObject({ width: 16, height: 16 });
  });
  it('accepts a bounded raster image with matching signature and dimensions', () => {
    const result = validateMedia({ name: 'pixel.png', mimeType: 'image/png', base64: png });
    expect(result).toMatchObject({ mimeType: 'image/png', width: 1, height: 1, kind: 'image', disposition: 'inline' });
    expect(result.bytes.toString('base64')).toBe(png);
  });
  it('makes PDF documents attachments instead of active same-origin embeds', () => {
    const base64 = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n').toString('base64');
    expect(validateMedia({ name: 'document.pdf', mimeType: 'application/pdf', base64 })).toMatchObject({ kind: 'document', disposition: 'attachment' });
  });
  it.each(['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/javascript'])('rejects active media type %s', (mimeType) => {
    expect(() => validateMedia({ name: 'active', mimeType, base64: Buffer.from('<svg onload="run()"/>').toString('base64') })).toThrow(/SVG|HTML/);
  });
  it('rejects MIME spoofing, data URLs, invalid and noncanonical base64, paths and empty assets', () => {
    expect(() => validateMedia({ name: 'spoof.png', mimeType: 'image/png', base64: Buffer.from('<html>not an image</html>').toString('base64') })).toThrow(/do not match/);
    expect(() => validateMedia({ name: 'wrong.jpg', mimeType: 'image/jpeg', base64: png })).toThrow(/do not match/);
    for (const base64 of [`data:image/png;base64,${png}`, `${png}\n`, '!!!!', 'Zg===', 'Zh==', '']) expect(() => validateMedia({ name: 'bad.png', mimeType: 'image/png', base64 })).toThrow();
    expect(() => validateMedia({ name: '../outside.png', mimeType: 'image/png', base64: png })).toThrow(/without paths/);
  });
  it('enforces decoded byte and raster dimension budgets', () => {
    const huge = Buffer.alloc(MEDIA_LIMITS.bytes + 1).toString('base64');
    expect(() => validateMedia({ name: 'huge.png', mimeType: 'image/png', base64: huge })).toThrow(/10 MiB|decoded size/);
    const bomb = Buffer.from(png, 'base64'); bomb.writeUInt32BE(100_000, 16);
    expect(() => validateMedia({ name: 'bomb.png', mimeType: 'image/png', base64: bomb.toString('base64') })).toThrow(/decode budget/);
  });
});
