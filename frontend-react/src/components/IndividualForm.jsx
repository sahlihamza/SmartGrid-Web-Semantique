import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from './Button.jsx'
import { IndividualPicker } from './IndividualPicker.jsx'
import { Modal } from './Modal.jsx'
import { Select } from './Field.jsx'
import { classNames, coerceNumeric, humanizeProperty } from '../utils/format.js'

/** Même expression régulière que celle du back-end (app.py). */
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/

let rowSequence = 0
const nextRowId = () => {
  rowSequence += 1
  return `row-${rowSequence}`
}

/**
 * Formulaire d'ajout / modification d'un individu.
 *
 * Contraintes du back-end prises en compte :
 *  - le nom doit respecter ^[A-Za-z0-9_-]+$ ;
 *  - une ObjectProperty attend une valeur « @NomIndividu » ;
 *  - une DataProperty numérique attend un nombre JSON (et non une chaîne) ;
 *  - PUT /individuals/<name> n'accepte que `properties` : la classe et le nom
 *    ne sont donc pas modifiables en édition.
 */
export function IndividualForm({
  open,
  onClose,
  mode = 'create',
  individual,
  classes = [],
  objectProperties = [],
  dataProperties = [],
  propertyRanges = {},
  numericDataProperties = [],
  onSubmit,
}) {
  const isEdit = mode === 'edit'

  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [rows, setRows] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Réinitialisation du formulaire à chaque ouverture.
  useEffect(() => {
    if (!open) return

    setError(null)
    setSubmitting(false)

    if (isEdit && individual) {
      setName(individual.name)
      setType(individual.types?.[0] ?? '')

      // On regroupe les propriétés par nom : le back-end ne stocke qu'une valeur
      // par triplet, mais l'API peut renvoyer plusieurs lignes pour une même
      // propriété (cas multi-valeur).
      const grouped = new Map()
      for (const property of individual.properties ?? []) {
        if (property.property === 'type') continue // rdf:type : géré à part
        const existing = grouped.get(property.property)
        if (existing) {
          existing.values.push(property.value)
          existing.isReference = existing.isReference || property.isReference
        } else {
          grouped.set(property.property, {
            values: [property.value],
            isReference: property.isReference,
          })
        }
      }

      setRows(
        Array.from(grouped.entries()).map(([property, detail]) => ({
          id: nextRowId(),
          property,
          value: detail.values[0] ?? '',
          multiple: detail.values.length > 1,
          extraValues: detail.values.slice(1),
        })),
      )
    } else {
      setName('')
      setType(classes[0] ?? '')
      setRows([{ id: nextRowId(), property: '', value: '', multiple: false, extraValues: [] }])
    }
  }, [open, isEdit, individual, classes])

  const addRow = () => {
    setRows((current) => [...current, { id: nextRowId(), property: '', value: '', multiple: false, extraValues: [] }])
  }

  const removeRow = (id) => {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current))
  }

  const updateRow = (id, patch) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const nameError = useMemo(() => {
    if (!name) return 'Le nom est obligatoire.'
    if (!NAME_PATTERN.test(name)) return 'Lettres, chiffres, tiret et underscore uniquement.'
    return null
  }, [name])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)

    if (!isEdit) {
      if (nameError) {
        setError(nameError)
        return
      }
      if (!type) {
        setError('La classe est obligatoire.')
        return
      }
    }

    const properties = {}
    for (const row of rows) {
      if (!row.property) continue
      const raw = row.value
      if (raw === '' || raw === null || raw === undefined) continue

      if (objectProperties.includes(row.property)) {
        // Relation vers un autre individu : format « @Nom ».
        // Une propriété peut pointer vers plusieurs individus : on envoie alors
        // une liste, sinon les autres relations seraient perdues à l'enregistrement.
        const targets = [raw, ...(row.extraValues ?? [])]
          .filter((value) => value !== '' && value !== null && value !== undefined)
          .map((value) => `@${String(value).replace(/^@/, '')}`)
        if (targets.length === 0) continue
        properties[row.property] = targets.length > 1 ? targets : targets[0]
      } else if (numericDataProperties.includes(row.property)) {
        const values = [raw, ...(row.extraValues ?? [])].filter((value) => value !== '' && value !== null && value !== undefined)
        const coerced = values.map((value) => coerceNumeric(value))
        properties[row.property] = coerced.length > 1 ? coerced : coerced[0]
      } else {
        const values = [raw, ...(row.extraValues ?? [])].filter((value) => value !== '' && value !== null && value !== undefined)
        properties[row.property] = values.length > 1 ? values.map(String) : String(values[0])
      }
    }

    setSubmitting(true)
    try {
      await onSubmit(isEdit ? { name: individual.name, properties } : { name, type, properties })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const allProperties = useMemo(
    () => [...objectProperties, ...dataProperties],
    [objectProperties, dataProperties],
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Modifier ${individual?.name ?? ''}` : 'Ajouter un équipement'}
      description={
        isEdit
          ? 'Mettez à jour les propriétés de l’individu.'
          : 'Créez un nouvel individu dans l’ontologie.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button type="submit" form="individual-form" loading={submitting}>
            {isEdit ? 'Enregistrer' : 'Créer l’individu'}
          </Button>
        </>
      }
    >
      <form id="individual-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          >
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="individual-name"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Nom <span className="text-rose-500">*</span>
            </label>
            <input
              id="individual-name"
              value={name}
              disabled={isEdit}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex. CentraleSolaireTozeur"
              className={classNames(
                'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25',
                'dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100',
                isEdit && 'cursor-not-allowed opacity-60',
              )}
            />
            <p className="text-xs text-slate-400">
              {isEdit
                ? 'Le nom ne peut pas être modifié (PUT /individuals n’accepte que les propriétés).'
                : 'Identifiant unique dans l’ontologie.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="individual-type"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Classe <span className="text-rose-500">*</span>
            </label>
            <select
              id="individual-type"
              value={type}
              disabled={isEdit}
              onChange={(event) => setType(event.target.value)}
              className={classNames(
                'w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25',
                'dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100',
                isEdit && 'cursor-not-allowed opacity-60',
              )}
            >
              <option value="">— Choisir une classe —</option>
              {classes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">
              {isEdit ? 'La classe ne peut pas être modifiée.' : 'Classe (ou sous-classe) de l’individu.'}
            </p>
          </div>
        </div>

        {/* Lignes de propriétés dynamiques */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Propriétés</h3>
            <Button variant="subtle" size="sm" icon={Plus} onClick={addRow}>
              Ajouter une propriété
            </Button>
          </div>

          <div className="space-y-2.5">
            {rows.map((row) => {
              const isObjectProperty = objectProperties.includes(row.property)
              const range = propertyRanges[row.property]
              const isNumeric = numericDataProperties.includes(row.property)

              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/30"
                >
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
                    <div className="min-w-0 sm:w-56">
                      <select
                        aria-label="Propriété"
                        value={row.property}
                        onChange={(event) =>
                          updateRow(row.id, {
                            property: event.target.value,
                            value: '',
                            multiple: false,
                            extraValues: [],
                          })
                        }
                        className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
                      >
                        <option value="">— Propriété —</option>
                        {objectProperties.length > 0 && (
                          <optgroup label="Propriétés d’objet (relations)">
                            {objectProperties.map((property) => (
                              <option key={property} value={property}>
                                {humanizeProperty(property)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {dataProperties.length > 0 && (
                          <optgroup label="Propriétés de données (valeurs)">
                            {dataProperties.map((property) => (
                              <option key={property} value={property}>
                                {humanizeProperty(property)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    <div className="min-w-0 flex-1">
                      {row.property && isObjectProperty ? (
                        <IndividualPicker
                          value={row.value}
                          onChange={(value) => updateRow(row.id, { value })}
                          type={range}
                          placeholder="Rechercher l’individu cible…"
                        />
                      ) : (
                        <input
                          type={isNumeric ? 'number' : 'text'}
                          step={isNumeric ? 'any' : undefined}
                          aria-label="Valeur"
                          value={row.value}
                          disabled={!row.property}
                          onChange={(event) => updateRow(row.id, { value: event.target.value })}
                          placeholder={row.property ? 'Valeur' : 'Choisissez d’abord une propriété'}
                          className={classNames(
                            'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25',
                            'dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100',
                            !row.property && 'cursor-not-allowed opacity-60',
                          )}
                        />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      aria-label="Supprimer cette propriété"
                      disabled={rows.length === 1}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-rose-500/10"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {row.property && isObjectProperty && (
                      <>Relation : la valeur sera envoyée comme « @{row.value || 'Nom'} ».</>
                    )}
                    {row.property && !isObjectProperty && isNumeric && (
                      <>Valeur numérique : envoyée comme nombre JSON.</>
                    )}
                    {row.multiple && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {' '}
                        · Propriété multi-valeur : {row.extraValues?.length ?? 0} autre(s) valeur(s)
                        conservée(s).
                      </span>
                    )}
                  </p>
                </div>
              )
            })}
          </div>

          {allProperties.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Aucune propriété n’a été détectée dans l’ontologie.
            </p>
          )}
        </div>
      </form>
    </Modal>
  )
}
