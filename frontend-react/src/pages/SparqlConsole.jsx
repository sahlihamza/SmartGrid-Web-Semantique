import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleCheck, CircleX, Download, Play, RotateCcw, Terminal } from 'lucide-react'

import { api, downloadBlob } from '../api/client.js'
import { Badge } from '../components/Badge.jsx'
import { Button } from '../components/Button.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { classNames } from '../utils/format.js'

/** Requêtes d'exemple cliquables. */
const EXAMPLES = [
  {
    label: 'Tous les individus',
    description: 'Liste les ressources typées owl:NamedIndividual.',
    query: `SELECT ?s WHERE {
  ?s a owl:NamedIndividual
}
ORDER BY ?s
LIMIT 50`,
  },
  {
    label: 'Individus par classe',
    description: 'Compte les individus de chaque classe de l’ontologie.',
    query: `SELECT ?t (COUNT(DISTINCT ?i) AS ?n) WHERE {
  ?i a ?t .
  ?t a owl:Class .
  FILTER(STRSTARTS(STR(?t), "http://www.StackMasters.tn/smartgrid#"))
}
GROUP BY ?t
ORDER BY DESC(?n)`,
  },
  {
    label: 'Filtrer par nom',
    description: 'Recherche toutes les propriétés contenant « batterie ».',
    query: `SELECT ?s ?p ?o WHERE {
  ?s ?p ?o .
  FILTER(CONTAINS(LCASE(STR(?s)), "batterie"))
}`,
  },
  {
    label: 'Batteries et leur capacité',
    description: 'Propriétés numériques des batteries de l’ontologie.',
    query: `SELECT ?s ?cap ?charge WHERE {
  ?s a sg:Batterie .
  OPTIONAL { ?s sg:aPourCapacite ?cap }
  OPTIONAL { ?s sg:aPourNiveauCharge ?charge }
}`,
  },
  {
    label: 'Relations entre individus',
    description: 'Toutes les ObjectProperty reliant deux individus.',
    query: `SELECT ?s ?p ?o WHERE {
  ?s a owl:NamedIndividual .
  ?o a owl:NamedIndividual .
  ?s ?p ?o .
  FILTER(?p != rdf:type)
}`,
  },
  {
    label: 'Question fermée (ASK)',
    description: 'Vérifie l’existence d’une batterie dans l’ontologie.',
    query: `ASK {
  ?s a sg:Batterie
}`,
  },
]

/**
 * Le back-end utilise rdflib. Sur la version installée (rdflib 7.6.0 avec
 * pyparsing >= 3.3), l'analyse de la clause LIMIT échoue avec une erreur
 * interne du parseur Python — indépendamment de la requête envoyée
 * (OFFSET, ORDER BY, GROUP BY et ASK fonctionnent normalement).
 * On détecte ce cas précis pour expliquer la cause réelle à l'utilisateur
 * plutôt que d'afficher une obscure erreur de type Python.
 */
function describeError(message) {
  const text = String(message ?? '')
  const isParserFailure = /postParse2|tokenList|Param\./i.test(text)

  if (isParserFailure && /\bLIMIT\b/i.test(text)) {
    return {
      message: text,
      hint:
        "Cette erreur ne vient pas de la requête : la version de rdflib installée côté serveur " +
        "(rdflib 7.6.0 avec pyparsing ≥ 3.3) n'arrive pas à analyser la clause LIMIT. " +
        'Le correctif est côté back-end : installer pyparsing<3.3 dans le venv, ou mettre rdflib à jour.',
    }
  }

  return { message: text, hint: null }
}

/**
 * Console SPARQL : éditeur, exécution et affichage tabulaire des résultats.
 */
