import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

import { api } from '../api/client.js'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import { classNames } from '../utils/format.js'

/**
 * Sélecteur d'individu avec autocomplétion, utilisé pour les ObjectProperty.
 *
 * @param {string} value           nom de l'individu sélectionné (sans « @ »)
 * @param {(value: string) => void} onChange
 * @param {string} type            classe cible (range de la propriété) pour filtrer
 * @param {string} placeholder
 */
export function IndividualPicker({ value, onChange, type, placeholder = 'Rechercher un individu…' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState(0)

  const debouncedSearch = useDebouncedValue(search, 220)

  useEffect(() => {
    if (!open) return undefined

    let cancelled = false
    setLoading(true)

    api
      .individuals({ search: debouncedSearch || undefined, type: type || undefined })
      .then((data) => {
        if (cancelled) return
        setResults(data ?? [])
        setHighlighted(0)
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, debouncedSearch, type])

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!event.target.closest?.('[data-picker]')) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const displayValue = useMemo(() => value ?? '', [value])

  const select = (name) => {
    onChange(name)
    setOpen(false)
    setSearch('')
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && results[highlighted]) {
      event.preventDefault()
      select(results[highlighted].name)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative" data-picker>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={open ? search : displayValue}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          className={classNames(
            'w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25',
            'dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100',
            open && 'border-brand-500 ring-2 ring-brand-500/25',
          )}
        />
        {displayValue && !open ? (
          <button
            type="button"
            aria-label="Effacer la sélection"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : (
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        )}
      </div>

      {open && (
        <ul
          role="listbox"
          className="scrollbar-thin absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {loading && (
            <li className="px-3 py-2 text-xs text-slate-400">Chargement…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400">Aucun individu trouvé</li>
          )}
          {!loading &&
            results.map((item, index) => (
              <li key={item.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.name === value}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => select(item.name)}
                  className={classNames(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition',
                    index === highlighted
                      ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800',
                  )}
                >
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[11px] text-slate-400">{item.types?.join(', ')}</span>
                    {item.name === value && (
                      <Check className="size-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />
                    )}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
