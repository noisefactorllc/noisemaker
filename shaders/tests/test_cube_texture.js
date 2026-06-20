import { WebGL2Backend } from '../src/runtime/backends/webgl2.js'

const calls = []
const stubGl = new Proxy({ TEXTURE_CUBE_MAP: 34067, TEXTURE_CUBE_MAP_POSITIVE_X: 34069, RGBA: 6408, RGBA8: 32856, UNSIGNED_BYTE: 5121,
  TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240, LINEAR: 9729, TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, CLAMP_TO_EDGE: 33071 },
  { get: (t, k) => (k in t ? t[k] : () => { calls.push(String(k)); return k === 'createTexture' ? {} : undefined }) })

const b = Object.create(WebGL2Backend.prototype)
b.gl = stubGl
b.textures = new Map()
b.createCubeTexture('cubeTest', { size: 64 })
if (!b.textures.has('cubeTest')) throw new Error('cube texture not registered')
const texImage2DCount = calls.filter((c) => c === 'texImage2D').length
if (texImage2DCount !== 6) throw new Error(`expected 6 texImage2D face allocations, got ${texImage2DCount}`)
console.log('All cube texture tests passed')
