export interface ImageClipRect { left: number; right: number; top: number; bottom: number }

/** A cropped image's layout box extends beyond the pixels the user can see.
 * Hit-testing and projected annotations must respect every local image mask. */
export function visibleImageRect(image: HTMLImageElement): ImageClipRect | undefined {
  const box = image.getBoundingClientRect();
  const rect: ImageClipRect = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  for (const selector of ['.image-frame', '.image-crop']) {
    const mask = image.closest(selector);
    if (!mask) continue;
    const clip = mask.getBoundingClientRect();
    rect.left = Math.max(rect.left, clip.left); rect.right = Math.min(rect.right, clip.right);
    rect.top = Math.max(rect.top, clip.top); rect.bottom = Math.min(rect.bottom, clip.bottom);
  }
  return Object.values(rect).every(Number.isFinite) && rect.right > rect.left && rect.bottom > rect.top ? rect : undefined;
}

export function insideImageRect(rect: ImageClipRect | undefined, point: { x: number; y: number }): boolean {
  return Boolean(rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
}
