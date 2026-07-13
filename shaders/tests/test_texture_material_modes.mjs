#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const textureDir = path.resolve(__dirname, '../effects/filter/texture')
const grainDir = path.resolve(__dirname, '../effects/filter/grain')
const { default: texture } = await import(path.join(textureDir, 'definition.js'))
const { default: grain } = await import(path.join(grainDir, 'definition.js'))

assert.deepEqual(Object.keys(grain.globals), ['alpha', 'pause'],
    'Grain must remain the focused film-grain effect')

const choices = texture.globals.mode.choices
for (const name of [
    'regular', 'soft', 'sprinkles', 'clumped', 'contrasty',
    'enlarged', 'stippled', 'horizontal', 'vertical', 'speckle',
]) {
    assert.ok(Number.isInteger(choices[name]), `${name} must be a Texture mode`)
}

for (const control of ['intensity', 'contrast', 'mono']) {
    assert.deepEqual(texture.globals[control].ui.enabledBy, { param: 'mode', gt: 4 },
        `${control} must be enabled only for material-noise Texture modes`)
}

for (const backend of ['glsl', 'wgsl']) {
    const source = fs.readFileSync(path.join(textureDir, backend, `texture.${backend}`), 'utf8')
    assert.match(source, /material_soft/, `${backend} must implement a dedicated Soft kernel`)
    assert.match(source, /material_directional/,
        `${backend} Horizontal and Vertical must integrate fine noise along an axis`)
    assert.doesNotMatch(source, /vec2(?:<f32>)?\(18\.0,\s*1\.25\)|vec2(?:<f32>)?\(1\.25,\s*18\.0\)/,
        `${backend} directional modes must not expose an extreme rectangular value-noise lattice`)
    assert.match(source, /material_value/, `${backend} must implement material-mode dispatch`)
    assert.doesNotMatch(source, /\*\s*0\.38/, `${backend} Soft must not use the rejected coarse cell scale`)
    assert.match(source, /tileOffset/, `${backend} material modes must use global tile coordinates`)
    assert.match(source, /fullResolution/, `${backend} material modes must use full-frame dimensions`)
}

console.log('Texture material-mode ownership and structure: ok')
