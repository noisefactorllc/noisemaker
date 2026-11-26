#!/usr/bin/env node
/**
 * Generate the JSON Schema of a version 2 Portable effect package.
 *
 * The schema comes from the shared declaration grammar
 * (shaders/src/portable/grammar.js), which the runtime validator and the
 * Portable normalizer also read. Editors and command-line tools can validate a
 * package with it, without loading Noisemaker or a list of built-in effects.
 * It states the structure: field names, types and value sets. The runtime
 * validator also checks what a schema cannot state, such as a parameter
 * reference in enabledBy or a uniform layout that matches its globals.
 *
 *   node shaders/scripts/generate-portable-schema.mjs          writes the file
 *   node shaders/scripts/generate-portable-schema.mjs --check  writes nothing, and
 *                                                              fails when the file differs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as grammar from '../src/portable/grammar.js'
import { PACKAGE_KEYS } from '../src/portable/definition.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SCHEMA_PATH = path.join(repoRoot, 'shaders', 'portable', 'portable-effect.schema.json')

const ANY = {}
const STRING = { type: 'string' }
const NUMBER = { type: 'number' }
const BOOLEAN = { type: 'boolean' }
const NUMBER_OR_VECTOR = { anyOf: [NUMBER, { type: 'array', items: NUMBER }] }
const IDENTIFIER = { type: 'string', pattern: grammar.IDENTIFIER_PATTERN }
const NAME_MAP = (values) => ({ type: 'object', additionalProperties: values })
// A texture an effect hands on: a name with at least one non-space character.
const TEXTURE_NAME = { type: 'string', pattern: '\\S' }

function closedObject(keys, overrides = {}) {
    return {
        type: 'object',
        properties: Object.fromEntries(keys.map((key) => [key, overrides[key] ?? ANY])),
        additionalProperties: false,
    }
}

const dimension = {
    anyOf: [
        { type: 'number', exclusiveMinimum: 0 },
        { enum: [...grammar.DIM_KEYWORDS] },
        { type: 'string', pattern: '^[0-9]+(\\.[0-9]+)?%$' },
        closedObject(grammar.DIM_SPEC_KEYS, { param: { type: 'string', minLength: 1 }, power: NUMBER, multiply: NUMBER }),
    ],
}

/** The schema, built from the grammar. */
export function buildPortableSchema() {
    const ui = closedObject(grammar.UI_KEYS, {
        label: STRING,
        control: { anyOf: [{ enum: [...grammar.UI_CONTROLS] }, { const: false }] },
        category: STRING,
        hidden: BOOLEAN,
        hint: STRING,
        multiline: BOOLEAN,
    })
    const parameter = {
        ...closedObject(grammar.GLOBAL_SPEC_KEYS, {
            type: { enum: [...grammar.GLOBAL_TYPES] },
            uniform: STRING,
            // A vector parameter states a bound per component.
            min: NUMBER_OR_VECTOR,
            max: NUMBER_OR_VECTOR,
            step: NUMBER_OR_VECTOR,
            choices: { type: 'object' },
            enum: STRING,
            inheritsSeed: BOOLEAN,
            ui: { $ref: '#/$defs/ui' },
        }),
        required: ['type'],
    }
    const texture = closedObject(grammar.TEXTURE_SPEC_KEYS, {
        width: { $ref: '#/$defs/dimension' },
        height: { $ref: '#/$defs/dimension' },
        depth: { $ref: '#/$defs/dimension' },
        format: { enum: [...grammar.FORMATS] },
        is3D: BOOLEAN,
        filter: { enum: [...grammar.TEXTURE_FILTERS] },
        mipmaps: BOOLEAN,
        persistent: BOOLEAN,
    })
    const NAME = { type: 'string', minLength: 1 }
    const POSITIVE_INTEGER = { type: 'integer', minimum: 1 }
    // A condition compares a declared global's value with `equals`.
    const condition = closedObject(['uniform', 'equals'], { uniform: NAME })
    condition.required = ['uniform', 'equals']
    const pass = {
        // A version 2 package refuses the pass fields the runtime never reads.
        ...closedObject(grammar.PASS_KEYS.filter(key => !grammar.INERT_PASS_KEYS.includes(key)), {
            name: IDENTIFIER,
            program: NAME,
            type: { enum: [...grammar.PASS_TYPES] },
            entryPoint: NAME,
            drawMode: { enum: [...grammar.DRAW_MODES] },
            drawBuffers: POSITIVE_INTEGER,
            count: { anyOf: [POSITIVE_INTEGER, { enum: ['auto', 'screen', 'input'] }] },
            countUniform: NAME,
            repeat: { anyOf: [POSITIVE_INTEGER, NAME] },
            blend: { anyOf: [BOOLEAN, { type: 'array', minItems: 2, maxItems: 2, items: NAME }] },
            workgroups: { type: 'array', minItems: 1, maxItems: 3, items: POSITIVE_INTEGER },
            storageTextures: NAME_MAP(NAME),
            viewport: closedObject(['x', 'y', 'w', 'h', 'width', 'height'], {
                x: NUMBER, y: NUMBER, w: NUMBER, h: NUMBER,
                width: { $ref: '#/$defs/dimension' }, height: { $ref: '#/$defs/dimension' },
            }),
            conditions: closedObject(grammar.CONDITION_CONTAINER_KEYS, Object.fromEntries(grammar.CONDITION_CONTAINER_KEYS
                .map(key => [key, { type: 'array', items: condition }]))),
            defines: NAME_MAP({ anyOf: [STRING, NUMBER] }),
            uniforms: NAME_MAP({ anyOf: [NUMBER, NAME] }),
            // A version 2 package refuses the pipeline inputs that nothing writes.
            inputs: NAME_MAP({ ...NAME, pattern: `^(?!(${grammar.INERT_PIPELINE_INPUTS.join('|')})$)` }),
            outputs: NAME_MAP(NAME),
            clear: BOOLEAN,
            samplerTypes: NAME_MAP({ enum: [...grammar.SAMPLER_TYPES] }),
        }),
        required: ['program'],
    }
    // A capability declaration. Whether the capability accepts its options and
    // bindings is stated by the capability's descriptor, not by this schema.
    const roleMap = { type: 'object', propertyNames: { pattern: grammar.IDENTIFIER_PATTERN }, additionalProperties: NAME }
    const capability = {
        description: 'A capability declaration. This schema checks its structure only. Its options and bindings are checked ' +
            'against the capability\'s descriptor, which this schema does not hold, so a check with the schema alone is incomplete. ' +
            'The runtime also refuses an ID declared twice, and a binding to a global or texture the package does not declare.',
        ...closedObject(grammar.CAPABILITY_KEYS, {
            id: { type: 'string', pattern: grammar.CAPABILITY_ID_PATTERN },
            version: POSITIVE_INTEGER,
            options: { type: 'object' },
            bindings: closedObject(grammar.BINDING_KINDS, Object.fromEntries(grammar.BINDING_KINDS.map(kind => [kind, roleMap]))),
        }),
        required: ['id', 'version'],
    }
    const topLevel = {
        format: { const: grammar.PORTABLE_FORMAT },
        version: { const: grammar.PORTABLE_VERSION },
        name: STRING,
        namespace: STRING,
        func: IDENTIFIER,
        description: STRING,
        tags: { type: 'array', items: STRING },
        globals: { type: 'object', propertyNames: { pattern: grammar.IDENTIFIER_PATTERN }, additionalProperties: { $ref: '#/$defs/parameter' } },
        passes: { type: 'object', minProperties: 1, propertyNames: { pattern: grammar.IDENTIFIER_PATTERN }, additionalProperties: { $ref: '#/$defs/pass' } },
        textures: NAME_MAP({ $ref: '#/$defs/texture' }),
        textures3d: NAME_MAP({ $ref: '#/$defs/texture' }),
        defaultProgram: STRING,
        hidden: BOOLEAN,
        capabilities: { type: 'array', items: { $ref: '#/$defs/capability' } },
        starter: BOOLEAN,
        outputTex: TEXTURE_NAME,
        outputXyz: TEXTURE_NAME,
        outputVel: TEXTURE_NAME,
        outputRgba: TEXTURE_NAME,
    }
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'urn:noisemaker:portable-effect:2',
        title: 'Noisemaker Portable effect package, version 2',
        description: 'Generated from shaders/src/portable/grammar.js by shaders/scripts/generate-portable-schema.mjs. Do not edit.',
        ...closedObject(PACKAGE_KEYS, topLevel),
        required: ['format', 'version', 'passes'],
        anyOf: [{ required: ['func'] }, { required: ['name'] }],
        $defs: { ui, parameter, pass, texture, dimension, capability },
    }
}

export function renderPortableSchema() {
    return `${JSON.stringify(buildPortableSchema(), null, 2)}\n`
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
    const text = renderPortableSchema()
    const current = fs.existsSync(SCHEMA_PATH) ? fs.readFileSync(SCHEMA_PATH, 'utf8').replace(/\r\n/g, '\n') : null
    if (process.argv.includes('--check')) {
        if (current !== text) {
            console.error(`${path.relative(repoRoot, SCHEMA_PATH)} is out of date: run node shaders/scripts/generate-portable-schema.mjs`)
            process.exit(1)
        }
        console.log(`${path.relative(repoRoot, SCHEMA_PATH)} is current`)
    } else {
        fs.mkdirSync(path.dirname(SCHEMA_PATH), { recursive: true })
        fs.writeFileSync(SCHEMA_PATH, text)
        console.log(`wrote ${path.relative(repoRoot, SCHEMA_PATH)}`)
    }
}
