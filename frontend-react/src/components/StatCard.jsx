import { Skeleton } from './Skeleton.jsx'
import { classNames } from '../utils/format.js'

const TONES = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
}

/**
 * Carte de statistique du tableau de bord.
 */
export function StatCard({ icon: Icon, label, value, hint, tone = 'brand', loading = false }) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div
          className={classNames(
            'flex size-10 items-center justify-center rounded-xl transition-colors',
            TONES[tone] ?? TONES.brand,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        {hint && !loading && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {hint}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="mt-4 h-8 w-24" />
      ) : (
        <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
      )}
      <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}
