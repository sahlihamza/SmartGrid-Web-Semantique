import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { Info, Network, TriangleAlert } from 'lucide-react'

import { api } from '../api/client.js'
import { Badge, ClassBadge } from '../components/Badge.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { Skeleton } from '../components/Skeleton.jsx'
import { getClassPalette } from '../utils/colors.js'
import { layoutGraph } from '../utils/layout.js'
import { classNames } from '../utils/format.js'

import '@xyflow/react/dist/style.css'

/**
 * Requête de la spécification : toutes les relations entre deux individus.
 * (Le type rdf:type est exclu : il ne s'agit pas d'une relation.)
 */
const EDGES_QUERY = `SELECT ?s ?p ?o WHERE {
  ?s a owl:NamedIndividual .
  ?o a owl:NamedIndividual .
  ?s ?p ?o .
  FILTER(?p != rdf:type)
}`

/** Nœud personnalisé : couleur selon la classe, nom et libellé de classe. */
function IndividualNode({ data, selected }) {
  return (
    <div
      className={classNames(
        'min-w-[156px] rounded-xl border-2 bg-white px-3 py-2 shadow-md transition dark:bg-slate-900',
        selected ? 'ring-4 ring-brand-500/25' : '',
      )}
      style={{ borderColor: data.color }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: data.color, width: 8, height: 8, border: 'none' }}
      />
      <div className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: data.color }} />
        <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
          {data.label}
        </span>
      </div>
      {data.className && (
        <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
          {data.className}
        </p>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: data.color, width: 8, height: 8, border: 'none' }}
      />
    </div>
  )
}

const nodeTypes = { individual: IndividualNode }

