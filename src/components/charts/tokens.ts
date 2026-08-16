/**
 * Chart tokens for the portal's surface (white cards on slate-50).
 *
 * The ordinal ramps below were validated with the dataviz validator against
 * `--surface #ffffff --ordinal`: monotone lightness, adjacent ΔL ≥ 0.06, light
 * end clearing 2:1, single hue. Re-run it if you change a value.
 *
 * Deliberately NOT a categorical palette: every series here is either a single
 * series or an ordered scale, so one hue light→dark is the correct encoding and
 * sidesteps the red/green CVD trap entirely.
 */
export const VIZ = {
  surface: '#ffffff',
  ink: '#0f172a',
  inkSecondary: '#475569',
  muted: '#94a3b8',
  grid: '#e2e8f0',
  axis: '#cbd5e1',

  /** Single-series marks (attendance, plan sales). */
  series: '#4f46e5',
  /** De-emphasised companion for context marks. */
  seriesMuted: '#c7d2fe',

  /** Membership health, most healthy → least. Validated 4-step ordinal. */
  ordinal4: ['#3730a3', '#4f46e5', '#6366f1', '#818cf8'],
  /** Renewal urgency, soonest → furthest. Validated 3-step ordinal. */
  ordinal3: ['#312e81', '#4f46e5', '#818cf8'],
} as const;

/** Marks are thin by spec — never fill the whole band. */
export const MAX_BAR = 24;
/** White doing the separating, rather than a stroke around each mark. */
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
