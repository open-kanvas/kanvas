/** Browser-side geometry/color observations, shared by the real-viewer gate and
 * the isolated actual-source diagnostic. No renderer geometry is reproduced. */
export function advancedChartLegibility(root: Element) {
  const box = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  };
  const rgba = (value: string) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!; context.fillStyle = value; context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  };
  const luminance = (value: number[]) => value.slice(0, 3).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const svg = root.querySelector('svg')!, bounds = box(svg);
  const ticks = [...svg.querySelectorAll('.advanced-axis text,.advanced-label')].map(element => ({ text: element.textContent, ...box(element) }));
  const bubbles = [...svg.querySelectorAll<SVGCircleElement>('circle[data-chart-size]')].map(element => {
    const rect = box(element), scale = Math.hypot(element.getScreenCTM()!.a, element.getScreenCTM()!.b), stroke = parseFloat(getComputedStyle(element).strokeWidth) * scale / 2;
    return { value: element.getAttribute('data-chart-size'), x: rect.x - stroke, y: rect.y - stroke, right: rect.right + stroke, bottom: rect.bottom + stroke, width: rect.width + stroke * 2, height: rect.height + stroke * 2 };
  });
  const collisions = bubbles.flatMap((bubble, index) => ticks.filter(tick => bubble.x < tick.right && bubble.right > tick.x && bubble.y < tick.bottom && bubble.bottom > tick.y).map(tick => ({ bubble: index, tick: tick.text })));
  const badges = [...root.querySelectorAll('.advanced-radar-key li>i')].map(element => {
    const style = getComputedStyle(element), ink = rgba(style.color), background = rgba(style.backgroundColor), light = luminance(ink), dark = luminance(background);
    return { label: element.textContent, font: parseFloat(style.fontSize), color: style.color, background: style.backgroundColor, contrast: (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05) };
  });
  const scale = root.querySelector('.advanced-color-scale i'), readout = root.querySelector('.advanced-chart-readout');
  return {
    bubbles, collisions, badges,
    outside: bubbles.filter(bubble => bubble.x < bounds.x - .5 || bubble.y < bounds.y - .5 || bubble.right > bounds.right + .5 || bubble.bottom > bounds.bottom + .5),
    scale: scale ? { ...box(scale), backgroundImage: getComputedStyle(scale).backgroundImage } : null,
    readout: readout ? { color: getComputedStyle(readout).backgroundColor, alpha: rgba(getComputedStyle(readout).backgroundColor)[3] } : null,
    surface: getComputedStyle(root.closest('.render-surface')!).backgroundColor,
    overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1,
  };
}

/** Read rendered PNG pixels rather than accepting a nonempty CSS declaration. */
export async function advancedScalePixels({ png, rect }: { png: string; rect: { x: number; y: number; width: number; height: number } }) {
  const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
  const sx = image.naturalWidth / innerWidth, sy = image.naturalHeight / innerHeight;
  const sample = (fraction: number) => [...context.getImageData(Math.floor((rect.x + rect.width * fraction) * sx), Math.floor((rect.y + rect.height / 2) * sy), 1, 1).data];
  const low = sample(.1), high = sample(.9);
  return { low, high, difference: Math.max(...low.slice(0, 3).map((channel, index) => Math.abs(channel - high[index]))) };
}
