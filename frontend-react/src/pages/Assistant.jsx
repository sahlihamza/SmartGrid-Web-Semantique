import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, CircleX, Code, Copy, Info, Send, Sparkles } from 'lucide-react'

import { askQuestion } from '../api/client.js'
import { Badge } from '../components/Badge.jsx'
import { Button } from '../components/Button.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { useToast } from '../components/Toast.jsx'
import { classNames } from '../utils/format.js'

/** Questions proposées à l'utilisateur. */
const SUGGESTIONS = [
  'Quels sont les équipements de production solaire ?',
  'Quelle est la capacité de la batterie Tesla ?',
  'Quels individus sont pilotés par STEG ?',
  'Combien y a-t-il de centrales éoliennes ?',
  'Liste les consommateurs du réseau.',
]

/** Une entrée de conversation. */
let messageSequence = 0
const nextMessageId = () => {
  messageSequence += 1
  return `msg-${messageSequence}`
}

/**
 * Assistant : interface de chat qui traduit une question en requête SPARQL.
 *
 * La route POST /ask n'est pas encore livrée par le back-end (module NLP) :
 * tant qu'elle renvoie un 404, l'interface affiche un message explicite.
 */
export default function Assistant() {
  const toast = useToast()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [moduleUnavailable, setModuleUnavailable] = useState(false)
  const bottomRef = useRef(null)
  // Garde-fou : évite d'envoyer deux fois la même question si l'utilisateur
  // double-clique (l'état `loading` n'est mis à jour qu'au rendu suivant).
  const sendingRef = useRef(false)

  // Défilement automatique vers le dernier message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  const send = async (question) => {
    const text = question.trim()
    if (!text || sendingRef.current) return

    sendingRef.current = true
    setInput('')
    setMessages((current) => [
      ...current,
      { id: nextMessageId(), role: 'user', content: text },
    ])
    setLoading(true)

    try {
      const response = await askQuestion(text)

      if (!response.ok) {
        // Module NLP pas encore livré : on le dit clairement, sans planter.
        setModuleUnavailable(true)
        setMessages((current) => [
          ...current,
          {
            id: nextMessageId(),
            role: 'assistant',
            unavailable: true,
            content: response.message ?? 'Module NLP pas encore disponible.',
          },
        ])
        return
      }

      setModuleUnavailable(false)
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: 'assistant',
          sparql: response.sparql,
          result: response.result,
        },
      ])
    } catch (error) {
      toast.error(error.message)
      setMessages((current) => [
        ...current,
        { id: nextMessageId(), role: 'assistant', error: true, content: error.message },
      ])
    } finally {
      sendingRef.current = false
      setLoading(false)
    }
  }

  const copySparql = async (sparql) => {
    try {
      await navigator.clipboard.writeText(sparql)
      toast.success('Requête SPARQL copiée dans le presse-papiers.')
    } catch {
      toast.error('Impossible de copier dans le presse-papiers.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Avertissement module NLP indisponible */}
      {moduleUnavailable && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <Info className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Module NLP pas encore disponible
            </p>
            <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-300/90">
              La route <code className="font-mono">POST /ask</code> n’est pas encore exposée par le
              back-end. L’interface est prête : dès que le module de traduction
              question → SPARQL sera livré, les réponses s’afficheront ici. En attendant, la{' '}
              <Link to="/sparql" className="font-semibold underline underline-offset-2">
                console SPARQL
              </Link>{' '}
              permet d’interroger le graphe directement.
            </p>
          </div>
        </div>
      )}

      {/* Zone de conversation */}
      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 && !loading && (
            <EmptyState
              icon={Sparkles}
              title="Posez votre question"
              description="L’assistant transforme votre question en requête SPARQL et affiche le résultat directement dans l’ontologie."
            />
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={classNames('flex gap-3', message.role === 'user' && 'flex-row-reverse')}
            >
              {message.role === 'assistant' && (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                  <Sparkles className="size-4" aria-hidden="true" />
                </span>
              )}

              <div className={classNames('min-w-0 max-w-[85%]', message.role === 'user' && 'text-right')}>
                {message.role === 'user' ? (
                  <div className="inline-block rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm text-white dark:bg-brand-500 dark:text-brand-950">
                    {message.content}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {message.unavailable && (
                      <div className="inline-flex items-start gap-2 rounded-2xl rounded-tl-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>{message.content}</span>
                      </div>
                    )}

                    {message.error && (
                      <div className="inline-flex items-start gap-2 rounded-2xl rounded-tl-sm border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                        <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>{message.content}</span>
                      </div>
                    )}

                    {message.sparql && (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/60">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <Code className="size-3.5" aria-hidden="true" />
                            Requête SPARQL générée
                          </span>
                          <button
                            type="button"
                            onClick={() => copySparql(message.sparql)}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                          >
                            <Copy className="size-3" aria-hidden="true" />
                            Copier
                          </button>
                        </div>
                        <pre className="scrollbar-thin overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-300">
                          {message.sparql}
                        </pre>
                      </div>
                    )}

                    {message.result && (
                      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Résultat
                          </span>
                          <Badge tone="brand">
                            {message.result.rows?.length ?? 0} ligne
                            {(message.result.rows?.length ?? 0) > 1 ? 's' : ''}
                          </Badge>
                        </div>
                        {message.result.rows?.length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                  {message.result.columns.map((column) => (
                                    <th
                                      key={column}
                                      scope="col"
                                      className="px-3 py-2 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400"
                                    >
                                      {column}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/70">
                                {message.result.rows.map((row, rowIndex) => (
                                  <tr key={rowIndex}>
                                    {row.map((cell, cellIndex) => (
                                      <td
                                        key={`${rowIndex}-${cellIndex}`}
                                        className="px-3 py-2 font-mono text-[12.5px] text-slate-700 dark:text-slate-300"
                                      >
                                        {cell === null ? '—' : cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                            La requête n’a retourné aucune ligne.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 dark:bg-slate-800">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className="size-1.5 animate-pulse-soft rounded-full bg-slate-400"
                    style={{ animationDelay: `${index * 160}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Zone de saisie */}
        <div className="border-t border-slate-200 bg-slate-50/70 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-950/30">
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={loading}
                onClick={() => send(suggestion)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // Entrée envoie, Maj+Entrée passe à la ligne.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send(input)
                }
              }}
              rows={1}
              placeholder="Posez une question sur l’ontologie Smart Grid…"
              aria-label="Votre question"
              className="scrollbar-thin max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
            />
            <Button type="submit" icon={Send} loading={loading} disabled={!input.trim()} className="h-[42px]">
              Envoyer
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
