import { EmptyState } from './EmptyState.jsx'
import { TableSkeleton } from './Skeleton.jsx'
import { classNames } from '../utils/format.js'

/**
 * Tableau générique réutilisable.
 *
 * @param {Array<{ key: string, header: string, render?: (row: any) => React.ReactNode, align?: string, width?: string }>} columns
 * @param {Array<object>} rows
 */
export function DataTable({
  columns,
  rows,
  loading = false,
  skeletonRows = 6,
  empty,
  onRowClick,
  rowKey = (row, index) => row.id ?? row.name ?? index,
  className,
}) {
  if (loading) {
    return (
      <div className={className}>
        <TableSkeleton rows={skeletonRows} columns={columns.length} />
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return <div className={className}>{empty ?? <EmptyState title="Aucun résultat" />}</div>
  }

  return (
    <div className={classNames('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={classNames(
                  'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400',
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={classNames(
                'transition-colors',
                onRowClick &&
                  'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={classNames(
                    'px-4 py-3 align-middle text-slate-700 dark:text-slate-300',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    column.className,
                  )}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
