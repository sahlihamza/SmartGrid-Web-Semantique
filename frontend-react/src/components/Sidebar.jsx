import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Box, ChevronLeft, LayoutDashboard, Network, Sparkles, Terminal, X, Zap } from 'lucide-react'

import { classNames } from '../utils/format.js'

const COLLAPSE_KEY = 'smartgrid.sidebar.collapsed'

const NAV_ITEMS = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/equipements', label: 'Équipements', icon: Box },
  { to: '/reseau', label: 'Réseau', icon: Network },
  { to: '/sparql', label: 'Console SPARQL', icon: Terminal },
  { to: '/assistant', label: 'Assistant', icon: Sparkles },
]

/**
 * Sidebar de navigation : repliable sur desktop, tiroir (drawer) sur mobile.
 */
export function Sidebar({ mobileOpen, onCloseMobile }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  })

  // Sur mobile on part toujours de la sidebar dépliée pour lisibilité.
  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseMobile?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen, onCloseMobile])

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <>
      {/* Voile foncé du tiroir mobile */}
      <div
        className={classNames(
          'fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-200 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={classNames(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-300 ease-out',
          'dark:border-slate-800 dark:bg-slate-900',
          'lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0',
          collapsed ? 'lg:w-[76px]' : 'lg:w-64',
          mobileOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full',
        )}
      >
        {/* Logo / nom de l'application */}
        <div
          className={classNames(
            'flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800',
            collapsed && 'lg:justify-center lg:px-2',
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
            <Zap className="size-5" aria-hidden="true" />
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">Smart Grid</p>
              <p className="truncate text-[11px] text-slate-400">Gestion d’ontologie</p>
            </div>
          )}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fermer le menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden dark:hover:bg-slate-800"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* Liens de navigation */}
        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onCloseMobile}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      classNames(
                        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                        collapsed && 'lg:justify-center lg:px-2',
                        isActive
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={classNames(
                            'size-4.5 shrink-0',
                            isActive
                              ? 'text-brand-600 dark:text-brand-300'
                              : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300',
                          )}
                          aria-hidden="true"
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bouton de repli (desktop uniquement) */}
        <div className="hidden shrink-0 border-t border-slate-200 p-3 lg:block dark:border-slate-800">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
            className={classNames(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
              collapsed && 'justify-center px-2',
            )}
          >
            <ChevronLeft
              className={classNames(
                'size-4.5 shrink-0 transition-transform duration-300',
                collapsed && 'rotate-180',
              )}
              aria-hidden="true"
            />
            {!collapsed && <span>Replier</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
