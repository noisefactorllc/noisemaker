#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const effectDir = path.resolve(__dirname, '../effects/filter/lowPoly')
const { default: definition } = await import(path.join(effectDir, 'definition.js'))

const glsl = fs.readFileSync(path.join(effectDir, 'glsl/lowPoly.glsl'), 'utf8')
const wgsl = fs.readFileSync(path.join(effectDir, 'wgsl/lowPoly.wgsl'), 'utf8')
const help = fs.readFileSync(path.join(effectDir, 'help.md'), 'utf8')
const allText = [
    fs.readFileSync(path.join(effectDir, 'definition.js'), 'utf8'),
    glsl,
    wgsl,
    help,
].join('\n')

assert.equal(definition.globals.borderWidth.default, 0)
assert.equal(definition.globals.lightIntensity.default, 0)
// Border and light are compile-time defines so their shader blocks are dead-code
// eliminated from the default variant, keeping baseline output byte-identical.
assert.equal(definition.globals.borderWidth.define, 'LP_BORDER',
    'borderWidth must be a compile-time define so the default variant excludes its block')
assert.equal(definition.globals.lightIntensity.define, 'LP_LIGHT',
    'lightIntensity must be a compile-time define so the default variant excludes its block')
assert.equal(definition.globals.mode.ui.enabledBy, undefined,
    'border and light modifiers must not disable the selected mode')
assert.deepEqual(definition.globals.edgeStrength.ui.enabledBy,
    { param: 'mode', neq: 0 },
    'edge strength is inactive only for flat mode')
assert.deepEqual(definition.globals.edgeColor.ui.enabledBy, {
    or: [
        { param: 'borderWidth', gt: 0 },
        { param: 'mode', eq: 1 },
    ],
})

assert.doesNotMatch(allText, /stained[ -]glass/i,
    'Low Poly must not advertise an effect mode it does not implement')
for (const [backend, source] of [['GLSL', glsl], ['WGSL', wgsl]]) {
    assert.match(source, /modeResult\s*=\s*result/,
        `${backend} modifiers must start from the selected mode result`)
    assert.doesNotMatch(source, /stainedGlassActive|paneResult|stainedBorderMask/,
        `${backend} must not retain the hidden alternate-mode path`)
    assert.match(source, /LP_BORDER\s*(?:>|!=)\s*0/,
        `${backend} border modifier must be opt-in via the LP_BORDER compile-time gate`)
    assert.match(source, /LP_LIGHT\s*(?:>|!=)\s*0/,
        `${backend} light modifier must be opt-in via the LP_LIGHT compile-time gate`)
    assert.match(source, /borderNearestPoint/,
        `${backend} optional borders must find the true nearest site independently`)
}

assert.match(help, /do not replace the mode or disable its controls/i)
assert.match(help, /border is composited after the light so it does not brighten/i)

console.log('lowPoly modifier semantics: ok')
