#!/usr/bin/env node
/**
 * GAP-017 auditable mirror: complete, lossless Noisemaker definition-schema
 * introspection, plus an auditable report of exactly what the upstream
 * Shade MCP regex-based `parseDefinitionJs()` projection drops.
 *
 * The upstream Shade MCP definition parser (`vendor/shade-mcp/formats/*.js`,
 * built from `src/formats/definition-js.ts` - `parseDefinitionJs()`) reads
 * effect sources with regexes and a balanced-brace projection instead of
 * importing the live definition. It extracts only globals that carry a
 * `uniform`, a limited scalar-field set, and pass `program` names — so the
 * MCP list/analysis verbs cannot expose the complete Noisemaker definition
 * schema. This module resolves the loss repository-side: it loads the LIVE
 * `definition.js` module (the same source the browser runtime executes) and
 * exposes its complete schema as plain JSON, then audits the real vendored
 * parser's projection against it, reporting exactly which schema
 * information the upstream verb drops (a vendor refresh re-audits
 * automatically instead of pinning a stale snapshot).
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const VENDORED_FORMATS_RELATIVE = '../../vendor/shade-mcp/formats/index.js'

/**
 * JSON-safe serialization for schema values. Functions (lifecycle hooks,
 * per-frame callbacks) are represented as a labeled marker string; all
 * other values pass through unchanged.
 */
export function serializeSchemaValue(value) {
    if (typeof value === 'function') {
        return value.name ? `[function: ${value.name}]` : '[function]'
    }
    if (Array.isArray(value)) {
        return value.map(serializeSchemaValue)
    }
    if (value && typeof value === 'object') {
        const out = {}
        for (const key of Object.keys(value)) {
            out[key] = serializeSchemaValue(value[key])
        }
        return out
    }
    return value
}

/**
 * The complete schema of a live effect definition: every own enumerable
 * property of the Effect instance except the runtime-mutable `state` and
 * `uniforms` accumulators, serialized JSON-safely. Unlike the upstream
 * projection, nothing authored in the definition is dropped.
 */
export function definitionSchema(instance) {
    if (instance == null || typeof instance !== 'object') {
        throw new TypeError('definitionSchema() requires an Effect instance')
    }
    const schema = {}
    for (const key of Object.keys(instance)) {
        if (key === 'state' || key === 'uniforms') continue
        schema[key] = serializeSchemaValue(instance[key])
    }
    return schema
}

/**
 * Load an effect's complete schema by importing its live `definition.js`
 * (or parsing its `definition.json`) — the same source the browser runtime
 * executes — from `effectDir`. Node-only (test/analysis surface), by design.
 */
export async function loadCompleteDefinition(effectDir) {
    const jsonPath = join(effectDir, 'definition.json')
    if (existsSync(jsonPath)) {
        const { parseDefinitionJson } = await import(VENDORED_FORMATS_RELATIVE)
        const { readFileSync } = await import('node:fs')
        return parseDefinitionJson(JSON.parse(readFileSync(jsonPath, 'utf-8')), effectDir)
    }
    const jsPath = join(effectDir, 'definition.js')
    if (!existsSync(jsPath)) {
        throw new Error(`No definition.json or definition.js found in ${effectDir}`)
    }
    const mod = await import(pathToFileURL(jsPath))
    // Definitions export either a live Effect instance or an Effect subclass;
    // the schema is the same either way — the class export just defers
    // instantiation.
    const exported = mod.default
    const instance = typeof exported === 'function' ? new exported() : exported
    return definitionSchema(instance)
}

/**
 * Run the REAL vendored Shade MCP parser (`parseDefinitionJs()` /
 * `parseDefinitionJson()` from `vendor/shade-mcp/formats/index.js`) over an
 * effect directory and return its projection verbatim — the lossy shape the
 * upstream list/analysis tools actually see.
 */
export async function loadUpstreamProjection(effectDir) {
    const vendored = await import(VENDORED_FORMATS_RELATIVE)
    return vendored.loadEffectDefinition(effectDir)
}

