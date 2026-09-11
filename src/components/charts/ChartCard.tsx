import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export interface TableColumn {
  label: string;
  align?: 'left' | 'right';
}

/**
 * A chart and its WCAG-clean table twin. Tooltips enhance a chart; they never
 * gate a value, so every card can be flipped to the numbers.
 */
export function ChartCard({
  title,
  subtitle,
  columns,
  rows,
  stale = false,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: (string | number)[][];
  /** Refetching: hold the previous render rather than flashing a skeleton. */
  stale?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();

  return (
    <section className="rounded-md bg-white p-3.5 shadow-[var(--shadow-sm)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <button
          type="button"
          aria-expanded={showTable}
          aria-controls={`${id}-table`}
          onClick={() => setShowTable((current) => !current)}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-600/10"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </header>

      <div className={`mt-4 transition-opacity ${stale ? 'opacity-60' : ''}`}>
        {showTable ? (
          <div id={`${id}-table`} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-[10px] tracking-wider text-slate-500 uppercase">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      className={`py-2 font-medium ${column.align === 'right' ? 'text-right' : ''}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <tr key={String(row[0])}>
                    {row.map((cell, index) => (
                      <td
                        key={columns[index]?.label ?? index}
                        className={`py-1.5 ${
                          columns[index]?.align === 'right'
                            ? 'text-right tabular-nums text-slate-800'
                            : 'text-slate-600'
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>

      {footer && <div className="mt-3 border-t border-slate-200 pt-2.5">{footer}</div>}
    </section>
  );
}

/**
 * Shared hover/focus readout. `left` is a percentage because the plot scales
 * horizontally with its container, while `top` is in pixels because the chart's
 * height is fixed.
 */
export function ChartTooltip({
  left,
  top,
  title,
  value,
}: {
  left: string;
  top: number;
  title: string;
  value: string;
}) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-slate-200 px-2 py-1 text-xs whitespace-nowrap text-slate-900 shadow-[var(--shadow-md)]"
      style={{ left, top: top - 8 }}
    >
      <span className="text-slate-500">{title}</span> <span className="tnum font-medium">{value}</span>
    </div>
  );
}
