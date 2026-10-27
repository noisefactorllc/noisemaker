import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

// Static checks that a pixel parity case cannot make: both backends' shaders
// must read the same named values. A WGSL uniform that nothing feeds renders
// its zero value (noise3d read `noiseScale`, scanlineError `noise_amount`),
// and a numeric constant that differs between GLSL and WGSL diverges only
// past it (mandelbrot capped iterations at 500 in GLSL and 2048 in WGSL).

const effectsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../shaders/effects')
const ENGINE_UNIFORMS = /^(time|deltaTime|frame|aspect|resolution|tileOffset|fullResolution|renderScale)$/

function readSources(dir, sub, extensions) {
    const full = path.join(dir, sub)
    if (!fs.existsSync(full)) return ''
    return fs.readdirSync(full)
        .filter((file) => extensions.some((ext) => file.endsWith(ext)))
        .map((file) => fs.readFileSync(path.join(full, file), 'utf8'))
        .join('\n')
}

function numericConstants(source, patterns) {
    const constants = new Map()
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            if (!constants.has(match[1])) constants.set(match[1], new Set())
            constants.get(match[1]).add(parseFloat(match[2]))
        }
    }
    return constants
}

const unfed = []
const mismatched = []
let comparedConstants = 0
let sawMandelbrotCap = false

for (const namespace of fs.readdirSync(effectsRoot)) {
    const namespaceDir = path.join(effectsRoot, namespace)
    if (!fs.statSync(namespaceDir).isDirectory()) continue
    for (const effect of fs.readdirSync(namespaceDir)) {
        const dir = path.join(namespaceDir, effect)
        if (!fs.existsSync(path.join(dir, 'definition.js'))) continue
        if (!fs.existsSync(path.join(dir, 'wgsl')) || !fs.existsSync(path.join(dir, 'glsl'))) continue
        const id = `${namespace}/${effect}`
        const wgsl = readSources(dir, 'wgsl', ['.wgsl'])
        const glsl = readSources(dir, 'glsl', ['.glsl', '.vert', '.frag'])

        // Individually bound WGSL uniforms (packed `uniforms`/`params` blocks
        // are laid out by the engine and are not checked here).
        const definition = (await import(pathToFileURL(path.join(dir, 'definition.js')).href)).default
        const fed = new Set([...glsl.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((match) => match[1]))
        for (const [name, spec] of Object.entries(definition.globals || {})) {
            fed.add(name)
            if (spec.uniform) fed.add(spec.uniform)
        }
        for (const pass of definition.passes || []) {
            for (const name of Object.keys(pass.uniforms || {})) fed.add(name)
        }
        for (const match of wgsl.matchAll(/var<uniform>\s+(\w+)\s*:/g)) {
            const name = match[1]
            if (name === 'u' || name === 'uniforms' || name === 'params' || name.startsWith('_')) continue
            if (ENGINE_UNIFORMS.test(name) || fed.has(name)) continue
            unfed.push(`${id}: WGSL uniform ${name} is not fed by the definition`)
        }

        const glslConstants = numericConstants(glsl, [
            /(?:^|\n)\s*const\s+(?:int|uint|float)\s+(\w+)\s*=\s*([-0-9.eu]+)\s*;/g,
            /(?:^|\n)\s*#define\s+(\w+)\s+([-0-9.eu]+)\s*(?:\n|\/\/)/g,
        ])
        const wgslConstants = numericConstants(wgsl, [/(?:^|\n)\s*const\s+(\w+)\s*(?::\s*\w+)?\s*=\s*([-0-9.eu]+)\s*;/g])
        for (const [name, values] of glslConstants) {
            if (!wgslConstants.has(name)) continue
            comparedConstants++
            if (id === 'synth/mandelbrot' && name === 'MAX_ITER') sawMandelbrotCap = true
            const a = [...values].sort().join(',')
            const b = [...wgslConstants.get(name)].sort().join(',')
            if (a !== b) mismatched.push(`${id}: ${name} is ${a} in GLSL and ${b} in WGSL`)
        }
    }
}

assert.ok(sawMandelbrotCap && comparedConstants > 10, `constant scan compared too little (${comparedConstants})`)
assert.deepStrictEqual(unfed, [], 'every individually bound WGSL uniform must be fed')
assert.deepStrictEqual(mismatched, [], 'GLSL and WGSL constants of the same name must agree')

console.log(`backend source contract passed (${comparedConstants} shared constants)`)
