import type { ReactNode } from "react";

export interface ChartTableRow {
  id: string;
  cells: ReactNode[];
}

export interface AccessibleChartProps {
  title: string;
  description: string;
  columns: string[];
  rows: ChartTableRow[];
  children: ReactNode;
}

/** Pairs any visual chart with a semantic data table containing the same values. */
export function AccessibleChart({
  title,
  description,
  columns,
  rows,
  children,
}: AccessibleChartProps) {
  return (
    <figure className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6">
      <figcaption>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </figcaption>
      <div role="img" aria-label={`${title}: ${description}`} className="min-h-48">
        {children}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          표로 데이터 보기
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{title} 데이터</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="border-b border-slate-300 px-3 py-2 font-semibold"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell, index) =>
                    index === 0 ? (
                      <th
                        key={columns[index]}
                        scope="row"
                        className="border-b border-slate-200 px-3 py-2 font-medium"
                      >
                        {cell}
                      </th>
                    ) : (
                      <td
                        key={columns[index]}
                        className="border-b border-slate-200 px-3 py-2"
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
