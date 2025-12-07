import assert from 'assert';
import { PALETTES, samplePalette } from '../shaders/src/palettes.js';

function arraysClose(a, b, eps = 1e-6) {
  assert.strictEqual(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.ok(Math.abs(a[i] - b[i]) < eps, `index ${i}`);
  }
}

// ensure palettes are exported
assert.ok(PALETTES.grayscale);
assert.ok(PALETTES.hypercolor);

// known sample values (validated against Python)
arraysClose(samplePalette('grayscale', 0), [0.9619397662556433, 0.9619397662556433, 0.9619397662556433]);
arraysClose(samplePalette('hypercolor', 0), [1.2439416985052072, 0.8790748587125117, 0.4895436930642642]);
arraysClose(samplePalette('hypercolor', 0.5), [0.0577177227653477, 0.20208660251050242, 0.32675983715483087]);

assert.throws(() => samplePalette('bogus', 0));

console.log('Palette tests passed');
