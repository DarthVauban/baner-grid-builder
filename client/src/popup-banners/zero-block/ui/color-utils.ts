export type ColorSelection = {
  hue: number;
  saturation: number;
  brightness: number;
  alpha: number;
};

/** Decode canonical HEX while retaining the meaningful hue at achromatic colors. */
export function hexToHsv(color: string, previous?: ColorSelection): ColorSelection {
  const [red, green, blue] = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = previous?.hue ?? 0;
  if (delta > 0) {
    const sector = maximum === red ? (green - blue) / delta : maximum === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
    hue = ((sector * 60) % 360 + 360) % 360;
  }
  return {
    hue,
    saturation: maximum === 0 ? previous?.saturation ?? 0 : delta / maximum * 100,
    brightness: maximum * 100,
    alpha: color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) / 255 * 100 : 100,
  };
}

/** Preserve HSV intent even where distinct gestures round to the same RGB bytes. */
export function hsvToHex(selection: ColorSelection, includeAlpha = false) {
  const hue = ((selection.hue % 360) + 360) % 360 / 60;
  const saturation = Math.min(100, Math.max(0, selection.saturation)) / 100;
  const value = Math.min(100, Math.max(0, selection.brightness)) / 100;
  const chroma = value * saturation;
  const secondary = chroma * (1 - Math.abs(hue % 2 - 1));
  const sectors = [[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary], [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]];
  const minimum = value - chroma;
  const bytes = sectors[Math.floor(hue)].map(channel => Math.round((channel + minimum) * 255));
  const alpha = Math.round(Math.min(100, Math.max(0, selection.alpha)) / 100 * 255);
  if (includeAlpha || alpha < 255) bytes.push(alpha);
  return `#${bytes.map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
