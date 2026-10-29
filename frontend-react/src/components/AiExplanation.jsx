import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'

import { Badge } from './Badge.jsx'
import { Button } from './Button.jsx'
import { ErrorBanner } from './ErrorBanner.jsx'
import { SkeletonText } from './Skeleton.jsx'

/** Étiquette de la source du texte : on ne masque jamais qu'il vient du repli local. */
export function SourceBadge({ source }) {
  return source === 'llm' ? (
    <Badge tone="brand" icon={Sparkles}>Généré par IA</Badge>
  ) : (
    <Badge tone="neutral">Généré localement</Badge>
  )
}

/**
 * Carte « explication en français » : appelle `load()` (qui renvoie { text, source })
 * soit au chargement (`autoLoad`), soit au clic sur le bouton.
 * `resetKey` remet la carte à zéro quand le sujet change (autre individu par exemple).
 */
export function AiExplanation({
  title,
  description,
  load,
  buttonLabel = 'Expliquer',
  autoLoad = false,
  resetKey,
}) {
  const [state, setState] = useState({ status: 'idle', text: '', source: '', error: '' })
  const loadRef = useRef(load)
  const requestRef = useRef(0)

  useEffect(() => {
    loadRef.current = load
  })

  const run = useCallback(async () => {
    // Ignore la réponse d'une requête périmée (changement de sujet entre-temps).
    const requestId = ++requestRef.current
    setState((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const data = await loadRef.current()
      if (requestId !== requestRef.current) return
      setState({ status: 'done', text: data.text, source: data.source, error: '' })
    } catch (error) {
      if (requestId !== requestRef.current) return
      setState({ status: 'error', text: '', source: '', error: error.message })
    }
  }, [])

  useEffect(() => {
    setState({ status: 'idle', text: '', source: '', error: '' })
    if (autoLoad) run()
    return () => {
      requestRef.current += 1
    }
  }, [resetKey, autoLoad, run])

  const loading = state.status === 'loading'

  return (
    <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/80 to-white p-5 shadow-sm shadow-slate-900/5 dark:border-brand-500/30 dark:from-brand-500/10 dark:to-slate-900 dark:shadow-black/20">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {state.status === 'done' && <SourceBadge source={state.source} />}
          <Button
            variant={state.status === 'done' ? 'ghost' : 'subtle'}
            size="sm"
            icon={RefreshCw}
            loading={loading}
            onClick={run}
          >
            {state.status === 'done' ? 'Régénérer' : buttonLabel}
          </Button>
        </div>
      </header>

      {loading && state.status !== 'done' && <SkeletonText lines={3} className="mt-4" />}

      {state.status === 'error' && (
        <div className="mt-4">
          <ErrorBanner message={state.error} onRetry={run} />
        </div>
      )}

      {state.status === 'done' && (
        <p className="mt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {state.text}
        </p>
      )}
    </section>
  )
}
