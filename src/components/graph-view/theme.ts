export type GraphViewThemeColor = {
  a: number;
  rgb: number;
};

export type GraphViewTheme = {
  fill: GraphViewThemeColor;
  fillFocused: GraphViewThemeColor;
  fillTag: GraphViewThemeColor;
  fillUnresolved: GraphViewThemeColor;
  fillAttachment: GraphViewThemeColor;
  arrow: GraphViewThemeColor;
  circle: GraphViewThemeColor;
  line: GraphViewThemeColor;
  text: GraphViewThemeColor;
  fillHighlight: GraphViewThemeColor;
  lineHighlight: GraphViewThemeColor;
};

const THEME_CLASSES: Record<keyof GraphViewTheme, string> = {
  fill: 'color-fill',
  fillFocused: 'color-fill-focused',
  fillTag: 'color-fill-tag',
  fillUnresolved: 'color-fill-unresolved',
  fillAttachment: 'color-fill-attachment',
  arrow: 'color-arrow',
  circle: 'color-circle',
  line: 'color-line',
  text: 'color-text',
  fillHighlight: 'color-fill-highlight',
  lineHighlight: 'color-line-highlight',
};

const color = (rgb: number, a = 1): GraphViewThemeColor => ({ rgb, a });

/** Fallbacks keep the standalone engine usable before a host theme is loaded. */
export const DEFAULT_GRAPH_VIEW_THEME: GraphViewTheme = {
  fill: color(0x5069d9),
  fillFocused: color(0x5069d9),
  fillTag: color(0x159b86),
  fillUnresolved: color(0xc96571),
  fillAttachment: color(0xe29352),
  arrow: color(0x536ddd),
  circle: color(0x536ddd),
  line: color(0xc5cedd),
  text: color(0x556582),
  fillHighlight: color(0x536ddd),
  lineHighlight: color(0x536ddd),
};

/** Parse the computed CSS color format used by browsers and the host theme. */
export function parseGraphViewCssColor(value: string, opacity = 1): GraphViewThemeColor | null {
  const normalized = value.trim().toLowerCase();
  const hex = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex?.[1]) {
    const expanded = hex[1].length === 3 ? hex[1].replace(/./g, (part) => part + part) : hex[1];
    return { rgb: Number.parseInt(expanded, 16), a: clampAlpha(opacity) };
  }

  const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if (!rgb) return null;
  const alpha = rgb[4]?.endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : rgb[4] ? Number.parseFloat(rgb[4]) : 1;
  const red = clampByte(Number.parseFloat(rgb[1] ?? '0'));
  const green = clampByte(Number.parseFloat(rgb[2] ?? '0'));
  const blue = clampByte(Number.parseFloat(rgb[3] ?? '0'));
  return { rgb: (red << 16) | (green << 8) | blue, a: clampAlpha(opacity * alpha) };
}

/**
 * Read the host's graph-view color classes. This mirrors the reference's
 * hidden probe elements instead of assuming a light or dark palette.
 */
export function readGraphViewTheme(
  document: Document | undefined,
  fallback: GraphViewTheme = DEFAULT_GRAPH_VIEW_THEME
): GraphViewTheme {
  if (!document?.body) return cloneGraphViewTheme(fallback);
  const result = {} as GraphViewTheme;
  for (const [key, className] of Object.entries(THEME_CLASSES) as Array<[keyof GraphViewTheme, string]>) {
    const probe = document.createElement('span');
    probe.className = `graph-view ${className}`;
    probe.style.position = 'absolute';
    probe.style.width = '0';
    probe.style.height = '0';
    probe.style.pointerEvents = 'none';
    document.body.appendChild(probe);
    const computed = document.defaultView?.getComputedStyle(probe);
    const parsed = parseGraphViewCssColor(computed?.color ?? '', parseCssOpacity(computed?.opacity ?? '1'));
    probe.remove();
    result[key] = parsed ?? { ...fallback[key] };
  }
  return result;
}

function cloneGraphViewTheme(theme: GraphViewTheme): GraphViewTheme {
  return Object.fromEntries(Object.entries(theme).map(([key, value]) => [key, { ...value }])) as GraphViewTheme;
}

function parseCssOpacity(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? clampAlpha(parsed) : 1;
}

function clampAlpha(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}

function clampByte(value: number): number {
  return Math.round(Math.min(255, Math.max(0, Number.isFinite(value) ? value : 0)));
}
