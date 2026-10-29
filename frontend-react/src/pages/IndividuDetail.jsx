import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from 'lucide-react'

import { api } from '../api/client.js'
import { Badge, ClassBadge } from '../components/Badge.jsx'
import { Button, IconButton } from '../components/Button.jsx'
import { ConfirmDialog } from '../components/ConfirmDialog.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { IndividualForm } from '../components/IndividualForm.jsx'
import { SkeletonText } from '../components/Skeleton.jsx'
import { useOntology } from '../hooks/useOntology.js'
import { useToast } from '../components/Toast.jsx'
import { extractDataProperties, extractTypes, humanizeProperty } from '../utils/format.js'

/**
 * Fiche d'un individu : toutes ses propriétés, les valeurs de type « référence »
 * étant des liens vers l'individu ciblé.
 */
export default function IndividuDetail() {
  const { name } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { classes, objectProperties, dataProperties, propertyRanges, numericDataProperties } =
    useOntology()

  const [individual, setIndividual] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.individual(name)
      setIndividual(data)
    } catch (loadError) {
      setError(loadError.message)
      setIndividual(null)
    } finally {
      setLoading(false)
    }
  }, [name])

  useEffect(() => {
    load()
  }, [load])

  const types = individual ? extractTypes(individual.properties) : []
  const dataPropertiesOfIndividual = individual ? extractDataProperties(individual.properties) : []

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteIndividual(name)
      toast.success(`« ${name} » a été supprimé.`)
      navigate('/equipements', { replace: true })
    } catch (deleteError) {
      toast.error(deleteError.message)
      setDeleting(false)
    }
  }

  const handleSubmit = async (payload) => {
    try {
      await api.updateIndividual(payload.name, payload.properties)
      toast.success(`« ${payload.name} » a été mis à jour.`)
      setFormOpen(false)
      await load()
    } catch (submitError) {
      toast.error(submitError.message)
      throw submitError
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-8 w-48 animate-pulse-soft rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <SkeletonText lines={6} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Link
          to="/equipements"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour aux équipements
        </Link>
        <ErrorBanner message={error} onRetry={load} />
      </div>
    )
  }

  if (!individual) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState
          icon={ExternalLink}
          title="Individu introuvable"
          description={`Aucun individu nommé « ${name} » n’existe dans l’ontologie.`}
          action={
            <Button variant="secondary" onClick={() => navigate('/equipements')}>
              Retour aux équipements
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        to="/equipements"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Retour aux équipements
      </Link>

      {/* En-tête de la fiche */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {individual.name}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {types.length === 0 ? (
                <Badge tone="neutral">Sans classe</Badge>
              ) : (
                types.map((type) => <ClassBadge key={type} name={type} showDot />)
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => setFormOpen(true)}>
              Modifier
            </Button>
            <IconButton
              icon={Trash2}
              label="Supprimer"
              variant="secondary"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              onClick={() => setDeleteOpen(true)}
            />
          </div>
        </div>
      </header>

      {/* Propriétés */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Propriétés ({dataPropertiesOfIndividual.length})
          </h3>
          <Badge tone="brand">rdf:type : {types.join(', ') || '—'}</Badge>
        </header>

        {dataPropertiesOfIndividual.length === 0 ? (
          <EmptyState
            icon={ExternalLink}
            title="Aucune propriété"
            description="Cet individu ne possède aucune propriété en plus de son type."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {dataPropertiesOfIndividual.map((property, index) => (
              <li
                key={`${property.property}-${index}`}
                className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-start sm:gap-6"
              >
                <span className="w-full shrink-0 font-mono text-xs font-medium text-slate-500 sm:w-56 dark:text-slate-400">
                  {humanizeProperty(property.property)}
                </span>
                <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200">
                  {property.isReference ? (
                    // Valeur de type référence : lien cliquable vers l'individu ciblé.
                    <Link
                      to={`/equipements/${encodeURIComponent(property.value)}`}
                      className="inline-flex items-center gap-1.5 font-medium text-brand-700 underline-offset-4 transition hover:underline dark:text-brand-300"
                    >
                      {property.value}
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="font-mono">{property.value}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <IndividualForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        mode="edit"
        individual={{ name: individual.name, types, properties: individual.properties }}
        classes={classes}
        objectProperties={objectProperties}
        dataProperties={dataProperties}
        propertyRanges={propertyRanges}
        numericDataProperties={numericDataProperties}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Supprimer l’équipement"
        confirmLabel="Supprimer"
        message={`L’individu « ${individual.name} » et toutes ses relations vont être supprimés du graphe. Cette action est irréversible.`}
      />
    </div>
  )
}
