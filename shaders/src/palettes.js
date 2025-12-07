/**
 * Cosine palette collection.
 * Loaded from shared JSON source (share/palettes.json).
 * https://iquilezles.org/www/articles/palettes/palettes.htm
 */

import palettesData from '../../share/palettes.json' with { type: "json" };

const TAU = Math.PI * 2;

// Export raw JSON data with camelCase keys
export const PALETTES = palettesData;

export default PALETTES;

/**
 * Sample a palette at position t (0-1).
 * @param {string} name - Palette name (camelCase, e.g., "blueSkies")
 * @param {number} t - Position along palette (0-1)
 * @returns {number[]} RGB values
 */
export function samplePalette(name, t) {
  const p = PALETTES[name];
  if (!p) throw new Error(`Unknown palette ${name}`);
  const r = p.offset[0] + p.amp[0] * Math.cos(TAU * (p.freq[0] * t * 0.875 + 0.0625 + p.phase[0]));
  const g = p.offset[1] + p.amp[1] * Math.cos(TAU * (p.freq[1] * t * 0.875 + 0.0625 + p.phase[1]));
  const b = p.offset[2] + p.amp[2] * Math.cos(TAU * (p.freq[2] * t * 0.875 + 0.0625 + p.phase[2]));
  return [r, g, b];
}