export default function Reseau() {
  const navigate = useNavigate()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hiddenClasses, setHiddenClasses] = useState(() => new Set())

  /** Chargement des individus (nœuds) et des relations (arêtes). */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [individualList, edgeResult] = await Promise.all([
        api.individuals(),
        api.sparql(EDGES_QUERY),
      ])

      const individualNodes = (individualList ?? []).map((individual) => {
        const className = individual.types?.[0] ?? ''
        return {
          id: individual.name,
          name: individual.name,
          className,
          color: getClassPalette(className).hex,
        }
      })

      const sourceIndex = edgeResult.columns.indexOf('s')
      const propertyIndex = edgeResult.columns.indexOf('p')
      const targetIndex = edgeResult.columns.indexOf('o')

      const edgeList = (edgeResult.rows ?? [])
        .filter(
          (row) =>
            individualNodes.some((node) => node.id === row[sourceIndex]) &&
            individualNodes.some((node) => node.id === row[targetIndex]),
        )
        .map((row, index) => ({
          id: `${row[sourceIndex]}-${row[propertyIndex]}-${row[targetIndex]}-${index}`,
          source: row[sourceIndex],
          target: row[targetIndex],
          property: row[propertyIndex],
        }))

      setGraphData({ nodes: individualNodes, edges: edgeList })
    } catch (loadError) {
      setError(loadError.message)
      setGraphData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /** Classes présentes dans le graphe, pour la légende et le filtre. */
  const presentClasses = useMemo(() => {
    const counts = new Map()
    for (const node of graphData?.nodes ?? []) {
      if (!node.className) continue
      counts.set(node.className, (counts.get(node.className) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [graphData])

  const visibleNodes = useMemo(
    () => (graphData?.nodes ?? []).filter((node) => !hiddenClasses.has(node.className)),
    [graphData, hiddenClasses],
  )

  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleNodes.map((node) => node.id))
    return (graphData?.edges ?? []).filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    )
  }, [graphData, visibleNodes])

  /** Application de la mise en page et conversion au format React Flow. */
  useEffect(() => {
    if (!graphData) return

    const positions = layoutGraph(visibleNodes, visibleEdges, { width: 1200, height: 700 })
    const positionById = new Map(positions.map((position) => [position.id, position]))

    setNodes(
      visibleNodes.map((node) => ({
        id: node.id,
        type: 'individual',
        position: positionById.get(node.id) ?? { x: 0, y: 0 },
        data: { label: node.name, className: node.className, color: node.color },
      })),
    )

    setEdges(
      visibleEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.property,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 1.6 },
        labelStyle: { fontSize: 10, fill: '#64748b', fontWeight: 500 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
      })),
    )
  }, [graphData, visibleNodes, visibleEdges, setNodes, setEdges])

  const toggleClass = (className) => {
    setHiddenClasses((current) => {
      const next = new Set(current)
      if (next.has(className)) next.delete(className)
      else next.add(className)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid gap-4 xl:grid-cols-4">
        {/* Panneau de filtres */}
        <aside className="space-y-4 xl:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Légende & filtres</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cliquez sur une classe pour l’afficher ou la masquer.
            </p>

            {loading ? (
              <div className="mt-4 space-y-2">
                {[0, 1, 2, 3, 4].map((index) => (
                  <Skeleton key={index} className="h-7 w-full" />
                ))}
              </div>
            ) : presentClasses.length === 0 ? (
              <p className="mt-4 text-xs text-slate-400">Aucune classe détectée.</p>
            ) : (
              <ul className="mt-4 space-y-1.5">
                {presentClasses.map((item) => {
                  const palette = getClassPalette(item.name)
                  const hidden = hiddenClasses.has(item.name)
                  return (
                    <li key={item.name}>
                      <button
                        type="button"
                        onClick={() => toggleClass(item.name)}
                        aria-pressed={!hidden}
                        className={classNames(
                          'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition',
                          hidden
                            ? 'text-slate-400 opacity-60'
                            : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: palette.hex }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-slate-400">{item.count}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {presentClasses.length > 0 && (
              <button
                type="button"
                onClick={() => setHiddenClasses(new Set())}
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Tout afficher
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Statistiques</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Nœuds</dt>
                <dd className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {visibleNodes.length}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Relations</dt>
                <dd className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {visibleEdges.length}
                </dd>
              </div>
            </dl>
          </div>
        </aside>

        {/* Graphe */}
        <section className="xl:col-span-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
            {loading ? (
              <div className="h-[640px] animate-pulse-soft bg-slate-100 dark:bg-slate-800/50" />
            ) : graphData && graphData.nodes.length === 0 ? (
              <EmptyState
                icon={Network}
                title="Aucun individu à afficher"
                description="L’ontologie ne contient aucun individu."
              />
            ) : (
              <div className="h-[640px]">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={(_, node) => navigate(`/equipements/${encodeURIComponent(node.id)}`)}
                  fitView
                  fitViewOptions={{ padding: 0.25 }}
                  minZoom={0.15}
                  maxZoom={2.5}
                >
                  <Background variant={BackgroundVariant.Dots} gap={18} size={1} className="!bg-slate-50 dark:!bg-slate-950" />
                  <Controls showInteractive={false} />
                  <MiniMap
                    pannable
                    zoomable
                    nodeColor={(node) => node.data?.color ?? '#94a3b8'}
                    maskColor="rgba(148, 163, 184, 0.12)"
                  />
                </ReactFlow>
              </div>
            )}
          </div>

          {/* Information sur l'absence de relations */}
          {!loading && graphData && graphData.edges.length === 0 && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Aucune relation entre individus dans l’ontologie
                </p>
                <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-300/90">
                  Les {graphData.nodes.length} individus sont affichés, mais aucune ObjectProperty ne
                  relie deux d’entre eux : l’ontologie décrit le schéma (domaine / plage) sans
                  encore d’instances de relations. Ajoutez par exemple une relation
                  <span className="font-mono"> estConnecteA </span>
                  depuis la page Équipements pour voir apparaître une arête.
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Cliquez sur un nœud pour ouvrir la fiche de l’individu. Utilisez la molette pour
              zoomer et glissez pour déplacer la vue.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
