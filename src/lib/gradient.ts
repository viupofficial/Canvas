// Shared gradient model used by the Inspector (canvas fills), the RSVP sidebar
// (footer colors), and every renderer of those colors (EventFooter, previews).
//
// A gradient travels as plain JSON — the compact descriptor the pickers emit:
//   { type: 'linear' | 'radial', angle, colorStops: [{ offset, color }] }
// Canvas fills are revived into live fabric Gradient instances inside
// CanvasEditor.updateActiveObject; CSS consumers turn it into a
// linear-gradient()/radial-gradient() string via cssBackground().
//
// Angle convention: degrees, 0 = left→right, measured clockwise (y-down screen
// coords). The equivalent CSS gradient angle is `angle + 90`.

export type GradientStop = { offset: number; color: string };

export type GradientDescriptor = {
  type: 'linear' | 'radial';
  angle?: number;
  colorStops: GradientStop[];
  // Present on gradients serialized back out of fabric.
  coords?: { x1: number; y1: number; x2: number; y2: number; r1?: number; r2?: number };
  gradientUnits?: string;
};

export function isGradientValue(v: any): v is GradientDescriptor {
  return !!v && typeof v === 'object' && Array.isArray(v.colorStops);
}

// Parse any CSS color (hex3/6/8, rgb, rgba) into { hex, opacity 0-100 }.
// Non-string values (e.g. a gradient descriptor) fall back to the default.
export function parseColor(
  color: string | undefined | null,
  defaultHex = '#000000',
): { hex: string; opacity: number } {
  if (!color || typeof color !== 'string') return { hex: defaultHex, opacity: 100 };
  const rgba = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (rgba) {
    const r = parseInt(rgba[1]), g = parseInt(rgba[2]), b = parseInt(rgba[3]);
    const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1;
    const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    return { hex, opacity: Math.round(a * 100) };
  }
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    const a = parseInt(color.slice(7, 9), 16) / 255;
    return { hex: color.slice(0, 7), opacity: Math.round(a * 100) };
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return { hex: color, opacity: 100 };
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const h = '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    return { hex: h, opacity: 100 };
  }
  return { hex: defaultHex, opacity: 100 };
}

// Combine a 6-digit hex and opacity (0-100) into an rgba() string (or plain hex
// when fully opaque).
export function buildRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.max(0, Math.min(100, opacity)) / 100;
  return a >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Invert a 6-digit hex color (Adobe-style negative).
export function invertHex(hex: string): string {
  const r = 255 - parseInt(hex.slice(1, 3), 16);
  const g = 255 - parseInt(hex.slice(3, 5), 16);
  const b = 255 - parseInt(hex.slice(5, 7), 16);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Recover the angle from a serialized gradient's percentage coords — fabric
// persists coords, not our `angle` field.
export function gradientAngle(g: GradientDescriptor): number {
  if (typeof g.angle === 'number') return g.angle;
  const c = g.coords;
  if (c && typeof c.x1 === 'number' && typeof c.x2 === 'number') {
    return Math.round((Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180) / Math.PI + 360) % 360;
  }
  return 0;
}

// Stops sorted by offset — for CSS output and "first/last color" lookups.
// (The editing UI keeps array order stable so drag handles keep their identity;
// CSS requires ascending positions.)
export function sortedStops(g: GradientDescriptor): GradientStop[] {
  return [...g.colorStops].sort((a, b) => a.offset - b.offset);
}

// Ramp preview: always left→right, like Figma's picker bar.
export function gradientPreviewCss(g: GradientDescriptor): string {
  const stops = sortedStops(g)
    .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(', ');
  return `linear-gradient(90deg, ${stops})`;
}

// CSS `background` value for a solid color OR a gradient, with an extra global
// opacity (0-100) multiplied into every stop — used by the RSVP footer where
// color and opacity are stored separately.
export function cssBackground(
  value: string | GradientDescriptor | null | undefined,
  opacityPct = 100,
  fallback = '#000000',
): string {
  if (isGradientValue(value)) {
    const stops = sortedStops(value)
      .map((s) => {
        const p = parseColor(s.color);
        return `${buildRgba(p.hex, (p.opacity * opacityPct) / 100)} ${Math.round(s.offset * 100)}%`;
      })
      .join(', ');
    return value.type === 'radial'
      ? `radial-gradient(circle, ${stops})`
      : `linear-gradient(${gradientAngle(value) + 90}deg, ${stops})`;
  }
  const p = parseColor(value, fallback);
  return buildRgba(p.hex, (p.opacity * opacityPct) / 100);
}

// A representative plain color for contexts that can't render a gradient
// (text color, borders, tiny previews): the first stop of a gradient, or the
// value itself when already solid.
export function firstColorHex(
  value: string | GradientDescriptor | null | undefined,
  fallback = '#000000',
): string {
  if (isGradientValue(value)) return parseColor(sortedStops(value)[0]?.color, fallback).hex;
  return parseColor(value, fallback).hex;
}

// Darken a 6-digit hex — seeds the second stop when a solid color becomes a
// gradient, so the result is immediately visible as one.
export function darkenHex(hex: string): string {
  const f = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.55);
  return '#' + [1, 3, 5].map((i) => f(i).toString(16).padStart(2, '0')).join('');
}

// Lighten a 6-digit hex — counterpart of darkenHex for near-black colors.
export function lightenHex(hex: string): string {
  const f = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * 0.45);
  };
  return '#' + [1, 3, 5].map((i) => f(i).toString(16).padStart(2, '0')).join('');
}

// Solid color → default two-stop gradient of the requested type. Dark colors
// get a lighter second stop (darkening near-black would produce an invisible
// black→black "gradient").
export function solidToGradient(color: string, type: 'linear' | 'radial'): GradientDescriptor {
  const { hex, opacity } = parseColor(color);
  const isDark = [1, 3, 5].every((i) => parseInt(hex.slice(i, i + 2), 16) < 48);
  return {
    type,
    angle: 0,
    colorStops: [
      { offset: 0, color: buildRgba(hex, opacity) },
      { offset: 1, color: buildRgba(isDark ? lightenHex(hex) : darkenHex(hex), opacity) },
    ],
  };
}

// Gradient → solid: the first (lowest-offset) stop's color.
export function gradientToSolid(g: GradientDescriptor, fallback = '#000000'): string {
  return sortedStops(g)[0]?.color ?? fallback;
}

// Invert a solid color or every stop of a gradient.
export function invertColorValue(
  value: string | GradientDescriptor,
): string | GradientDescriptor {
  if (isGradientValue(value)) {
    return {
      type: value.type,
      angle: gradientAngle(value),
      colorStops: value.colorStops.map((s) => {
        const p = parseColor(s.color);
        return { ...s, color: buildRgba(invertHex(p.hex), p.opacity) };
      }),
    };
  }
  const p = parseColor(value);
  return buildRgba(invertHex(p.hex), p.opacity);
}
