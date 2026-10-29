import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, ArrowDownRight, ArrowUpRight, Boxes, Database, Gauge, Layers, Sun } from 'lucide-react'

import { api } from '../api/client.js'
import { Badge, ClassBadge } from '../components/Badge.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { StatCard } from '../components/StatCard.jsx'
import { StatsSkeleton } from '../components/Skeleton.jsx'
import { useHealth } from '../hooks/useHealth.js'
import { useOntology } from '../hooks/useOntology.js'
import { getClassPalette } from '../utils/colors.js'
import { humanizeProperty } from '../utils/format.js'

/** Hiérarchie des classes (rdfs:subClassOf), filtrée côté client sur /api/classes. */
const HIERARCHY_QUERY = 'SELECT ?c ?parent WHERE { ?c rdfs:subClassOf ?parent }'

/** Nombre maximal de classes affichées sur l'axe des abscisses (lisibilité). */
const TOP_CLASSES = 12
const PRODUCTION_PROPERTY = 'aPourPuissance'
const CONSUMPTION_PROPERTY = 'aPourPuissanceConsommee'

function sumValues(result) {
  const subjectIndex = result.columns.indexOf('s')
  const valueIndex = result.columns.indexOf('value')
  const unique = new Map()
  for (const row of result.rows ?? []) {
    const value = Number(row[valueIndex])
    if (Number.isFinite(value)) unique.set(row[subjectIndex], value)
  }
  return [...unique.values()].reduce((sum, value) => sum + value, 0)
}

