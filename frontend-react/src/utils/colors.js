/**
 * Attribution d'une couleur à chaque classe de l'ontologie.
 *
 * Les noms de classes ne sont pas connus à l'avance par l'interface (ils dépendent
 * de l'ontologie chargée dans le fichier .owl). On associe donc une couleur par
 * mots-clés — solaire, éolien, stockage, bâtiment, ligne… — et, à défaut, par un
 * hash stable du nom de la classe afin que la couleur reste toujours la même
 * d'un chargement à l'autre.
 *
 * Les classes Tailwind sont écrites en toutes lettres (jamais construites par
 * concaténation) afin que Tailwind les détecte et les génère dans le CSS final.
 */

/** Palettes : `badge` pour les badges, `dot` pour la pastille, `hex` pour React Flow. */
const PALETTES = {
  solaire: {
    label: 'Solaire',
    badge:
      'bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
    hex: '#f59e0b',
  },
  eolien: {
    label: 'Éolien',
    badge:
      'bg-sky-100 text-sky-800 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25',
    dot: 'bg-sky-500',
    hex: '#0ea5e9',
  },
  stockage: {
    label: 'Stockage',
    badge:
      'bg-violet-100 text-violet-800 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25',
    dot: 'bg-violet-500',
    hex: '#8b5cf6',
  },
  batiment: {
    label: 'Bâtiment / équipement',
    badge:
      'bg-slate-200 text-slate-800 ring-slate-600/20 dark:bg-slate-500/20 dark:text-slate-200 dark:ring-slate-400/25',
    dot: 'bg-slate-500',
    hex: '#64748b',
  },
  ligne: {
    label: 'Ligne / réseau',
    badge:
      'bg-rose-100 text-rose-800 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
    hex: '#f43f5e',
  },
  thermique: {
    label: 'Thermique',
    badge:
      'bg-orange-100 text-orange-800 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/25',
    dot: 'bg-orange-500',
    hex: '#f97316',
  },
  nucleaire: {
    label: 'Nucléaire',
    badge:
      'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-600/20 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-400/25',
    dot: 'bg-fuchsia-500',
    hex: '#d946ef',
  },
  hydraulique: {
    label: 'Hydraulique',
    badge:
      'bg-cyan-100 text-cyan-800 ring-cyan-600/20 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/25',
    dot: 'bg-cyan-500',
    hex: '#06b6d4',
  },
  acteur: {
    label: 'Acteur',
    badge:
      'bg-teal-100 text-teal-800 ring-teal-600/20 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/25',
    dot: 'bg-teal-500',
    hex: '#14b8a6',
  },
  energie: {
    label: 'Source d’énergie',
    badge:
      'bg-lime-100 text-lime-800 ring-lime-600/20 dark:bg-lime-500/15 dark:text-lime-300 dark:ring-lime-400/25',
    dot: 'bg-lime-500',
    hex: '#84cc16',
  },
  // Palettes de repli, sélectionnées par hash du nom de la classe.
  hash0: {
    label: 'Autre',
    badge:
      'bg-emerald-100 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
    hex: '#10b981',
  },
  hash1: {
    label: 'Autre',
    badge:
      'bg-indigo-100 text-indigo-800 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/25',
    dot: 'bg-indigo-500',
    hex: '#6366f1',
  },
  hash2: {
    label: 'Autre',
    badge:
      'bg-blue-100 text-blue-800 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25',
    dot: 'bg-blue-500',
    hex: '#3b82f6',
  },
  hash3: {
    label: 'Autre',
    badge:
      'bg-pink-100 text-pink-800 ring-pink-600/20 dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-400/25',
    dot: 'bg-pink-500',
    hex: '#ec4899',
  },
  hash4: {
    label: 'Autre',
    badge:
      'bg-yellow-100 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-400/25',
    dot: 'bg-yellow-500',
    hex: '#eab308',
  },
  hash5: {
    label: 'Autre',
    badge:
      'bg-gray-100 text-gray-800 ring-gray-600/20 dark:bg-gray-500/20 dark:text-gray-300 dark:ring-gray-400/25',
    dot: 'bg-gray-500',
    hex: '#6b7280',
  },
}

/**
 * Règles par mots-clés, évaluées dans l'ordre : la première règle qui matche gagne.
 * L'ordre est important pour que « CentraleSolaire » reste solaire et non « énergie ».
 */
const KEYWORD_RULES = [
  { key: 'solaire', pattern: /solaire|solar|photon|photovolt|heliode|helio/i },
  { key: 'eolien', pattern: /eolien|éolien|eolian|wind|vent|turbine/i },
  { key: 'nucleaire', pattern: /nucleaire|nucléaire|nucle/i },
  { key: 'thermique', pattern: /thermique|thermal|fossile|fossil|charbon|petrole|pétrole/i },
  { key: 'hydraulique', pattern: /hydraulique|hydraul|barrage/i },
  { key: 'stockage', pattern: /batterie|batter|stockage|stock|accumulateur/i },
  {
    key: 'batiment',
    pattern:
      /batiment|bâtiment|build|immeuble|equipement|équipement|compteur|capteur|transformateur|onduleur|installation|maison|habitat/i,
  },
  { key: 'acteur', pattern: /consommateur|producteur|prosommateur|acteur|gestionnaire|utilisateur|client/i },
  { key: 'ligne', pattern: /ligne|line|transmission|reseau|réseau|cable|grid|transport/i },
  { key: 'energie', pattern: /energie|énergie|source|renouvelable|renewable/i },
]

/** Palettes utilisées pour le repli par hash. */
const HASH_KEYS = ['hash0', 'hash1', 'hash2', 'hash3', 'hash4', 'hash5']

/** Hash déterministe (djb2) : la même classe obtient toujours la même couleur. */
export function hashString(value) {
  const text = String(value ?? '')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash
}

/**
 * Retourne la palette associée à une classe de l'ontologie.
 * @param {string} className
 */
export function getClassPalette(className) {
  const name = String(className ?? '')
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(name)) return PALETTES[rule.key]
  }
  return PALETTES[HASH_KEYS[hashString(name) % HASH_KEYS.length]]
}

/** Palette brute par identifiant (utile pour les nœuds du graphe). */
export function getPaletteByKey(key) {
  return PALETTES[key] ?? PALETTES.hash0
}

/**
 * Couleurs « technique » de l'application (hors classes), utilisées par le graphe.
 */
export const GRAPH_COLORS = {
  edge: '#94a3b8',
  edgeActive: '#0d9488',
  nodeBorder: '#0f172a',
  backgroundLight: '#f8fafc',
  backgroundDark: '#020617',
}
