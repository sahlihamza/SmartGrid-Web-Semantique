/**
 * Client HTTP unique de l'application.
 *
 * Règle du projet : AUCUN composant n'appelle `fetch` directement.
 * Toutes les requêtes vers le back-end Flask passent par ce fichier, ce qui
 * centralise l'URL de base, la sérialisation JSON et la gestion des erreurs.
 */

/** URL de base de l'API, lue dans le fichier .env (VITE_API_URL). */
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Erreur enrichie : le back-end renvoie `{ error: "message" }` en cas d'échec,
 * on transporte ce message jusqu'à l'interface (affiché en toast).
 */
export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

/**
 * Enveloppe générique autour de fetch : gestion du réseau, du JSON et des erreurs HTTP.
 * @param {string} path  chemin relatif à VITE_API_URL (ex. '/individuals')
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} options
 */
async function request(path, { method = 'GET', body, signal } = {}) {
  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch {
    // Panne réseau ou back-end arrêté : message directement exploitable par l'UI.
    throw new ApiError(
      "Impossible de joindre le back-end. Vérifiez qu'il est démarré (python app.py dans backend/).",
      0,
    )
  }

  // On lit le corps en texte puis on tente de le parser : certaines réponses
  // (page d'erreur 404 de Flask) ne sont pas du JSON.
  const raw = await response.text()
  let payload = null
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      (response.status === 404
        ? 'Ressource introuvable.'
        : `Erreur serveur (${response.status}).`)
    throw new ApiError(message, response.status, payload)
  }

  return payload
}

/** Regroupe les routes exposées par le back-end. */
export const api = {
  /** GET /health -> { triples, namespace } */
  health: () => request('/health'),

  /** GET /classes -> ["Classe1", ...] */
  classes: () => request('/classes'),

  /** GET /properties -> { objectProperties: [...], dataProperties: [...] } */
  properties: () => request('/properties'),

  /**
   * GET /individuals?type=&search=
   * Le filtre par classe inclut les sous-classes (géré côté serveur).
   */
  individuals: ({ type, search } = {}) => {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (search) params.set('search', search)
    const query = params.toString()
    return request(`/individuals${query ? `?${query}` : ''}`)
  },

  /** GET /individuals/<name> -> { name, properties: [...] } */
  individual: (name) => request(`/individuals/${encodeURIComponent(name)}`),

  /** POST /individuals -> 201. Une valeur "@Nom" crée une relation. */
  createIndividual: (payload) => request('/individuals', { method: 'POST', body: payload }),

  /** PUT /individuals/<name> -> { properties: { prop: valeur } } */
  updateIndividual: (name, properties) =>
    request(`/individuals/${encodeURIComponent(name)}`, { method: 'PUT', body: { properties } }),

  /** DELETE /individuals/<name> */
  deleteIndividual: (name) =>
    request(`/individuals/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  /** POST /sparql -> { columns, rows } ou { ask: bool } */
  sparql: (query) => request('/sparql', { method: 'POST', body: { query } }),

  /** POST /ask -> { sparql, result } (module NLP/TALN : question -> requête SPARQL). */
  ask: (question) => request('/ask', { method: 'POST', body: { question } }),

  /** Import CSV (colonnes name, type, puis noms de propriétés). */
  importCsv: async (file) => {
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(`${API_URL}/import/csv`, { method: 'POST', body: form })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new ApiError(payload.error || `Erreur serveur (${response.status}).`, response.status, payload)
    return payload
  },

  /** Télécharge une sérialisation complète de l'ontologie. */
  exportOntology: async (format) => {
    const response = await fetch(`${API_URL}/export/ontology?format=${encodeURIComponent(format)}`)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new ApiError(payload.error || `Erreur serveur (${response.status}).`, response.status, payload)
    }
    return response.blob()
  },
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Variante de `api.ask` qui distingue « le module NLP est indisponible » de
 * « le back-end est arrêté », et renvoie dans les deux cas un message clair.
 *
 * Difficulté : une route absente renvoie un 404 de Flask qui ne comporte PAS
 * d'en-têtes CORS. Le préflight OPTIONS du navigateur échoue donc, `fetch`
 * rejette, et le code HTTP 404 n'est jamais visible depuis le front : le simple
 * `error.status === 404` ne suffit donc pas.
 *
 * On distingue les deux situations en interrogeant /health (une route
 * connue, donc avec des en-têtes CORS valides) :
 *  - /health répond  -> le back-end fonctionne mais /ask n'est pas livrée ;
 *  - /health échoue   -> le back-end est réellement injoignable.
 *
 * Ce repli reste utile si le back-end tourne avec une version antérieure du
 * module NLP : l'interface affiche alors « Module NLP pas encore disponible »
 * au lieu d'une erreur technique.
 */
export async function askQuestion(question) {
  try {
    const data = await api.ask(question)
    return { ok: true, sparql: data?.sparql ?? '', result: data?.result ?? null }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return {
        ok: false,
        unavailable: true,
        message: 'Module NLP pas encore disponible.',
      }
    }

    if (error instanceof ApiError && error.status === 0) {
      const backendAlive = await api
        .health()
        .then(() => true)
        .catch(() => false)

      if (backendAlive) {
        return {
          ok: false,
          unavailable: true,
          message: 'Module NLP pas encore disponible.',
        }
      }
    }

    throw error
  }
}
