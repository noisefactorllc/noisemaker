/**
 * Cosine palette collection.
 * Loaded from shared JSON source (share/palettes.json).
 * https://iquilezles.org/www/articles/palettes/palettes.htm
 */

import palettesData from '../../share/palettes.json' with { type: "json" }

const TAU = Math.PI * 2

// Export raw JSON data with camelCase keys
export const PALETTES = palettesData

export default PALETTES

/**
 * Sample a palette at position t (0-1).
 * @param {string} name - Palette name (camelCase, e.g., "blueSkies")
 * @param {number} t - Position along palette (0-1)
 * @returns {number[]} RGB values
 */
export function samplePalette(name, t) {
  const p = PALETTES[name]
  if (!p) throw new Error(`Unknown palette ${name}`)
  return [0, 1, 2].map(i =>
    p.offset[i] + p.amp[i] * Math.cos(TAU * (p.freq[i] * t * 0.875 + 0.0625 + p.phase[i]))
  )
}
