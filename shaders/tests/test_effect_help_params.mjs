/**
 * Help-table guard.
 *
 * Every effect ships a help.md whose parameter table is bundled into the
 * effect by scripts/bundle-effects.js, so a wrong row is not a local
 * documentation slip: it reaches every consumer of the bundle. Nothing checked
 * those tables against the definitions they describe, and five had drifted.
 *
 * Four of the five had drifted the same way, by documenting a parameter's UI
 * label instead of its name: filter/scroll's `x` and `y` carry the labels
 * "offset x" and "offset y" and were written up as `offsetX` and `offsetY`,
 * filter/osd's `corner` is labelled "position", and filter/tint's `alpha` is
 * labelled "amount". The other two named parameters that had been removed —
 * synth/julia's `zoom`, superseded by the zoomSpeed/zoomDepth pair, and
 * synth/navierStokes's `weight`. In every case the table named something a
 * reader could not type.
 *
 * The check runs both directions. A documented parameter must exist, and once
 * the tables were completed, every declared parameter must be documented too,
 * so a parameter added to a definition cannot ship undescribed.
 *
 * It does not require a table at all: filter/tetraColorArray,
 * filter/tetraCosine, mixer/mashup, render/renderCubemapSurface and
 * synth/remap document their parameters as prose under `###` headings, which
 * is a house style choice and not this test's business. Only effects that
 * already present a table are held to it.
 *
 * Globals are the keys of the effect's metadata, read through the catalog
 * reader (scripts/lib/portable-catalog.mjs): the same from a definition.json
 * as from a legacy definition.js, whether it is an object literal or a class
 * with a `globals` field. They were read out of the definition source before,
 * which missed the ten class definitions until both forms were parsed, and
 * which cannot read a generated module, whose keys are quoted. A definition
 * whose globals cannot be read is a failure, not a skip.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { readCatalogMetadata } from '../../scripts/lib/portable-catalog.mjs'
import { Effect } from '../src/runtime/effect.js'
import { definitionSchema } from './definition-schema.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EFFECTS_DIR = join(__dirname, '..', 'effects')

/** The parameter names the DSL accepts: the keys of the metadata's globals. */
function globalsOf(definition) {
    const globals = definition?.globals
    return globals && typeof globals === 'object' ? Object.keys(globals) : null
}

/**
 * Parameter names from the leading column of the `| Parameter |` table.
 *
 * Every cell is returned, including ones that are not identifiers at all. That
 * matters: the first version of this check matched only bare identifiers and
 * skipped everything else, which meant a row written as the parameter's label
 * — "scale x", "repeat y", "1:1 aspect" — was silently ignored rather than
 * reported, hiding the very defect the check exists to find in four more
 * effects. A parameter name is always a bare identifier, so a cell that is not
 * one is a finding, never something to pass over.
 *
 * Backticks are stripped first: synth3d/flythrough3d writes its names as
 * `type`, `power` and so on, which is a formatting choice and not a defect.
 */
