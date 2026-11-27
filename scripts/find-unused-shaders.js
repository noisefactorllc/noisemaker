#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { readCatalogMetadata } from './lib/portable-catalog.mjs'

// Find all WGSL files
function findWgslFiles(dir) {
    const files = []
    function walk(d) {
        const entries = fs.readdirSync(d, { withFileTypes: true })
        for (const e of entries) {
            const full = path.join(d, e.name)
            if (e.isDirectory()) walk(full)
            else if (e.name.endsWith('.wgsl')) files.push(full)
        }
    }
    walk(dir)
    return files
}

// The programs an effect's passes name, from its metadata through the catalog
// reader: the same from its definition.json as from its legacy definition.js.
async function findReferencedPrograms(definitionPath) {
    const definition = await readCatalogMetadata(path.dirname(path.resolve(definitionPath)))
    return new Set((definition?.passes ?? []).map(pass => pass?.program).filter(program => typeof program === 'string'))
}

const effectsDir = 'shaders/effects'
const wgslFiles = findWgslFiles(effectsDir)
const definitions = []

function findDefinitions(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) findDefinitions(full)
        else if (e.name === 'definition.js') definitions.push(full)
    }
}
findDefinitions(effectsDir)

// Map effect dir to referenced programs
const usedWgslFiles = new Set()
const missingPrograms = []

for (const def of definitions) {
    const defDir = path.dirname(def)
    const wgslDir = path.join(defDir, 'wgsl')
    const programs = await findReferencedPrograms(def)

    for (const prog of programs) {
        const wgslFile = path.join(wgslDir, prog + '.wgsl')
        if (fs.existsSync(wgslFile)) {
            usedWgslFiles.add(wgslFile)
        } else {
            missingPrograms.push({ def, prog, expected: wgslFile })
        }
    }
}

// Find unused WGSL files
const unused = wgslFiles.filter(f => !usedWgslFiles.has(f))

console.log('=== ANALYSIS ===')
console.log('Total WGSL files:', wgslFiles.length)
console.log('Referenced by definitions:', usedWgslFiles.size)
console.log('Unused:', unused.length)
console.log('Missing programs:', missingPrograms.length)

if (unused.length > 0) {
    console.log('\n=== UNUSED WGSL FILES ===')
    for (const f of unused.sort()) {
        console.log(f)
    }
}

if (missingPrograms.length > 0) {
    console.log('\n=== MISSING PROGRAMS (referenced but file not found) ===')
    for (const { def, prog, expected } of missingPrograms) {
        console.log(`${def}: program "${prog}" -> ${expected}`)
    }
}