function deepEqual(a, b) {
    if (a === b) return true
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
    }
    if (a && b && typeof a === 'object' && typeof b === 'object'
        && !Array.isArray(a) && !Array.isArray(b)) {
        const ka = Object.keys(a)
        const kb = Object.keys(b)
        return ka.length === kb.length && ka.every(k => deepEqual(a[k], b[k]))
    }
    return false
}

const UPSTREAM_META_KEYS = new Set(['format', 'effectDir'])

/**
 * Audit the upstream projection against the complete schema.
 *
 * - `droppedTopLevelFields`: schema fields absent from (or unequal in) the
 *   upstream projection's top level, excluding upstream-only meta fields.
 * - `droppedGlobals` / `droppedGlobalFields`: globals the upstream globals
 *   projection loses entirely (e.g. uniform-less define globals) or fields
 *   it drops per global (e.g. `define`, `choices` objects, `ui`).
 * - `truncatedPasses`: per-pass fields the upstream pass projection drops.
 * - `contradictions`: shared fields whose upstream value DISAGREES with the
 *   complete schema — must stay empty for the projection to be a faithful
 *   (if lossy) subset of the schema.
 */
export function auditSchemaLoss(schema, upstream) {
    const droppedTopLevelFields = []
    const droppedGlobals = []
    const droppedGlobalFields = []
    const truncatedPasses = []
    const contradictions = []

    for (const key of Object.keys(schema)) {
        if (UPSTREAM_META_KEYS.has(key)) continue
        // globals/passes are compared field-by-field in the detail sections
        // below; a wholesale comparison there would misreport the upstream
        // projection's own dropped subfields as contradictions.
        if (key === 'globals' || key === 'passes') continue
        if (!(key in upstream)) {
            droppedTopLevelFields.push(key)
        } else if (!deepEqual(schema[key], upstream[key])) {
            contradictions.push({ where: `top-level ${key}` })
        }
    }

    const upGlobals = upstream.globals || {}
    for (const [name, spec] of Object.entries(schema.globals || {})) {
        if (!(name in upGlobals)) {
            droppedGlobals.push(name)
            continue
        }
        for (const field of Object.keys(spec)) {
            if (!(field in upGlobals[name])) {
                droppedGlobalFields.push({ global: name, field, kind: 'dropped' })
            } else if (!deepEqual(spec[field], upGlobals[name][field])) {
                contradictions.push({ where: `globals.${name}.${field}` })
            }
        }
    }

    const upPasses = upstream.passes || []
    const schemaPasses = schema.passes || []
    // The upstream regex projects one pass per `program:` literal found in the
    // source; definitions that build passes programmatically (loops, spreads)
    // live-project more passes than the source text shows, so the counts can
    // disagree. Report that as a count mismatch and compare only the aligned
    // prefix.
    const aligned = schemaPasses.length === upPasses.length
    schemaPasses.forEach((pass, index) => {
        const up = upPasses[index]
        if (!up || !aligned) {
            truncatedPasses.push({ index, droppedFields: Object.keys(pass) })
            return
        }
        const dropped = []
        for (const field of Object.keys(pass)) {
            if (!(field in up)) dropped.push(field)
            else if (!deepEqual(pass[field], up[field])) {
                contradictions.push({ where: `passes[${index}].${field}` })
            }
        }
        if (dropped.length > 0) truncatedPasses.push({ index, droppedFields: dropped })
    })

    return {
        lossy: droppedTopLevelFields.length > 0
            || droppedGlobals.length > 0
            || droppedGlobalFields.length > 0
            || truncatedPasses.length > 0
            || schemaPasses.length !== upPasses.length,
        droppedTopLevelFields,
        droppedGlobals,
        droppedGlobalFields,
        truncatedPasses,
        passCount: { complete: schemaPasses.length, upstream: upPasses.length },
        contradictions,
    }
}

/**
 * Full audit for one effect directory: complete schema, upstream projection,
 * and the loss report between them.
 */
export async function auditDefinitionLoss(effectDir) {
    const schema = await loadCompleteDefinition(effectDir)
    const upstream = await loadUpstreamProjection(effectDir)
    return {
        effectDir,
        format: upstream.format,
        schema,
        upstream,
        loss: auditSchemaLoss(schema, upstream),
    }
}