function formatMegawatts(value) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value)} MW`
}

/**
 * Nettoie un nom de propriété pour l'insérer dans un IRI SPARQL.
 * (Les noms viennent de l'ontologie : on écarte les caractères interdits.)
 */
function safeLocalName(name) {
  return String(name).replace(/[^A-Za-z0-9_-]/g, '')
}

export default function Dashboard() {
  const { data: health, status: healthStatus } = useHealth()
  const {
    classes,
    objectProperties,
    dataProperties,
    propertyRanges,
    numericDataProperties,
    loading: ontologyLoading,
    error: ontologyError,
    reload,
  } = useOntology()

  const [individuals, setIndividuals] = useState([])
  const [hierarchy, setHierarchy] = useState([])
  const [numericSeries, setNumericSeries] = useState([])
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [energyBalance, setEnergyBalance] = useState({ production: 0, consumption: 0 })
  const [balanceLoading, setBalanceLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Chargement des individus et de la hiérarchie des classes.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [individualList, hierarchyResult] = await Promise.all([
          api.individuals(),
          api.sparql(HIERARCHY_QUERY),
        ])
        if (cancelled) return
        setIndividuals(individualList ?? [])
        setHierarchy(hierarchyResult?.rows ?? [])
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const classSet = useMemo(() => new Set(classes), [classes])

  /** Nombre d'individus par classe, héritage inclus (comme le filtre /individuals). */
  const countsByClass = useMemo(() => {
    const parents = new Map()
    for (const [child, parent] of hierarchy) {
      // On ignore les nœuds anonymes et les classes hors ontologie.
      if (!classSet.has(child) || !classSet.has(parent)) continue
      if (!parents.has(child)) parents.set(child, new Set())
      parents.get(child).add(parent)
    }

    const cache = new Map()
    const ancestorsOf = (cls) => {
      if (cache.has(cls)) return cache.get(cls)
      const result = new Set([cls])
      const stack = [...(parents.get(cls) ?? [])]
      while (stack.length > 0) {
        const current = stack.pop()
        if (result.has(current)) continue
        result.add(current)
        stack.push(...(parents.get(current) ?? []))
      }
      cache.set(cls, result)
      return result
    }

    const counts = new Map()
    for (const individual of individuals) {
      // Un individu n'est compté qu'une fois par classe, même s'il est multi-typé.
      const reached = new Set()
      for (const type of individual.types ?? []) {
        for (const ancestor of ancestorsOf(type)) reached.add(ancestor)
      }
      for (const cls of reached) {
        if (classSet.has(cls)) counts.set(cls, (counts.get(cls) ?? 0) + 1)
      }
    }
    return counts
  }, [individuals, hierarchy, classSet])

  /** Séries pour le graphique « individus par classe ». */
  const classChartData = useMemo(() => {
    return classes
      .map((cls) => ({ name: cls, count: countsByClass.get(cls) ?? 0 }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [classes, countsByClass])

  /** Chargement des valeurs des DataProperties numériques. */
  useEffect(() => {
    const namespace = health?.namespace
    if (!namespace || numericDataProperties.length === 0) {
      setNumericSeries([])
      return undefined
    }

    let cancelled = false
    setNumericSeries([])

    Promise.all(
      numericDataProperties.map(async (property) => {
        const local = safeLocalName(property)
        if (!local) return { property, points: [] }
        try {
          const result = await api.sparql(
            `SELECT ?s ?v WHERE { ?s <${namespace}${local}> ?v }`,
          )
          const subjectIndex = result.columns.indexOf('s')
          const valueIndex = result.columns.indexOf('v')
          const points = result.rows
            .map((row) => ({
              name: row[subjectIndex],
              value: Number(row[valueIndex]),
            }))
            .filter((point) => Number.isFinite(point.value))
          return { property, points }
        } catch {
          return { property, points: [] }
        }
      }),
    )
      .then((series) => {
        if (cancelled) return
        setNumericSeries(series)
        // On affiche par défaut la propriété la plus renseignée.
        const richest = [...series].sort((a, b) => b.points.length - a.points.length)[0]
        setSelectedProperty((current) => current ?? richest?.property ?? null)
      })
      .catch(() => {
        if (!cancelled) setNumericSeries([])
      })

    return () => {
      cancelled = true
    }
  }, [health?.namespace, numericDataProperties])

  const activeSeries = useMemo(
    () => numericSeries.find((series) => series.property === selectedProperty) ?? null,
    [numericSeries, selectedProperty],
  )

  const totalTriplets = health?.triples ?? 0
  const namespace = health?.namespace ?? ''

  // Le bilan additionne les puissances déclarées sur les centrales et consommateurs.
  useEffect(() => {
    if (!namespace) return undefined
    let cancelled = false
    setBalanceLoading(true)
    const query = (property, className) => `SELECT ?s ?value WHERE {
      ?s rdf:type ?type .
      ?type rdfs:subClassOf* <${namespace}${className}> .
      ?s <${namespace}${property}> ?value .
    }`
    Promise.all([
      api.sparql(query(PRODUCTION_PROPERTY, 'Centrale')),
      api.sparql(query(CONSUMPTION_PROPERTY, 'Consommateur')),
    ])
      .then(([production, consumption]) => {
        if (!cancelled) setEnergyBalance({ production: sumValues(production), consumption: sumValues(consumption) })
      })
      .catch(() => {
        if (!cancelled) setEnergyBalance({ production: 0, consumption: 0 })
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false)
      })
    return () => { cancelled = true }
  }, [namespace])

  const netBalance = energyBalance.production - energyBalance.consumption
  const balanceChartData = [
    { name: 'Puissance', production: energyBalance.production, consumption: energyBalance.consumption },
  ]
  const consumptionMissing = !balanceLoading && energyBalance.consumption === 0

  const statCards = [
    { icon: Database, label: 'Triplets dans le graphe', value: totalTriplets, tone: 'brand', hint: 'GET /health' },
    { icon: Layers, label: 'Classes de l’ontologie', value: classes.length, tone: 'sky', hint: 'GET /classes' },
    { icon: Boxes, label: 'Individus', value: individuals.length, tone: 'violet', hint: 'GET /individuals' },
    {
      icon: Activity,
      label: 'Propriétés',
      value: objectProperties.length + dataProperties.length,
      tone: 'amber',
      hint: `${objectProperties.length} relations · ${dataProperties.length} valeurs`,
    },
  ]

  const loadingCards = loading || ontologyLoading || healthStatus === 'pending'

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {ontologyError && <ErrorBanner message={ontologyError} onRetry={reload} />}

      {/* Cartes de statistiques */}
      {loadingCards ? (
        <StatsSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>
      )}

      {/* Bilan production / consommation */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Bilan production / consommation</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Somme des puissances déclarées dans l’ontologie, en MW.</p>
          </div>
          <Badge tone={consumptionMissing ? 'warning' : netBalance >= 0 ? 'success' : 'danger'}>
            {consumptionMissing ? 'Consommation non renseignée' : netBalance >= 0 ? 'Production excédentaire' : 'Déficit de production'}
          </Badge>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Production totale</p>
            <p className="mt-2 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{balanceLoading ? '…' : formatMegawatts(energyBalance.production)}</p>
          </div>
          <div className="rounded-xl bg-sky-50 p-4 dark:bg-sky-500/10">
            <p className="text-xs font-medium text-sky-700 dark:text-sky-300">Consommation totale</p>
            <p className="mt-2 text-2xl font-bold text-sky-800 dark:text-sky-200">{balanceLoading ? '…' : formatMegawatts(energyBalance.consumption)}</p>
          </div>
          <div className={`rounded-xl p-4 ${netBalance >= 0 ? 'bg-brand-50 dark:bg-brand-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Solde (production − consommation)</p>
            <p className={`mt-2 flex items-center gap-1 text-2xl font-bold ${netBalance >= 0 ? 'text-brand-800 dark:text-brand-200' : 'text-rose-800 dark:text-rose-200'}`}>
              {netBalance >= 0 ? <ArrowUpRight className="size-5" aria-hidden="true" /> : <ArrowDownRight className="size-5" aria-hidden="true" />}
              {balanceLoading ? '…' : formatMegawatts(netBalance)}
            </p>
          </div>
        </div>

        <div className="mt-5 h-64">
          {balanceLoading ? (
            <div className="h-full animate-pulse-soft rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={balanceChartData} barGap={12} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-slate-500 dark:text-slate-400" />
                <YAxis tick={{ fontSize: 11 }} width={55} unit=" MW" />
                <Tooltip formatter={(value) => formatMegawatts(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid rgb(226 232 240)', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="production" name="Production" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={90} />
                <Bar dataKey="consumption" name="Consommation" fill="#0ea5e9" radius={[6, 6, 0, 0]} maxBarSize={90} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Les puissances consommées dans les données fournies sont illustratives et doivent être remplacées par des mesures réelles.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Nombre d'individus par classe */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 xl:col-span-2 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Individus par classe
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Comptage avec héritage des sous-classes (GROUP BY sur rdf:type).
                {classChartData.length > TOP_CLASSES && (
                  <span className="ml-1 text-slate-400">
                    — {TOP_CLASSES} classes les plus peuplées affichées sur {classChartData.length}.
                  </span>
                )}
              </p>
            </div>
            <Badge tone="brand">{classChartData.length} classes</Badge>
          </header>

          {loading ? (
            <div className="h-72 animate-pulse-soft rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          ) : classChartData.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Aucune classe peuplée"
              description="L’ontologie ne contient encore aucun individu typé."
            />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classChartData.slice(0, TOP_CLASSES)} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-slate-500 dark:text-slate-400"
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    cursor={{ fill: 'rgba(20, 184, 166, 0.08)' }}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid rgb(226 232 240)',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" name="Individus" radius={[6, 6, 0, 0]} maxBarSize={46}>
                    {classChartData.slice(0, TOP_CLASSES).map((entry) => (
                      <Cell key={entry.name} fill={getClassPalette(entry.name).hex} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Répartition par famille de classes */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
          <header className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Répartition</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Classes les plus peuplées de l’ontologie.
            </p>
          </header>

          {loading ? (
            <div className="h-64 animate-pulse-soft rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          ) : classChartData.length === 0 ? (
            <EmptyState icon={Gauge} title="Aucune donnée" />
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={classChartData.slice(0, 8)}
                      dataKey="count"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {classChartData.slice(0, 8).map((entry) => (
                        <Cell key={entry.name} fill={getClassPalette(entry.name).hex} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid rgb(226 232 240)',
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="mt-4 space-y-2">
                {classChartData.slice(0, 6).map((entry) => (
                  <li key={entry.name} className="flex items-center justify-between gap-3">
                    <ClassBadge name={entry.name} size="sm" showDot />
                    <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {entry.count}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Valeurs d'une DataProperty numérique */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 xl:col-span-2 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Valeurs numériques
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Capacité, puissance ou niveau de charge déclarés dans l’ontologie.
              </p>
            </div>
            {numericSeries.length > 1 && (
              <select
                aria-label="Propriété numérique"
                value={selectedProperty ?? ''}
                onChange={(event) => setSelectedProperty(event.target.value)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200"
              >
                {numericSeries.map((series) => (
                  <option key={series.property} value={series.property}>
                    {humanizeProperty(series.property)}
                  </option>
                ))}
              </select>
            )}
          </header>

          {!loading && activeSeries && activeSeries.points.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeSeries.points}
                  margin={{ top: 4, right: 8, bottom: 4, left: -18 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    className="text-slate-500 dark:text-slate-400"
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    cursor={{ fill: 'rgba(20, 184, 166, 0.08)' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid rgb(226 232 240)', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" name={humanizeProperty(activeSeries.property)} fill="#14b8a6" radius={[6, 6, 0, 0]} maxBarSize={52} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : !loading ? (
            <EmptyState
              icon={Sun}
              title="Aucune valeur numérique"
              description="Aucune DataProperty numérique (capacité, puissance…) n’est renseignée pour l’instant."
            />
          ) : (
            <div className="h-72 animate-pulse-soft rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          )}
        </section>

        {/* Métadonnées de l'ontologie */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
          <header className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Ontologie</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Propriétés déclarées et espace de noms.
            </p>
          </header>

          <dl className="space-y-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Espace de noms
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-slate-700 dark:text-slate-300">
                {namespace || '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Relations (ObjectProperty)
              </dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {objectProperties.length === 0 ? (
                  <span className="text-xs text-slate-400">Aucune</span>
                ) : (
                  objectProperties.map((property) => (
                    <Badge key={property} tone="info">
                      {property}
                    </Badge>
                  ))
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Valeurs (DataProperty)
              </dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {dataProperties.length === 0 ? (
                  <span className="text-xs text-slate-400">Aucune</span>
                ) : (
                  dataProperties.map((property) => (
                    <Badge key={property} tone="success">
                      {property}
                      {propertyRanges[property] && (
                        <span className="font-mono text-[10px] opacity-70">
                          {String(propertyRanges[property]).split('#').pop()}
                        </span>
                      )}
                    </Badge>
                  ))
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  )
}
