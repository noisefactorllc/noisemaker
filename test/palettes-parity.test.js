import assert from 'assert';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { PALETTES as jsPalettes } from '../shaders/src/palettes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function getPythonPalettes() {
  const py = `
import json
from noisemaker.palettes import PALETTES
print(json.dumps(PALETTES))
`;
  const res = spawnSync('python3', ['-c', py], { cwd: repoRoot, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(res.stderr);
  }
  return JSON.parse(res.stdout);
}

const pyPalettes = getPythonPalettes();

// Both Python and JS now load from the same JSON with camelCase keys
const pyNames = Object.keys(pyPalettes).sort();
const jsNames = Object.keys(jsPalettes).sort();

assert.deepStrictEqual(jsNames, pyNames, 'Palette name mismatch');

for (const name of Object.keys(pyPalettes)) {
  const py = pyPalettes[name];
  const js = jsPalettes[name];
  
  assert.ok(js, `Missing JS palette: ${name}`);
  
  // Compare core properties
  assert.deepStrictEqual(js.amp, py.amp, `amp mismatch for ${name}`);
  assert.deepStrictEqual(js.freq, py.freq, `freq mismatch for ${name}`);
  assert.deepStrictEqual(js.offset, py.offset, `offset mismatch for ${name}`);
  assert.deepStrictEqual(js.phase, py.phase, `phase mismatch for ${name}`);
}

console.log('palettes parity ok');