export default function SparqlConsole() {
  const [query, setQuery] = useState(EXAMPLES[0].query)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)

  const execute = useCallback(async (queryToRun) => {
    const statement = (queryToRun ?? query).trim()
    if (!statement) {
      setError('La requête est vide.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await api.sparql(statement)
      setResult(data)
    } catch (executeError) {
      setError(describeError(executeError.message))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [query])

  // Exécution au montage avec la requête par défaut.
  useEffect(() => {
    execute(EXAMPLES[0].query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runExample = (example) => {
    setQuery(example.query)
    execute(example.query)
  }

  const reset = () => {
    setQuery(EXAMPLES[0].query)
    setResult(null)
    setError(null)
    textareaRef.current?.focus()
  }
  const rowCount = result?.rows?.length ?? 0
  const columnCount = result?.columns?.length ?? 0

  const exportCsv = () => {
    if (!result?.columns || !result?.rows) return
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const lines = [result.columns, ...result.rows].map((row) => row.map(escape).join(','))
    downloadBlob(new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), 'resultat-sparql.csv')
  }

  return (
    <div className="space-y-4">
      {/* Exemples */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Requêtes d’exemple</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => runExample(example)}
              title={example.description}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      {/* Éditeur */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Requête SPARQL</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset}>
              Réinitialiser
            </Button>
            <Button size="sm" icon={Play} loading={loading} onClick={() => execute()}>
              Exécuter
            </Button>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl+Entrée exécute la requête.
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              execute()
            }
          }}
          spellCheck={false}
          rows={10}
          aria-label="Requête SPARQL"
          className="w-full resize-y bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-200"
          placeholder="SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"
        />

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-400 dark:border-slate-800">
          <span>Ctrl + Entrée pour exécuter</span>
          <span>
            Préfixes déjà définis côté serveur : <code className="font-mono">sg:</code>,{' '}
            <code className="font-mono">rdf:</code>, <code className="font-mono">rdfs:</code>,{' '}
            <code className="font-mono">owl:</code>, <code className="font-mono">xsd:</code>
          </span>
        </div>
      </div>

      {error && (
        <div className="space-y-2">
          <ErrorBanner message={error.message} />
          {error.hint && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {error.hint}
            </p>
          )}
        </div>
      )}

      {/* Résultat */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Résultat</h3>
          {result && !loading && (
            <div className="flex items-center gap-2">
              {Array.isArray(result.rows) && (
                <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv}>Exporter CSV</Button>
              )}
              {typeof result.ask === 'boolean' ? (
                <Badge tone={result.ask ? 'success' : 'danger'} icon={result.ask ? CircleCheck : CircleX}>
                  {result.ask ? 'Vrai' : 'Faux'}
                </Badge>
              ) : (
                <Badge tone="brand">
                  {rowCount} ligne{rowCount > 1 ? 's' : ''} · {columnCount} colonne
                  {columnCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="h-4 animate-pulse-soft rounded bg-slate-100 dark:bg-slate-800/70" />
            ))}
          </div>
        ) : !result ? (
          <EmptyState
            icon={Terminal}
            title="Aucun résultat"
            description="Exécutez une requête pour afficher les données du graphe."
          />
        ) : typeof result.ask === 'boolean' ? (
          <div className="flex items-center gap-3 px-4 py-6">
            {result.ask ? (
              <CircleCheck className="size-6 text-emerald-500" aria-hidden="true" />
            ) : (
              <CircleX className="size-6 text-rose-500" aria-hidden="true" />
            )}
            <p className="text-sm text-slate-700 dark:text-slate-200">
              La requête ASK a répondu{' '}
              <span className="font-semibold">{result.ask ? '« vrai »' : '« faux »'}</span>.
            </p>
          </div>
        ) : result.rows.length === 0 ? (
          <EmptyState
            icon={Terminal}
            title="Aucun résultat"
            description="La requête s’est exécutée correctement mais n’a retourné aucune ligne."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  {result.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {result.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${rowIndex}-${cellIndex}`}
                        className={classNames(
                          'px-4 py-2.5 font-mono text-[13px] text-slate-700 dark:text-slate-300',
                          cell === null && 'italic text-slate-400',
                        )}
                      >
                        {cell === null ? '—' : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
