import { useEffect, useState } from 'react'

/**
 * Retarde la propagation d'une valeur (utile pour la recherche par nom :
 * on ne relance pas une requête HTTP à chaque frappe).
 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}
