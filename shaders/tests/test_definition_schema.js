#!/usr/bin/env node
/**
 * GAP-017 focused regressions: complete, lossless Noisemaker definition
 * introspection (shaders/tests/definition-schema.js).
 *
 * The upstream Shade MCP definition parser (`vendor/shade-mcp/formats/*`,
 * built from `src/formats/definition-js.ts` - `parseDefinitionJs()`) reads
 * definition sources with regexes and a balanced-brace projection instead of
 * importing the live definition, so the list/analysis tools cannot expose the
 * complete Noisemaker definition schema. These regressions pin the
 * repository-side resolution: the complete schema (both live-instance and
 * Effect-subclass exports) exposes every authored field, and the loss audit
 * shows the upstream projection is a faithful but lossy subset of it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    auditDefinitionLoss,
    auditSchemaLoss,
    definitionSchema,
    loadCompleteDefinition,
    serializeSchemaValue,
} from './definition-schema.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const EFFECTS_ROOT = path.join(REPO_ROOT, 'shaders', 'effects')

function onDiskEffectIds() {
    const ids = []
    for (const ns of fs.readdirSync(EFFECTS_ROOT, { withFileTypes: true })) {
        if (!ns.isDirectory() || ns.name.startsWith('.')) continue
        const nsDir = path.join(EFFECTS_ROOT, ns.name)
        for (const entry of fs.readdirSync(nsDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue
            if (fs.existsSync(path.join(nsDir, entry.name, 'definition.js'))) {
                ids.push(`${ns.name}/${entry.name}`)
            }
        }
    }
    return ids.sort()
}

// ---------------------------------------------------------------------------
// serializeSchemaValue / definitionSchema: lossless JSON-safe projection.
// ---------------------------------------------------------------------------

assert.deepEqual(serializeSchemaValue(5), 5)
assert.deepEqual(serializeSchemaValue('x'), 'x')
assert.deepEqual(serializeSchemaValue(null), null)
assert.deepEqual(serializeSchemaValue([1, { a: 2 }]), [1, { a: 2 }])
assert.equal(serializeSchemaValue(function named() {}), '[function: named]')
assert.equal(serializeSchemaValue(() => {}), '[function]')

// Runtime-mutable containers are excluded; authored fields are all exposed.
const schema = definitionSchema({
    state: {},
    uniforms: {},
    name: 'N',
    globals: {
        threshold: { type: 'float', default: 0.5, uniform: 'threshold', min: 0, max: 1 },
        type: {
            type: 'int',
            default: 0,
            define: 'KIND',
            choices: { a: 0, b: 1 },
            ui: { label: 'kind', control: 'dropdown' },
        },
    },
    passes: [{ name: 'main', program: 'main', inputs: { u: 't0' }, outputs: ['o0'] }],
    uniformLayout: { time: { slot: 0, components: 'z' } },
    onUpdate() {},
})
assert.deepEqual(Object.keys(schema).sort(), ['globals', 'name', 'onUpdate', 'passes', 'uniformLayout'])
assert.equal(schema.onUpdate, '[function: onUpdate]')
assert.deepEqual(schema.globals.threshold, {
    type: 'float', default: 0.5, uniform: 'threshold', min: 0, max: 1,
})
assert.deepEqual(schema.globals.threshold.ui?.label ?? undefined, undefined)
assert.equal(schema.passes[0].inputs.u, 't0')

assert.throws(() => definitionSchema(null), /Effect instance/)
assert.throws(() => definitionSchema(42), /Effect instance/)

// ---------------------------------------------------------------------------
// loadCompleteDefinition: live-instance and Effect-subclass exports.
// ---------------------------------------------------------------------------

// synth/noise: carries a uniform-less compile-time define global (`type` with
// `define`, `choices`, `ui`), plus uniformLayout and paramAliases.
const noiseSchema = await loadCompleteDefinition('shaders/effects/synth/noise')
assert.equal(noiseSchema.namespace, 'synth')
assert.equal(noiseSchema.func, 'noise')
assert.ok(noiseSchema.uniformLayout, 'uniformLayout is exposed')
assert.ok(noiseSchema.paramAliases, 'paramAliases are exposed')
assert.ok(noiseSchema.globals.type, 'the uniform-less define global is exposed')
assert.equal(noiseSchema.globals.type.define, 'NOISE_TYPE')
assert.equal(noiseSchema.globals.type.choices.simplex, 10)
assert.equal(noiseSchema.globals.type.ui.control, 'dropdown')

// classicNoisedeck/cellNoise exports an Effect subclass with class fields and
// a std-enum-derived choices map; instantiation must expose all of it.
const cellNoiseSchema = await loadCompleteDefinition('shaders/effects/classicNoisedeck/cellNoise')
assert.equal(cellNoiseSchema.name, 'CellNoise')
assert.ok(cellNoiseSchema.uniformLayout, 'subclass-exported uniformLayout is exposed')
assert.ok(Object.keys(cellNoiseSchema.globals).length > 0, 'class-field globals are exposed')

// ---------------------------------------------------------------------------
// auditSchemaLoss: identical shapes are faithful; the upstream projection
// only ever loses information.
// ---------------------------------------------------------------------------

// Nothing shared may contradict; identical info means no loss flags.
const sameSchema = auditSchemaLoss(
    { name: 'X', globals: { a: { type: 'float', uniform: 'a', default: 1 } }, passes: [{ program: 'main' }] },
    { name: 'X', globals: { a: { name: 'a', type: 'float', uniform: 'a', default: 1 } }, passes: [{ program: 'main' }] },
)
assert.deepEqual(sameSchema.contradictions, [])

// Shared fields agree; lost fields are reported as drops, not alterations.
const noiseAudit = await auditDefinitionLoss('shaders/effects/synth/noise')
assert.equal(noiseAudit.format, 'js')
// The projection does not model Noisemaker-specific top-level fields.
assert.ok(noiseAudit.loss.droppedTopLevelFields.includes('uniformLayout'))
assert.ok(noiseAudit.loss.droppedTopLevelFields.includes('paramAliases'))
// It keeps every global, including define-only globals, with ui, and every
// pass with its name, inputs and outputs (shade-mcp#30).
assert.deepEqual(noiseAudit.loss.droppedGlobals, [], 'no global is dropped')
assert.ok(
    !noiseAudit.loss.droppedGlobalFields.some(e => e.field === 'ui' || e.field === 'define'),
    'per-global ui and define are kept',
)
assert.deepEqual(noiseAudit.loss.truncatedPasses, [], 'pass name/inputs/outputs are kept')
assert.deepEqual(noiseAudit.loss.contradictions, [])

// ---------------------------------------------------------------------------
// Corpus gate: every on-disk effect is fully exposed, and the upstream
// projection never contradicts the live definition — it only loses.
// ---------------------------------------------------------------------------

const allEffects = onDiskEffectIds()
let lossyCount = 0
let contradictionCount = 0
for (const effectId of allEffects) {
    const audit = await auditDefinitionLoss(path.join('shaders', 'effects', ...effectId.split('/')))
    if (audit.loss.lossy) lossyCount++
    if (audit.loss.contradictions.length > 0) {
        contradictionCount++
        if (contradictionCount <= 3) {
            console.log(`CONTRADICTION ${effectId}: ${JSON.stringify(audit.loss.contradictions.slice(0, 3))}`)
        }
    }
}
console.log(`corpus: ${allEffects.length} effects, lossy upstream projection on ${lossyCount}, contradictions ${contradictionCount}`)
assert.equal(contradictionCount, 0, 'the upstream projection must never disagree with the live definition')
assert.ok(lossyCount > 0, 'the corpus must exercise the fields the projection does not model')

console.log('PASS: definition-schema regressions')
