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
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <button
          type="button"
          aria-expanded={showTable}
          aria-controls={`${id}-table`}
          onClick={() => setShowTable((current) => !current)}
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </header>

      <div className={`mt-4 transition-opacity ${stale ? 'opacity-60' : ''}`}>
        {showTable ? (
          <div id={`${id}-table`} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase">
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
              <tbody className="divide-y divide-slate-100">
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

      {footer && <div className="mt-3 border-t border-slate-100 pt-3">{footer}</div>}
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
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-lg"
      style={{ left, top: top - 8 }}
    >
      <span className="text-slate-300">{title}</span> <span className="font-semibold">{value}</span>
    </div>
  );
}
