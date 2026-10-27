import assert from 'node:assert/strict'
import { is3dGenerator, is3dProcessor, isStarterEffect } from '../src/renderer/canvas.js'
import heightmap from '../effects/synth3d/heightmap3d/definition.js'
import landscape from '../effects/render/renderLandscape3d/definition.js'

assert.equal(Boolean(is3dGenerator({ instance: heightmap })), true, 'heightmap must be classified as a native volume generator')
assert.equal(isStarterEffect({ instance: heightmap }), true)
assert.equal(Boolean(is3dProcessor({ instance: landscape })), true, 'landscape must be classified as a native volume consumer')
assert.equal(isStarterEffect({ instance: landscape }), false)
console.log('PASS native heightmap and landscape effect classification')
