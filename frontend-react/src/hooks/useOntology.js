import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '../api/client.js'
import { isNumericRange } from '../utils/format.js'

/**
 * Charge les métadonnées de l'ontologie : classes, propriétés et plage (range) de
 * chaque propriété. Les plages ne sont pas exposées par /api/properties, on les
 * récupère donc via une requête SPARQL.
 */
const RANGES_QUERY = `SELECT ?p ?range ?kind WHERE {
  ?p a ?kind .
  ?p rdfs:range ?range .
  FILTER(?kind IN (owl:ObjectProperty, owl:DatatypeProperty))
}`

export function useOntology() {
  const [state, setState] = useState({
    classes: [],
    objectProperties: [],
    dataProperties: [],
    propertyRanges: {},
    loading: true,
    error: null,
  })

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const [classes, properties] = await Promise.all([api.classes(), api.properties()])

      let propertyRanges = {}
      try {
        const result = await api.sparql(RANGES_QUERY)
        const propertyIndex = result.columns.indexOf('p')
        const rangeIndex = result.columns.indexOf('range')
        if (propertyIndex !== -1 && rangeIndex !== -1) {
          propertyRanges = Object.fromEntries(
            result.rows.map((row) => [row[propertyIndex], row[rangeIndex]]),
          )
        }
      } catch {
        // Les plages sont un complément : en cas d'échec on continue sans elles
        // (toutes les propriétés seront alors traitées comme du texte).
        propertyRanges = {}
      }

      setState({
        classes,
        objectProperties: properties?.objectProperties ?? [],
        dataProperties: properties?.dataProperties ?? [],
        propertyRanges,
        loading: false,
        error: null,
      })
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /** DataProperties dont la plage est numérique (puissance, capacité…). */
  const numericDataProperties = useMemo(
    () => state.dataProperties.filter((property) => isNumericRange(state.propertyRanges[property])),
    [state.dataProperties, state.propertyRanges],
  )

  return { ...state, numericDataProperties, reload: load }
}
