#!/usr/bin/env node
/**
 * Generate each effect's definition.js from its definition.json, check that
 * the generated modules are current, and convert a legacy definition.js to
 * JSON.
 *
 *   node scripts/migrate-portable-effects.mjs [--effects-root <dir>]
 *       Write the definition.js of every effect that has a definition.json.
 *   node scripts/migrate-portable-effects.mjs --check [--effects-root <dir>]
 *       Fail, writing nothing, if regenerating would change a definition.js.
 *   node scripts/migrate-portable-effects.mjs --convert <namespace/effect>... [--effects-root <dir>]
 *       Write a definition.json for each effect from its own definition.js,
 *       then its generated definition.js. A conversion is refused unless the
 *       JSON reads back to the same complete metadata as the module it
 *       replaces: a computed value or a method has no JSON form.
 *
 * The export kind and class name of each effect come from the catalog
 * baseline (shaders/tests/fixtures/portable/catalog-baseline.json).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import {
    EFFECTS_ROOT, baselineExportShapes, definedMethods, generateWrapper, instantiateCatalogDefinition, readDefinitionJson,
} from './lib/portable-catalog.mjs'
import { toPortablePackage } from '../shaders/src/portable/definition.js'
import { definitionSchema } from '../shaders/tests/definition-schema.js'

function jsonEffects(effectsRoot) {
    const found = []
    for (const namespace of fs.readdirSync(effectsRoot, { withFileTypes: true })) {
        if (!namespace.isDirectory()) continue
        for (const effect of fs.readdirSync(path.join(effectsRoot, namespace.name), { withFileTypes: true })) {
            const directory = path.join(effectsRoot, namespace.name, effect.name)
            if (effect.isDirectory() && fs.existsSync(path.join(directory, 'definition.json'))) {
                found.push({ effectId: `${namespace.name}/${effect.name}`, directory })
            }
        }
    }
    return found.sort((a, b) => (a.effectId < b.effectId ? -1 : a.effectId > b.effectId ? 1 : 0))
}

/** The generated module of the effect at `directory`. */
export function wrapperFor(effectId, directory, shapes) {
    const shape = shapes.get(effectId)
    if (!shape) throw new Error(`${effectId}: no export kind is recorded for it`)
    const read = readDefinitionJson(directory, { catalog: true })
    if (read.diagnostics.length) throw Object.assign(new Error(`${effectId}: definition.json does not load`), { diagnostics: read.diagnostics })
    return generateWrapper({ definition: read.definition, ...shape })
}

/**
 * The effects whose definition.js differs from the module generated from
 * their definition.json, as { effectId, file, expected }.
 */
export function wrapperDrift({ effectsRoot = EFFECTS_ROOT, shapes = baselineExportShapes().shapes } = {}) {
    const drift = []
    for (const { effectId, directory } of jsonEffects(effectsRoot)) {
        const expected = wrapperFor(effectId, directory, shapes)
        const file = path.join(directory, 'definition.js')
        const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null
        if (actual !== expected) drift.push({ effectId, file, expected })
    }
    return drift
}

/** Write the generated definition.js of every effect that has a definition.json. */
export function writeWrappers(options = {}) {
    const drift = wrapperDrift(options)
    for (const { file, expected } of drift) fs.writeFileSync(file, expected)
    return drift.map(entry => entry.effectId)
}

/**
 * Convert the legacy definition.js of each effect to a definition.json and
 * its generated definition.js. Refuses, writing nothing for that effect,
 * unless the JSON reads back to the same complete metadata.
 */
export async function convertEffects(ids, { effectsRoot = EFFECTS_ROOT, shapes = baselineExportShapes().shapes } = {}) {
    const converted = []
    for (const effectId of ids) {
        const directory = path.join(effectsRoot, ...effectId.split('/'))
        const jsonFile = path.join(directory, 'definition.json')
        if (fs.existsSync(jsonFile)) throw new Error(`${effectId}: already has a definition.json`)
        const shape = shapes.get(effectId)
        if (!shape) throw new Error(`${effectId}: no export kind is recorded for it`)
        const module = await import(pathToFileURL(path.join(directory, 'definition.js')).href)
        const exported = module.default
        const instance = typeof exported === 'function' ? new exported() : exported
        const methods = definedMethods(instance)
        if (methods.length) throw new Error(`${effectId}: its class defines ${methods.join(', ')}, which a definition.json does not hold, so it is not converted`)
        const before = definitionSchema(instance)
        // The version 2 package of the definition, which Shade's reader and
        // the engine's loader both read in full.
        const json = toPortablePackage(JSON.parse(JSON.stringify(before)))
        // Deprecated parameter names, which the catalog context keeps.
        if (before.paramAliases !== undefined) json.paramAliases = before.paramAliases
        fs.writeFileSync(jsonFile, `${JSON.stringify(json, null, 4)}\n`)
        const read = readDefinitionJson(directory, { catalog: true })
        if (read.diagnostics.length || !isDeepStrictEqual(definitionSchema(instantiateCatalogDefinition({ definition: read.definition, ...shape })), before)) {
            fs.rmSync(jsonFile)
            throw Object.assign(new Error(`${effectId}: its definition.json does not load as the same effect, so it is not converted`), { diagnostics: read.diagnostics })
        }
        fs.writeFileSync(path.join(directory, 'definition.js'), generateWrapper({ definition: read.definition, ...shape }))
        converted.push(effectId)
    }
    return converted
}

async function main(argv) {
    let effectsRoot = EFFECTS_ROOT
    let check = false
    const convert = []
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]
        if (arg === '--check') check = true
        else if (arg === '--effects-root') effectsRoot = path.resolve(argv[++index])
        else if (arg === '--convert') {
            while (argv[index + 1] && !argv[index + 1].startsWith('--')) convert.push(argv[++index])
        } else throw new Error(`unknown argument ${arg}`)
    }
    if (convert.length) {
        const converted = await convertEffects(convert, { effectsRoot })
        console.log(`Converted ${converted.join(', ')}`)
        return 0
    }
    if (check) {
        const drift = wrapperDrift({ effectsRoot })
        for (const { effectId } of drift) console.error(`  FAIL: ${effectId}: definition.js is not the module generated from definition.json`)
        if (drift.length) {
            console.error('Run node scripts/migrate-portable-effects.mjs to regenerate them.')
            return 1
        }
        console.log('Every generated definition.js is current')
        return 0
    }
    const written = writeWrappers({ effectsRoot })
    console.log(written.length ? `Regenerated ${written.join(', ')}` : 'Every generated definition.js is current')
    return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).then(code => process.exit(code), error => {
        console.error('Error:', error.message)
        for (const entry of error.diagnostics ?? []) console.error(`  ${entry.path}: ${entry.message} (${entry.code})`)
        process.exit(1)
    })
}
