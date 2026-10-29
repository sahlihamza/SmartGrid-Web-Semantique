/**
 * Mise en page du graphe du réseau.
 *
 * Implémentation maison d'un algorithme « force dirigée » : répulsion entre
 * tous les nœuds, rappel élastique le long des arêtes, puis recentrage.
 * Cela évite d'ajouter une librairie de mise en page au projet.
 */

/** Disposition en grille, utilisée quand le graphe ne contient aucune arête. */
function gridLayout(count, { width, height }) {
  // On impose une largeur de colonne minimale pour que les nœuds ne se
  // chevauchent pas une fois la vue mise à l'échelle.
  const MIN_COLUMN_WIDTH = 280
  const columns = Math.max(1, Math.floor(width / MIN_COLUMN_WIDTH))
  const rows = Math.ceil(count / columns)
  const cellWidth = width / (columns + 1)
  const cellHeight = height / (rows + 1)

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      x: cellWidth * (column + 1),
      y: cellHeight * (row + 1),
    }
  })
}

/**
 * Calcule la position de chaque nœud.
 *
 * @param {Array<{ id: string }>} nodes
 * @param {Array<{ source: string, target: string }>} edges
 * @returns {Array<{ id: string, x: number, y: number }>}
 */
export function layoutGraph(nodes, edges, options = {}) {
  const { width = 1200, height = 700, iterations = 300 } = options
  const count = nodes.length
  if (count === 0) return []

  // Sans arête, une grille est plus lisible qu'un nuage de points.
  if (edges.length === 0) {
    return nodes.map((node, index) => ({ id: node.id, ...gridLayout(count, { width, height })[index] }))
  }

  const radius = Math.min(width, height) / 2.6
  const positions = nodes.map((node, index) => {
    const angle = (index / count) * Math.PI * 2
    return {
      id: node.id,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    }
  })

  const indexById = new Map(positions.map((position, index) => [position.id, index]))
  const links = edges
    .map((edge) => ({ source: indexById.get(edge.source), target: indexById.get(edge.target) }))
    .filter((link) => link.source !== undefined && link.target !== undefined)

  const repulsion = 14000
  const springLength = 200
  const springStrength = 0.04
  const gravity = 0.014
  const damping = 0.84

  const velocities = positions.map(() => ({ x: 0, y: 0 }))

  for (let step = 0; step < iterations; step += 1) {
    // Répulsion entre nœuds.
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        let dx = positions[j].x - positions[i].x
        let dy = positions[j].y - positions[i].y
        let distanceSquared = dx * dx + dy * dy
        if (distanceSquared < 0.01) {
          // Nœuds superposés : on les écarte légèrement de façon déterministe.
          dx = ((i + 1) % 7) - 3
          dy = ((j + 1) % 5) - 2
          distanceSquared = dx * dx + dy * dy || 1
        }
        const distance = Math.sqrt(distanceSquared)
        const force = repulsion / distanceSquared
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        velocities[i].x -= fx
        velocities[i].y -= fy
        velocities[j].x += fx
        velocities[j].y += fy
      }
    }

    // Ressorts le long des arêtes.
    for (const link of links) {
      const dx = positions[link.target].x - positions[link.source].x
      const dy = positions[link.target].y - positions[link.source].y
      const distance = Math.hypot(dx, dy) || 0.01
      const force = (distance - springLength) * springStrength
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force
      velocities[link.source].x += fx
      velocities[link.source].y += fy
      velocities[link.target].x -= fx
      velocities[link.target].y -= fy
    }

    // Gravité, amortissement et intégration.
    for (let i = 0; i < count; i += 1) {
      velocities[i].x += (width / 2 - positions[i].x) * gravity
      velocities[i].y += (height / 2 - positions[i].y) * gravity
      velocities[i].x *= damping
      velocities[i].y *= damping
      positions[i].x += velocities[i].x
      positions[i].y += velocities[i].y
      positions[i].x = Math.max(110, Math.min(width - 110, positions[i].x))
      positions[i].y = Math.max(60, Math.min(height - 60, positions[i].y))
    }
  }

  return positions
}
