import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Ops tables must survive a phone. `DataTable` renders a real <table> from
 * `md:` upwards and a stacked card list below it, from one column definition,
 * so no screen has to maintain two markup trees.
 */
export interface Column<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Hide this column in the stacked mobile card (e.g. redundant labels). */
  hideOnMobile?: boolean;
  className?: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  mobileTitle,
  empty,
  className,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  /** Headline for the stacked mobile card. */
  mobileTitle?: (row: Row) => ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className={className}>
      {/* Desktop / tablet */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-steel-150 text-xs uppercase tracking-wide text-steel-400">
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cn('px-4 py-2.5 font-medium', column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-steel-100 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-steel-50',
                )}
              >
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-4 py-3 align-middle', column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="flex flex-col gap-2 p-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                'rounded-xl border border-steel-150 bg-white p-3.5',
                onRowClick && 'cursor-pointer active:bg-steel-50',
              )}
            >
              {mobileTitle && (
                <div className="mb-2 font-display text-sm font-semibold text-steel-900">
                  {mobileTitle(row)}
                </div>
              )}
              <dl className="flex flex-col gap-1.5">
                {columns
                  .filter((column) => !column.hideOnMobile)
                  .map((column) => (
                    <div key={column.key} className="flex items-start justify-between gap-3">
                      <dt className="text-xs text-steel-400">{column.header}</dt>
                      <dd className="min-w-0 text-right text-sm text-steel-800">{column.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
