import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerClassName?: string;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
  density?: 'compact' | 'normal' | 'spacious';
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No records found',
  className = '',
  density = 'normal',
}: DataTableProps<T>) {
  const paddingY = {
    compact: 'py-2 px-3',
    normal: 'py-3 px-4',
    spacious: 'py-4 px-5',
  }[density];

  return (
    <div className={`overflow-x-auto w-full ${className}`}>
      <table className="w-full text-left border-collapse text-[13px] font-sans">
        <thead>
          <tr className="bg-surface-container-low dark:bg-[#0f172a] text-secondary dark:text-[#94a3b8] text-[11px] font-mono uppercase tracking-wider border-b border-outline-variant/30 dark:border-[#222e4a]">
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={`py-2.5 px-3 md:px-4 font-semibold ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                } ${col.headerClassName || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/20 dark:divide-[#1f2c47]/60">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-8 text-center text-secondary dark:text-[#94a3b8] italic text-sm"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={keyExtractor(row, index)}
                onClick={() => onRowClick && onRowClick(row)}
                className={`transition-colors ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-surface-container/60 dark:hover:bg-[#162035]/70'
                    : 'hover:bg-surface-container-low/40 dark:hover:bg-[#10192b]/50'
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`${paddingY} text-on-surface dark:text-[#f8fafc] ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.className || ''}`}
                  >
                    {col.render
                      ? col.render(row, index)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
