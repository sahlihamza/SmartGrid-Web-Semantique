import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Download, Eye, FileUp, Pencil, Plus, Search, Trash2 } from 'lucide-react'

import { api, downloadBlob } from '../api/client.js'
import { Badge, ClassBadge } from '../components/Badge.jsx'
import { Button, IconButton } from '../components/Button.jsx'
import { ConfirmDialog } from '../components/ConfirmDialog.jsx'
import { DataTable } from '../components/DataTable.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { IndividualForm } from '../components/IndividualForm.jsx'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import { useOntology } from '../hooks/useOntology.js'
import { useToast } from '../components/Toast.jsx'
import { extractTypes } from '../utils/format.js'

/**
 * Page « Équipements » : liste des individus de l'ontologie avec recherche,
 * filtre par classe, et actions de création / modification / suppression.
 */
export default function Equipements() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    classes,
    objectProperties,
    dataProperties,
    propertyRanges,
    numericDataProperties,
  } = useOntology()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const [individuals, setIndividuals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('create')
  const [formIndividual, setFormIndividual] = useState(null)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [importing, setImporting] = useState(false)

  /** Chargement de la liste (le filtrage est fait par le back-end). */
  const loadIndividuals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.individuals({
        search: debouncedSearch.trim() || undefined,
        type: typeFilter || undefined,
      })
      setIndividuals(data ?? [])
    } catch (loadError) {
      setError(loadError.message)
      setIndividuals([])
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, typeFilter])

  useEffect(() => {
    loadIndividuals()
  }, [loadIndividuals])

  const openCreate = () => {
    setFormMode('create')
    setFormIndividual(null)
    setFormOpen(true)
  }

  const openEdit = async (name) => {
    try {
      const detail = await api.individual(name)
      setFormMode('edit')
      setFormIndividual({
        name: detail.name,
        types: extractTypes(detail.properties),
        properties: detail.properties,
      })
      setFormOpen(true)
    } catch (loadError) {
      toast.error(loadError.message)
    }
  }

  /** Envoi du formulaire (création ou modification). */
  const handleSubmit = async (payload) => {
    try {
      if (formMode === 'edit') {
        await api.updateIndividual(payload.name, payload.properties)
        toast.success(`« ${payload.name} » a été mis à jour.`)
      } else {
        await api.createIndividual(payload)
        toast.success(`« ${payload.name} » a été créé.`)
      }
      setFormOpen(false)
      await loadIndividuals()
    } catch (submitError) {
      toast.error(submitError.message)
      // L'erreur est renvoyée au formulaire pour être affichée sous le champ concerné.
      throw submitError
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteIndividual(deleteTarget.name)
      toast.success(`« ${deleteTarget.name} » a été supprimé.`)
      setDeleteTarget(null)
      await loadIndividuals()
    } catch (deleteError) {
      toast.error(deleteError.message)
    } finally {
      setDeleting(false)
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Nom',
        render: (row) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/equipements/${encodeURIComponent(row.name)}`)
            }}
            className="font-semibold text-slate-900 underline-offset-4 transition hover:text-brand-700 hover:underline dark:text-white dark:hover:text-brand-300"
          >
            {row.name}
          </button>
        ),
      },
      {
        key: 'types',
        header: 'Classes',
        render: (row) => (
          <div className="flex flex-wrap gap-1.5">
            {(row.types ?? []).length === 0 ? (
              <span className="text-xs text-slate-400">—</span>
            ) : (
              row.types.map((type) => <ClassBadge key={type} name={type} size="sm" showDot />)
            )}
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        width: '140px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            <IconButton
              icon={Eye}
              label={`Voir ${row.name}`}
              onClick={() => navigate(`/equipements/${encodeURIComponent(row.name)}`)}
            />
            <IconButton icon={Pencil} label={`Modifier ${row.name}`} onClick={() => openEdit(row.name)} />
            <IconButton
              icon={Trash2}
              label={`Supprimer ${row.name}`}
              className="text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
              onClick={() => setDeleteTarget(row)}
            />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate],
  )

  const hasFilters = Boolean(search.trim() || typeFilter)

  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const result = await api.importCsv(file)
      toast.success(result.message)
      await loadIndividuals()
    } catch (importError) {
      const details = importError.payload?.details
      toast.error([importError.message, ...(details ?? [])].join(' '))
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const headers = ['name', 'type', ...objectProperties, ...dataProperties]
    downloadBlob(new Blob([`\uFEFF${headers.join(',')}\r\n`], { type: 'text/csv;charset=utf-8' }), 'modele-smartgrid.csv')
  }

  const exportOntology = async (format) => {
    try {
      const blob = await api.exportOntology(format)
      downloadBlob(blob, `smartgrid.${format === 'rdfxml' ? 'rdf' : 'ttl'}`)
    } catch (exportError) {
      toast.error(exportError.message)
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onRetry={loadIndividuals} />}

      {/* Barre d'actions */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un équipement par nom…"
            aria-label="Rechercher un équipement"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Filtrer par classe"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200"
          >
            <option value="">Toutes les classes</option>
            {classes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <Button icon={Plus} onClick={openCreate}>
            Ajouter
          </Button>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Import / export</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">CSV : colonnes name, type, puis propriétés. Séparez plusieurs classes ou valeurs par |.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white hover:bg-brand-700 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50">
            <FileUp className="size-4" aria-hidden="true" />
            {importing ? 'Import…' : 'Importer CSV'}
            <input type="file" accept=".csv,text/csv" className="sr-only" disabled={importing} onChange={handleImport} />
          </label>
          <Button variant="secondary" size="sm" icon={Download} onClick={downloadTemplate}>Modèle CSV</Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={() => exportOntology('turtle')}>Exporter Turtle</Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={() => exportOntology('rdfxml')}>Exporter RDF/XML</Button>
        </div>
      </section>

      {/* Résumé */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">
          {loading ? 'Chargement…' : `${individuals.length} individu${individuals.length > 1 ? 's' : ''}`}
        </Badge>
        {typeFilter && <ClassBadge name={typeFilter} size="sm" showDot />}
        {search.trim() && (
          <Badge tone="neutral">
            recherche : « {search.trim()} »
          </Badge>
        )}
      </div>

      {/* Tableau */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <DataTable
          columns={columns}
          rows={individuals}
          loading={loading}
          rowKey={(row) => row.name}
          empty={
            <EmptyState
              icon={Box}
              title={hasFilters ? 'Aucun résultat' : 'Aucun équipement'}
              description={
                hasFilters
                  ? 'Aucun individu ne correspond à cette recherche ou à ce filtre.'
                  : 'L’ontologie ne contient encore aucun individu.'
              }
              action={
                hasFilters ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch('')
                      setTypeFilter('')
                    }}
                  >
                    Réinitialiser les filtres
                  </Button>
                ) : (
                  <Button icon={Plus} onClick={openCreate}>
                    Ajouter le premier équipement
                  </Button>
                )
              }
            />
          }
        />
      </div>

      {/* Formulaire de création / modification */}
      <IndividualForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        mode={formMode}
        individual={formIndividual}
        classes={classes}
        objectProperties={objectProperties}
        dataProperties={dataProperties}
        propertyRanges={propertyRanges}
        numericDataProperties={numericDataProperties}
        onSubmit={handleSubmit}
      />

      {/* Confirmation de suppression */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Supprimer l’équipement"
        confirmLabel="Supprimer"
        message={`L’individu « ${deleteTarget?.name ?? ''} » et toutes ses relations vont être supprimés du graphe. Cette action est irréversible.`}
      />
    </div>
  )
}
