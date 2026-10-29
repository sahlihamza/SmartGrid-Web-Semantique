/** Petits utilitaires de formatage partagés par les pages et les composants. */

/** Concatène des classes conditionnelles (équivalent léger de `clsx`). */
export function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

/** Types XSD considérés comme numériques par le back-end. */
const NUMERIC_TYPES = new Set([
  'float',
  'double',
  'decimal',
  'integer',
  'int',
  'long',
  'short',
  'byte',
  'nonNegativeInteger',
  'positiveInteger',
  'nonPositiveInteger',
  'negativeInteger',
  'unsignedInt',
  'unsignedLong',
  'unsignedShort',
  'unsignedByte',
])

/**
 * Indique si une propriété est numérique, à partir de son `rdfs:range`.
 * Le back-end renvoie le range sous forme d'URI complète pour xsd:float par exemple.
 */
export function isNumericRange(range) {
  if (!range) return false
  const local = String(range).split('#').pop().split('/').pop().toLowerCase()
  return NUMERIC_TYPES.has(local)
}

/** Nom local d'un range xsd (utile pour l'affichage). */
export function rangeLocalName(range) {
  if (!range) return ''
  return String(range).split('#').pop().split('/').pop()
}

/**
 * Convertit une valeur de formulaire en nombre si la propriété est numérique.
 * Le back-end exige des nombres JSON (et non des chaînes) pour conserver le datatype.
 */
export function coerceNumeric(raw) {
  if (raw === null || raw === undefined) return raw
  const text = String(raw).trim()
  if (text === '') return ''
  const parsed = Number(text.replace(',', '.'))
  return Number.isNaN(parsed) ? text : parsed
}

/** Formate un nombre pour l'affichage (entiers sans décimales, autres à 2 décimales). */
export function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * Rend un nom de propriété lisible : « aPourCapacite » -> « a Pour Capacite ».
 */
export function humanizeProperty(name) {
  if (!name) return ''
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** IRI du type technique `owl:NamedIndividual` ajouté par le back-end. */
export const OWL_NAMED_INDIVIDUAL = 'http://www.w3.org/2002/07/owl#NamedIndividual'

/**
 * Extrait les classes d'un individu à partir de ses propriétés `rdf:type`.
 *
 * L'API renvoie le type comme une propriété ordinaire dont le nom est « type »
 * (nom local de rdf:type). Deux lignes apparaissent : la classe métier et le type
 * technique `owl:NamedIndividual`, que l'on ignore ici.
 */
export function extractTypes(properties = []) {
  return properties
    .filter((property) => property.property === 'type')
    .map((property) => property.value)
    .filter(
      (value) =>
        value !== OWL_NAMED_INDIVIDUAL && !String(value).startsWith('http://www.w3.org/'),
    )
}

/** Propriétés « métier » d'un individu (tout sauf rdf:type). */
export function extractDataProperties(properties = []) {
  return properties.filter((property) => property.property !== 'type')
}

/** Date relative simple (« il y a 3 min »), pour l'indicateur de connexion. */
export function formatRelativeTime(date) {
  if (!date) return ''
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 5) return "à l'instant"
  if (seconds < 60) return `il y a ${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  return `il y a ${hours} h`
}
