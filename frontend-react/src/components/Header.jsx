import { useLocation } from 'react-router-dom'
import { Menu, Moon, Sun } from 'lucide-react'

import { useHealth } from '../hooks/useHealth.js'
import { useTheme } from '../hooks/useTheme.jsx'
import { classNames } from '../utils/format.js'

/** Titre et sous-titre de chaque route. */
const PAGE_META = {
  '/': { title: 'Tableau de bord', subtitle: 'Vue d’ensemble de l’ontologie Smart Grid' },
  '/equipements': { title: 'Équipements', subtitle: 'Individus, propriétés et relations' },
  '/reseau': { title: 'Réseau', subtitle: 'Graphe des relations entre individus' },
  '/sparql': { title: 'Console SPARQL', subtitle: 'Interrogez directement le graphe RDF' },
  '/assistant': { title: 'Assistant', subtitle: 'Posez une question en langage naturel' },
}

/**
 * En-tête : titre de la page, bascule de thème et indicateur de connexion.
 */
export function Header({ onOpenNav }) {
  const location = useLocation()
  const { isDark, toggleTheme } = useTheme()
  const { status, data, error } = useHealth()

  const meta =
    PAGE_META[location.pathname] ??
    (location.pathname.startsWith('/equipements/')
      ? { title: 'Fiche individu', subtitle: 'Détail des propriétés et relations' }
      : { title: 'Smart Grid', subtitle: 'Gestion d’ontologie' })

  const statusConfig = {
    pending: {
      dot: 'bg-amber-400 animate-pulse-soft',
      label: 'Connexion…',
      tone: 'text-amber-600 dark:text-amber-400',
    },
    online: {
      dot: 'bg-emerald-500',
      label: 'Connecté',
      tone: 'text-emerald-600 dark:text-emerald-400',
    },
    offline: {
      dot: 'bg-rose-500',
      label: 'Hors ligne',
      tone: 'text-rose-600 dark:text-rose-400',
    },
  }[status]

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white/85 px-4 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-900/85">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Ouvrir le menu"
        className="-ml-1 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg dark:text-white">
          {meta.title}
        </h1>
        <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
          {meta.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Indicateur de connexion au back-end (GET /health) */}
        <div
          title={
            status === 'online'
              ? `Back-end joignable — ${data?.triples ?? '?'} triplets, ${data?.namespace ?? ''}`
              : (error ?? 'Back-end injoignable')
          }
          className={classNames(
            'flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700',
            statusConfig.tone,
          )}
        >
          <span className={classNames('size-2 rounded-full', statusConfig.dot)} aria-hidden="true" />
          <span className="hidden sm:inline">{statusConfig.label}</span>
          {status === 'online' && data && (
            <span className="hidden font-mono text-[11px] text-slate-400 md:inline">
              {data.triples} triplets
            </span>
          )}
        </div>

        {/* Bascule clair / sombre */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
          title={isDark ? 'Mode clair' : 'Mode sombre'}
          className="flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {isDark ? <Sun className="size-4.5" aria-hidden="true" /> : <Moon className="size-4.5" aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
}