function documentedParams(markdown) {
    const names = []
    let inTable = false
    for (const line of markdown.split('\n')) {
        if (/^\|\s*Parameter\s*\|/i.test(line)) { inTable = true; continue }
        if (!inTable) continue
        if (/^\|[\s\-|:]+\|$/.test(line.trim())) continue
        if (!line.trim().startsWith('|')) { inTable = false; continue }
        const cell = line.split('|')[1]
        if (cell === undefined) continue
        const name = cell.trim().replace(/`/g, '')
        if (name) names.push(name)
    }
    return names
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

async function collect() {
    const effects = []
    const unreadable = []
    for (const ns of readdirSync(EFFECTS_DIR)) {
        const nsDir = join(EFFECTS_DIR, ns)
        if (!statSync(nsDir).isDirectory()) continue
        for (const name of readdirSync(nsDir)) {
            const def = join(nsDir, name, 'definition.js')
            const help = join(nsDir, name, 'help.md')
            if (!existsSync(def) || !existsSync(help)) continue
            const globals = globalsOf(await readCatalogMetadata(join(nsDir, name)))
            if (globals === null) { unreadable.push(`${ns}/${name}`); continue }
            effects.push({
                id: `${ns}/${name}`,
                globals: new Set(globals),
                documented: documentedParams(readFileSync(help, 'utf8')),
            })
        }
    }
    return { effects, unreadable }
}

/** `id: name, ...` for each table row that names no declared parameter. */
function ghostViolations(effects) {
    const violations = []
    for (const { id, globals, documented } of effects) {
        const ghosts = documented.filter(p => !globals.has(p))
        if (ghosts.length) {
            const detail = ghosts
                .map(p => (IDENTIFIER.test(p) ? p : `"${p}" (not an identifier, so it can only be a label)`))
                .join(', ')
            violations.push(`${id}: ${detail}`)
        }
    }
    return violations
}

/** `id: name, ...` for each declared parameter that the table does not list. */
function undocumentedViolations(effects) {
    const violations = []
    for (const { id, globals, documented } of effects) {
        // Prose-format help files opt out by having no table at all.
        if (!documented.length) continue
        const undocumented = [...globals].filter(p => !documented.includes(p))
        if (undocumented.length) {
            violations.push(`${id}: ${undocumented.join(', ')}`)
        }
    }
    return violations
}

function test(name, fn) {
    try {
        console.log(`Running test: ${name}`)
        fn()
        console.log(`PASS: ${name}`)
    } catch (error) {
        console.error(`FAIL: ${name}`)
        console.error(error.message || error)
        process.exit(1)
    }
}

const { effects, unreadable } = await collect()

test('a class definition with an undocumented parameter fails the check', () => {
    class Probe extends Effect {
        globals = {
            documented: { type: 'float', default: 1, ui: { label: 'documented' } },
            missing: { type: 'float', default: 0, ui: { label: 'missing' } },
        }
    }
    const table = [
        '| Parameter | Type | Default | Range | Description |',
        '|-----------|------|---------|-------|-------------|',
        '| documented | float | 1 | - | Documented |',
    ].join('\n')
    const globals = globalsOf(definitionSchema(new Probe()))
    if (globals === null) throw new Error('globalsOf read no globals from a `globals = {` class field')
    if (globals.join(',') !== 'documented,missing') {
        throw new Error(`globalsOf read [${globals.join(', ')}] from the class field, expected [documented, missing]`)
    }
    const probe = [{ id: 'probe/classDefinition', globals: new Set(globals), documented: documentedParams(table) }]
    const violations = undocumentedViolations(probe)
    if (violations.join('\n') !== 'probe/classDefinition: missing') {
        throw new Error(`expected one violation for 'missing', got: ${JSON.stringify(violations)}`)
    }
})

test('every effect definition with a help.md has globals the check can read', () => {
    if (unreadable.length) {
        throw new Error(
            'No globals were found in the metadata of these definitions, so\n' +
            'their help.md tables cannot be checked:\n  ' +
            unreadable.join('\n  '),
        )
    }
})

test('every parameter in a help.md table exists in the effect definition', () => {
    const violations = ghostViolations(effects)
    if (violations.length) {
        throw new Error(
            'help.md documents parameters the definition does not declare. The\n' +
            'usual cause is documenting a parameter\'s ui.label instead of its\n' +
            'name; the other is a parameter that was renamed or removed. The\n' +
            'globals of the effect definition are the authority:\n  ' +
            violations.join('\n  '),
        )
    }
})

test('every parameter in the definition appears in the help.md table', () => {
    const violations = undocumentedViolations(effects)
    if (violations.length) {
        throw new Error(
            'Effect definitions declare parameters their help.md table does not\n' +
            'list. Add a row per parameter, or move the effect to the prose\n' +
            'format if a table no longer suits it:\n  ' +
            violations.join('\n  '),
        )
    }
})

const rows = effects.reduce((n, e) => n + e.documented.length, 0)
console.log(`\nChecked ${rows} documented parameters across ${effects.length} effects.`)
