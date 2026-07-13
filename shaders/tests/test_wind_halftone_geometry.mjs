#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const effectsDir = path.resolve(__dirname, '../effects/filter')
const { default: halftoneDefinition } = await import(path.join(effectsDir, 'halftone/definition.js'))

function read(effect, relativePath) {
    return fs.readFileSync(path.join(effectsDir, effect, relativePath), 'utf8')
}

function body(source, functionName) {
    const signature = new RegExp(`\\b${functionName}\\s*\\(`, 'm')
    const match = signature.exec(source)
    assert.ok(match, `missing ${functionName} function`)
    const openBrace = source.indexOf('{', match.index + match[0].length)
    assert.notEqual(openBrace, -1, `missing ${functionName} body`)
    let depth = 1
    for (let index = openBrace + 1; index < source.length; index++) {
        if (source[index] === '{') depth++
        if (source[index] === '}') depth--
        if (depth === 0) return source.slice(match.index, index + 1)
    }
    assert.fail(`unterminated ${functionName} function`)
}

function codeOnly(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

for (const effect of ['wind', 'halftone']) {
    const combined = [
        read(effect, 'definition.js'),
        read(effect, 'help.md'),
        read(effect, `glsl/${effect}.glsl`),
        read(effect, `wgsl/${effect}.wgsl`),
    ].join('\n')
    const disallowedProductName = new RegExp(['photo', 'shop'].join(''), 'i')
    assert.doesNotMatch(combined, disallowedProductName,
        `${effect} operator copy and shader sources must not reference another product`)
}

for (const backend of ['glsl', 'wgsl']) {
    const extension = backend === 'glsl' ? 'glsl' : 'wgsl'
    const wind = read('wind', `${backend}/wind.${extension}`)
    const windMain = body(wind, 'main')
    assert.doesNotMatch(codeOnly(wind), /hash|SEGMENT|RUN_FLOOR/i,
        `${backend} Wind must not break streaks into random per-row/per-segment grain`)
    assert.match(wind, /smoothstep/,
        `${backend} Wind must soften the luminance threshold instead of cutting a hard mask`)
    assert.match(windMain, /accum/i,
        `${backend} Wind must integrate a coherent run rather than select one hard winner`)
    assert.match(windMain, /sin\s*\(/,
        `${backend} Stagger must use a continuous phase field rather than hard row bands`)
    assert.match(wind, /STEP_PX\s*(?::\s*f32)?\s*=\s*1\.0/,
        `${backend} Wind must sample every source column so one-pixel edges cannot form comb gaps`)
    assert.ok((windMain.match(/texture(?:Sample)?\s*\(/g) || []).length <= 3,
        `${backend} Wind loop must retain a one-texture-read-per-tap performance budget`)

    const halftone = read('halftone', `${backend}/halftone.${extension}`)
    const generalCoverage = body(halftone, 'halftoneCoverage')
    assert.doesNotMatch(generalCoverage, /smoothstep\s*\(\s*spot\s*\+\s*aa\s*,\s*spot\s*-\s*aa/,
        `${backend} line/circle antialiasing must not rely on undefined reversed smoothstep edges`)
    const roundCoverage = body(halftone, 'roundDotCoverage')
    assert.match(roundCoverage, /sqrt\s*\(/,
        `${backend} dot radius must derive from ink area`)
    assert.match(roundCoverage, /DOT_AREA_CAP/,
        `${backend} dots must be capped before they hit square cell boundaries`)
    assert.match(roundCoverage, /MAX_DOT_RADIUS/,
        `${backend} dark dots must grow toward a sub-cell circular radius`)
    assert.doesNotMatch(roundCoverage, /cornerDistance|holeRadius/,
        `${backend} dark tones must not invert into independently owned cell-corner holes`)
    assert.doesNotMatch(roundCoverage, /baseInk/,
        `${backend} dark tones must remain a binary screened pattern, not continuous base ink`)
    assert.doesNotMatch(roundCoverage, /topology|mix\s*\(\s*centerDistance/,
        `${backend} must not interpolate signed-distance fields into a midtone diamond`)
    assert.match(roundCoverage, /mix\s*\(\s*MID_DOT_RADIUS\s*,\s*MAX_DOT_RADIUS/,
        `${backend} dark tones must continue growing the same center dot without crossing the cell edge`)
    assert.doesNotMatch(roundCoverage, /0\.7071/,
        `${backend} round dots must never grow to the square cell corners`)
    assert.doesNotMatch(roundCoverage, /smoothstep\s*\(\s*centerAA\s*,\s*-centerAA/,
        `${backend} round-dot antialiasing must not rely on undefined reversed smoothstep edges`)
    assert.match(halftone, /roundDotCoverage\s*\(fract\(/,
        `${backend} color screens must use the circular dot coverage function`)
}

const windWgsl = read('wind', 'wgsl/wind.wgsl')
const halftoneWgsl = read('halftone', 'wgsl/halftone.wgsl')
for (const [name, source] of [['Wind', windWgsl], ['Halftone', halftoneWgsl]]) {
    assert.match(source, /tileOffset\s*:\s*vec2<f32>/,
        `${name} WGSL must receive tileOffset so procedural geometry does not restart per tile`)
}
assert.match(halftoneWgsl, /fullResolution\s*:\s*vec2<f32>/,
    'Halftone WGSL must use the full export dimensions for its circle center')
assert.deepEqual(halftoneDefinition.globals.monoAngle.ui.enabledBy, {
    and: [
        { param: 'mode', eq: 1 },
        { param: 'pattern', in: [0, 1] },
    ],
}, 'mono angle must be disabled for the concentric-circle pattern that does not read it')

console.log('Wind/Halftone geometry contracts passed')
