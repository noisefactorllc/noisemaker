// One-shot helper: convert textureSample(<args>) → textureSampleLevel(<args>, 0.0)
// in WGSL files. Only touches files passed as args.
//
// Usage:
//   node shaders/tests/.convert-textureSample.mjs path/to/file.wgsl ...
//
// Used to fix the noisemaker WGSL bind-group layout mismatch on rgba16float
// textures, which are unfilterable on WebGPU without the float32-filterable
// feature. textureSampleLevel takes an explicit mip level so no derivatives
// or filtering are needed; the bind-group layout aligns correctly.

import { readFileSync, writeFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (files.length === 0) {
    console.error('Usage: node .convert-textureSample.mjs <file.wgsl> [...]')
    process.exit(1)
}

// Regex matches textureSample( arguments ), where arguments may contain ONE level
// of balanced parens (e.g. vec2<f32>(x, y)). The negative lookbehind for
// alphanumeric chars before `textureSample` keeps us from matching
// textureSampleLevel/Grad/etc.
const re = /(?<![A-Za-z_])textureSample\(((?:[^()]|\([^()]*\))*)\)/g

let totalChanges = 0
for (const path of files) {
    const original = readFileSync(path, 'utf8')
    let changed = 0
    const updated = original.replace(re, (_match, args) => {
        changed += 1
        return `textureSampleLevel(${args}, 0.0)`
    })
    if (changed > 0) {
        writeFileSync(path, updated)
        console.log(`  ${path}: ${changed} call(s) converted`)
        totalChanges += changed
    } else {
        console.log(`  ${path}: no textureSample calls found (already converted?)`)
    }
}
console.log(`\nTotal: ${totalChanges} call(s) converted across ${files.length} file(s)`)
