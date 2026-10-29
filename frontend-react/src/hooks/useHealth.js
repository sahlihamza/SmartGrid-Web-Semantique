import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '../api/client.js'

/** Intervalle de rafraîchissement de l'indicateur de connexion. */
const POLL_INTERVAL = 15000

/**
 * Sonde GET /health périodiquement pour afficher l'état de connexion au back-end.
 * @returns {{ status: 'pending'|'online'|'offline', data: object|null, error: string|null, refresh: Function }}
 */
export function useHealth() {
  const [state, setState] = useState({ status: 'pending', data: null, error: null })
  const mounted = useRef(true)

  const check = useCallback(async () => {
    try {
      const data = await api.health()
      if (mounted.current) setState({ status: 'online', data, error: null })
    } catch (error) {
      if (mounted.current) setState({ status: 'offline', data: null, error: error.message })
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    check()
    const timer = window.setInterval(check, POLL_INTERVAL)
    return () => {
      mounted.current = false
      window.clearInterval(timer)
    }
  }, [check])

  return { ...state, refresh: check }
}
