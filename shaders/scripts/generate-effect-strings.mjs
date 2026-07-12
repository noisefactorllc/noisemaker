#!/usr/bin/env node
/**
 * Generate the English base string catalog for effect-facing copy.
 *
 * Emits shaders/effects/strings.en.json — the canonical list of every
 * human-facing effect string (display name, description, parameter labels,
 * enum option labels, namespace labels), keyed by stable IDs derived from the
 * same identifiers the manifest uses. Translators copy this to
 * strings.<locale>.json and translate the values; partial files are fine
 * (missing keys fall back to English at runtime).
 *
 * This is additive: manifest.json and the definitions are untouched. The
 * catalog is loaded only when a consumer opts in via renderer.setLocale(...),
 * so no-locale behavior is unchanged.
 *
 * ID scheme (mirrors the manifest's `<namespace>/<dir>` keys):
 *   <ns>/<effect>                       -> effect display name
 *   <ns>/<effect>#desc                  -> description
 *   <ns>/<effect>.<paramId>             -> parameter label
 *   <ns>/<effect>.<paramId>.<choiceKey> -> enum option label
 *   @ns/<namespace>                     -> namespace label
 */

import { readdirSync, existsSync, writeFileSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..')
const EFFECTS_ROOT = join(PROJECT_ROOT, 'shaders', 'effects')
const OUTPUT_FILE = join(EFFECTS_ROOT, 'strings.en.json')

const NAMESPACES = [
    'classicNoisedeck', 'filter', 'filter3d',
    'mixer', 'points', 'render', 'synth', 'synth3d',
]

// Derive a readable English default from an identifier when an effect provides
// no explicit label. This is the canonical English base — intentionally a touch
// nicer than any single consumer's ad-hoc rendering (e.g. it spaces "3d"), so
// the base is the source of truth rather than a mirror of one consumer.
function camelToSpaceCase(str) {
    return String(str)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/3d/g, ' 3d')
        .toLowerCase()
}

function sortKeys(obj) {
    const sorted = {}
    for (const key of Object.keys(obj).sort()) sorted[key] = obj[key]
    return sorted
}

async function loadEffect(effectDir) {
    const defFile = join(effectDir, 'definition.js')
    const mod = await import(pathToFileURL(defFile).href)
    const exported = mod.default
    if (!exported) return null
    return (typeof exported === 'function') ? new exported() : exported
}

function addParamStrings(catalog, effectId, globals) {
    if (!globals || typeof globals !== 'object') return
    for (const [paramId, spec] of Object.entries(globals)) {
        if (!spec || typeof spec !== 'object') continue
        const ui = spec.ui
        // Only params with a visible control carry a user-facing label.
        if (!ui || ui.control === false || ui.hidden) continue
        catalog[`${effectId}.${paramId}`] = ui.label || camelToSpaceCase(paramId)

        // Enum options (skip null-valued section headers — cosmetic grouping).
        if (spec.choices && typeof spec.choices === 'object') {
            for (const [choiceKey, value] of Object.entries(spec.choices)) {
                if (value === null) continue
                catalog[`${effectId}.${paramId}.${choiceKey}`] = camelToSpaceCase(choiceKey)
            }
        }
    }
}

export async function buildCatalog() {
    const catalog = {}

    for (const namespace of NAMESPACES) {
        const nsDir = join(EFFECTS_ROOT, namespace)
        if (!existsSync(nsDir)) continue
        catalog[`@ns/${namespace}`] = camelToSpaceCase(namespace)

        for (const entry of readdirSync(nsDir).sort()) {
            const effectDir = join(nsDir, entry)
            if (!statSync(effectDir).isDirectory()) continue
            if (!existsSync(join(effectDir, 'definition.js'))) continue

            const effectId = `${namespace}/${entry}`
            let eff
            try {
                eff = await loadEffect(effectDir)
            } catch (err) {
                console.error(`[strings] skipped ${effectId}: ${err.message.split('\n')[0]}`)
                continue
            }
            if (!eff) continue

            catalog[effectId] = eff.name || camelToSpaceCase(entry)
            if (eff.description) catalog[`${effectId}#desc`] = eff.description
            addParamStrings(catalog, effectId, eff.globals)
        }
    }

    return sortKeys(catalog)
}

async function main() {
    const catalog = await buildCatalog()
    writeFileSync(OUTPUT_FILE, JSON.stringify(catalog, null, 2) + '\n')
    console.log(`Generated ${OUTPUT_FILE} (${Object.keys(catalog).length} strings)`)
}

// Run only when invoked directly (so tests can import buildCatalog without writing).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
