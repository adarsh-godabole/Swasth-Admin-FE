/**
 * Chart tokens for the portal's surface — Nocturne cards on the dark ground.
 *
 * Single and ordered series ride the accent ramp, which is monotone in
 * lightness by construction (it is generated in OKLCH on one shared lightness
 * scale), so dark→light reads as an ordinal scale and no categorical hue wheel
 * is needed. The one exception is membership health, which is a genuine state
 * scale and takes the status trio the rest of the portal already uses.
 */
export const VIZ = {
  surface: '#232532',
  ink: '#f3f5fe',
  inkSecondary: '#b2b6ca',
  muted: '#9397ab',
  grid: '#292b31',
  axis: '#3f424d',

  /** Single-series marks (attendance, plan sales). */
  series: '#5d5294',
  /** De-emphasised companion for context marks. */
  seriesMuted: '#2b2741',

  /**
   * Membership health, healthiest → least. These are states rather than an
   * ordered magnitude, so they take the same ok/warn/bad the tables use — the
   * dot-plus-phrase legend carries the meaning for anyone who can't separate
   * the hues.
   */
  ordinal4: ['#4fae76', '#cf9338', '#cf5a53', '#3f424d'],
  /** Renewal urgency, soonest → furthest: warning, then down the accent ramp. */
  ordinal3: ['#cf9338', '#968ae0', '#5d5294'],
} as const;

/** Marks are thin by spec — never fill the whole band. */
export const MAX_BAR = 24;
/** The card ground doing the separating, rather than a stroke per mark. */
export const SURFACE_GAP = 2;

/** A rect with only its data-end rounded; the baseline end stays square. */
export function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
  const radius = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return [
    `M${x},${y + h}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

/** Horizontal twin: rounded at the value end, square at the baseline. */
export function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  const radius = Math.min(r, h / 2, w);
  if (w <= 0) return '';
  return [
    `M${x},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h - radius}`,
    `Q${x + w},${y + h} ${x + w - radius},${y + h}`,
    `L${x},${y + h}`,
    'Z',
  ].join(' ');
}

/**
 * Axis ticks that land on clean numbers rather than raw maxima. `integer` keeps
 * counts of people off fractional steps — half a visit is not a thing.
 */
export function niceTicks(max: number, count = 4, integer = true): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  let step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude * 10;
  if (integer) step = Math.max(1, Math.ceil(step));

  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return ticks;
}
