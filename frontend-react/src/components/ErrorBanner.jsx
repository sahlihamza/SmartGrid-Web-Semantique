import { CircleX, RefreshCw } from 'lucide-react'

import { Button } from './Button.jsx'
import { classNames } from '../utils/format.js'

/** Bandeau d'erreur affiché dans le contenu d'une page. */
export function ErrorBanner({ message, onRetry, className }) {
  if (!message) return null

  return (
    <div
      role="alert"
      className={classNames(
        'flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3',
        'dark:border-rose-500/30 dark:bg-rose-500/10',
        className,
      )}
    >
      <CircleX className="size-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-rose-800 dark:text-rose-200">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  )
}
