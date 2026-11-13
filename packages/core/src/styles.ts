import type { StyleId } from './model';

/**
 * A style is a palette, a type setting, a native render resolution and a set of
 * drawing rules. The native resolution is the cheapest way to get a genuinely
 * different look: Pixel Arcade renders at 480x270 and is scaled up with nearest
 * neighbour, so its blockiness is real rather than a filter.
 */
export interface StyleDef {
  id: StyleId;
  name: string;
  blurb: string;
  /** Native render size. The stage is always 1920x1080 design units. */
  width: number;
  height: number;
  smooth: boolean;
  /** Relative glow strength for neon-ish styles; 0 for flat ones. */
  glow: number;
  palette: {
    bg: string;
    bg2: string;
    ink: string;
    dim: string;
    accents: string[];
  };
  font: {
    display: string;
    body: string;
    weightDisplay: string;
    weightBody: string;
    spacing: number;
  };
  background: 'stars' | 'ruled' | 'grid' | 'paper' | 'space' | 'sunset';
}

export const STYLES: Record<StyleId, StyleDef> = {
  pixel: {
    id: 'pixel', name: 'Pixel Arcade', blurb: '8-bit blocks, arcade type',
    width: 480, height: 270, smooth: false, glow: 0,
    palette: { bg: '#150e2e', bg2: '#2a1a5e', ink: '#f7f3e3', dim: '#3d2a78', accents: ['#ff4d6d', '#ffd166', '#3ddc97', '#4cc9f0'] },
    font: { display: 'monospace', body: 'monospace', weightDisplay: '700', weightBody: '700', spacing: 2 },
    background: 'stars'
  },
  stick: {
    id: 'stick', name: 'Stick Figure', blurb: 'ink on paper, hand-drawn',
    width: 1920, height: 1080, smooth: true, glow: 0,
    palette: { bg: '#f8f6ef', bg2: '#efece1', ink: '#191b21', dim: '#c9c3b4', accents: ['#e0512f', '#2b6cb0', '#c98a00', '#2f8f6f'] },
    font: { display: 'cursive', body: 'system-ui', weightDisplay: '700', weightBody: '400', spacing: 0 },
    background: 'ruled'
  },
  neon: {
    id: 'neon', name: 'Neon Night', blurb: 'glowing strokes on black',
    width: 1280, height: 720, smooth: true, glow: 1,
    palette: { bg: '#05030d', bg2: '#12082b', ink: '#eaf6ff', dim: '#2a1d55', accents: ['#ff2d95', '#22d3ee', '#a78bfa', '#facc15'] },
    font: { display: 'system-ui', body: 'system-ui', weightDisplay: '800', weightBody: '400', spacing: 1 },
    background: 'grid'
  },
  paper: {
    id: 'paper', name: 'Paper Cut', blurb: 'layered cut-outs, warm serif',
    width: 1920, height: 1080, smooth: true, glow: 0,
    palette: { bg: '#f4ead9', bg2: '#e8dac3', ink: '#2c2419', dim: '#dbc9ad', accents: ['#cf5c39', '#3f6f7a', '#c9a227', '#7a8450'] },
    font: { display: 'Georgia, serif', body: 'Georgia, serif', weightDisplay: '700', weightBody: '400', spacing: 0 },
    background: 'paper'
  },
  cosmic: {
    id: 'cosmic', name: 'Cosmic Dream', blurb: 'deep space gradients, thin type',
    width: 1280, height: 720, smooth: true, glow: 0.6,
    palette: { bg: '#080818', bg2: '#1b1040', ink: '#f0f4ff', dim: '#2b2458', accents: ['#8b5cf6', '#38bdf8', '#f472b6', '#fbbf24'] },
    font: { display: 'system-ui', body: 'system-ui', weightDisplay: '300', weightBody: '300', spacing: 3 },
    background: 'space'
  },
  vhs: {
    id: 'vhs', name: 'VHS Retro', blurb: '80s sunset, chromatic fuzz',
    width: 960, height: 540, smooth: true, glow: 0.4,
    palette: { bg: '#12002e', bg2: '#480c53', ink: '#fff3d6', dim: '#63206b', accents: ['#ff2e88', '#00e5ff', '#ffb300', '#7cff5a'] },
    font: { display: 'Impact, sans-serif', body: 'monospace', weightDisplay: '400', weightBody: '700', spacing: 1 },
    background: 'sunset'
  }
};

export const STYLE_LIST: StyleDef[] = Object.values(STYLES);

/* ------------------------------------------------------------------ */
/* Colour: WCAG relative luminance plus an HSL nudge loop, so a generated
   accent never ends up invisible against its own background.          */
/* ------------------------------------------------------------------ */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(c: { r: number; g: number; b: number }): string {
  const f = (v: number) => {
    const s = Math.round(clamp(v, 0, 255)).toString(16);
    return s.length < 2 ? '0' + s : s;
  };
  return `#${f(c.r)}${f(c.g)}${f(c.b)}`;
}

function channelLum(v: number): number {
  const x = clamp(v, 0, 255) / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * channelLum(c.r) + 0.7152 * channelLum(c.g) + 0.0722 * channelLum(c.b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgbToHsl(c: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1) || 1) : 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let p: [number, number, number];
  if (hh < 60) p = [c, x, 0];
  else if (hh < 120) p = [x, c, 0];
  else if (hh < 180) p = [0, c, x];
  else if (hh < 240) p = [0, x, c];
  else if (hh < 300) p = [x, 0, c];
  else p = [c, 0, x];
  return { r: (p[0] + m) * 255, g: (p[1] + m) * 255, b: (p[2] + m) * 255 };
}

/** Nudge a colour's lightness until it clears `min` contrast against `bg`. */
export function ensureContrast(fg: string, bg: string, min = 3): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const hsl = rgbToHsl(hexToRgb(fg));
  const darken = relativeLuminance(hexToRgb(bg)) > 0.32;
  let out = fg;
  for (let step = 1; step <= 24; step++) {
    const l = clamp(hsl.l + (darken ? -step * 4 : step * 4), 5, 95);
    out = rgbToHex(hslToRgb(hsl.h, hsl.s, l));
    if (contrastRatio(out, bg) >= min) return out;
  }
  return out;
}

export function accentFor(index: number, styleId: StyleId): string {
  const style = STYLES[styleId];
  const base = style.palette.accents[index % style.palette.accents.length];
  return ensureContrast(base, style.palette.bg, 3);
}
