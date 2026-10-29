import { classNames } from '../utils/format.js'
import { getClassPalette } from '../utils/colors.js'

/**
 * Badge coloré pour une classe de l'ontologie.
 * La couleur est déduite du nom de la classe (voir utils/colors.js).
 */
export function ClassBadge({ name, className, showDot = false, size = 'md' }) {
  if (!name) return null
  const palette = getClassPalette(name)

  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        palette.badge,
        className,
      )}
    >
      {showDot && <span className={classNames('size-1.5 rounded-full', palette.dot)} aria-hidden="true" />}
      {name}
    </span>
  )
}

/** Badge générique (ton neutre ou coloré). */
export function Badge({ children, tone = 'neutral', className, icon: Icon }) {
  const tones = {
    neutral:
      'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/30',
    brand: 'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/25',
    success:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/25',
    warning:
      'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/25',
    danger: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-400/25',
    info: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/25',
  }

  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        tones[tone] ?? tones.neutral,
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  )
}
