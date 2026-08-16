import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartTooltip } from './ChartCard';
import { MAX_BAR, SURFACE_GAP, VIZ, barPath, columnPath, niceTicks } from './tokens';

export interface Point {
  key: string;
  /** Axis label — kept short; the tooltip carries the full one. */
  label: string;
  /** Full label for the tooltip and the accessible name. */
  title: string;
  value: number;
}

/**
 * Columns over time. One series, so one hue and no legend — the card title
 * already says what is plotted.
 */
export function ColumnChart({
  points,
  height = 180,
  formatValue = (v: number) => String(v),
  emphasiseMax = true,
}: {
  points: Point[];
  height?: number;
  formatValue?: (value: number) => string;
  emphasiseMax?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);

  const width = 760;
  const padding = { top: 16, right: 8, bottom: 28, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = Math.max(1, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const scaleMax = ticks[ticks.length - 1] || 1;
  const band = plotWidth / Math.max(1, points.length);
  const barWidth = Math.min(MAX_BAR, Math.max(4, band - SURFACE_GAP * 2));
  const maxIndex = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Column chart. ${points.map((p) => `${p.title}: ${formatValue(p.value)}`).join('. ')}`}
      >
        {ticks.map((tick) => {
          const y = padding.top + plotHeight - (tick / scaleMax) * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke={tick === 0 ? VIZ.axis : VIZ.grid}
                strokeWidth={1}
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill={VIZ.muted}>
                {tick}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          const barHeight = (point.value / scaleMax) * plotHeight;
          const x = padding.left + band * index + (band - barWidth) / 2;
          const y = padding.top + plotHeight - barHeight;
          const isMax = emphasiseMax && index === maxIndex && point.value > 0;

          return (
            <g
              key={point.key}
              tabIndex={0}
              role="listitem"
              aria-label={`${point.title}: ${formatValue(point.value)}`}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className="focus:outline-none"
            >
              {/* Hit target spans the whole band so it clears ~24px. */}
              <rect
                x={padding.left + band * index}
                y={padding.top}
                width={band}
                height={plotHeight}
                fill="transparent"
              />
              {point.value > 0 && (
                <path
                  d={columnPath(x, y, barWidth, barHeight)}
                  fill={VIZ.series}
                  opacity={active === null || active === index ? 1 : 0.55}
                />
              )}
              {/* Label the extreme only — never a number on every column. */}
              {isMax && (
                <text
                  x={x + barWidth / 2}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={VIZ.inkSecondary}
                >
                  {formatValue(point.value)}
                </text>
              )}
              <text
                x={padding.left + band * index + band / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={11}
                fill={VIZ.muted}
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>

      {active !== null && points[active] && (
        <ChartTooltip
          left={`${((padding.left + band * active + band / 2) / width) * 100}%`}
          top={padding.top + plotHeight - (points[active].value / scaleMax) * plotHeight}
          title={points[active].title}
          value={formatValue(points[active].value)}
        />
      )}
    </div>
  );
}

/**
 * Horizontal bars for magnitude by name. One series, one hue; values ride the
 * bar tips because there are few enough rows for that to stay quiet.
 */
export function BarChart({
  points,
  formatValue = (v: number) => String(v),
  colors,
}: {
  points: Point[];
  formatValue?: (value: number) => string;
  /** Ordered categories get the ordinal ramp; nominal ones share one hue. */
  colors?: readonly string[];
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));

  return (
    <ul className="space-y-2">
      {points.map((point, index) => (
        <li
          key={point.key}
          tabIndex={0}
          aria-label={`${point.title}: ${formatValue(point.value)}`}
          onMouseEnter={() => setActive(index)}
          onMouseLeave={() => setActive(null)}
          onFocus={() => setActive(index)}
          onBlur={() => setActive(null)}
          className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 rounded py-1 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-600"
        >
          <span className="truncate text-sm text-slate-600" title={point.title}>
            {point.title}
          </span>
          <svg viewBox="0 0 100 16" preserveAspectRatio="none" className="h-4 w-full" aria-hidden="true">
            {point.value > 0 && (
              <path
                d={barPath(0, 2, Math.max(0.8, (point.value / max) * 100), 12, 1.2)}
                fill={colors?.[index] ?? VIZ.series}
                opacity={active === null || active === index ? 1 : 0.55}
              />
            )}
          </svg>
          <span className="w-12 text-right text-sm font-semibold text-slate-800 tabular-nums">
            {formatValue(point.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Part-to-whole across ordered classes. Segments are separated by a 2px gap in
 * the surface colour rather than a stroke, and a legend is always present
 * because there is more than one class.
 */
export function StackedShareBar({
  points,
  colors,
  total,
  hrefFor,
}: {
  points: Point[];
  colors: readonly string[];
  total: number;
  /** Makes each class drill through to the list that reproduces it. */
  hrefFor?: (index: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const safeTotal = Math.max(1, total);

  return (
    <div>
      <div
        className="flex h-8 w-full gap-[2px] overflow-hidden rounded"
        role="img"
        aria-label={points.map((p) => `${p.title}: ${p.value}`).join('. ')}
      >
        {points.map((point, index) => {
          const share = point.value / safeTotal;
          if (point.value === 0) return null;
          const percent = Math.round(share * 100);
          // Only set a label inside a segment when it comfortably fits.
          const fits = share > 0.12;
          const href = hrefFor?.(index);

          const inner = fits ? (
            <span className="text-xs font-semibold text-white">{point.value}</span>
          ) : null;

          const shared = {
            'aria-label': `${point.title}: ${point.value} (${percent}%)`,
            onMouseEnter: () => setActive(index),
            onMouseLeave: () => setActive(null),
            onFocus: () => setActive(index),
            onBlur: () => setActive(null),
            className:
              'flex items-center justify-center focus:outline-2 focus:outline-offset-2 focus:outline-indigo-600',
            style: {
              width: `${share * 100}%`,
              backgroundColor: colors[index] ?? VIZ.series,
              opacity: active === null || active === index ? 1 : 0.6,
            },
          };

          return href ? (
            <Link key={point.key} to={href} {...shared}>
              {inner}
            </Link>
          ) : (
            <div key={point.key} tabIndex={0} {...shared}>
              {inner}
            </div>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {points.map((point, index) => {
          const href = hrefFor?.(index);
          const body = (
            <>
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: colors[index] ?? VIZ.series }}
              />
              <span className="text-slate-600">{point.title}</span>
              <span className="font-semibold text-slate-800 tabular-nums">{point.value}</span>
            </>
          );
          return (
            <li key={point.key} className="text-xs">
              {href ? (
                <Link
                  to={href}
                  className="flex items-center gap-1.5 rounded hover:underline"
                  onMouseEnter={() => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                >
                  {body}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
