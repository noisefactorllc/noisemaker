#!/usr/bin/env node
/**
 * Generate the pass property and resource form tables of the Portable format
 * specification (docs/shaders/effects.rst, Section 8) from the shared grammar.
 *
 * The accepted values come from the generated JSON Schema, so the tables say
 * what the validator accepts. Each entry's meaning and backend support are
 * written below, and the run fails when the grammar lists an entry that has
 * none, so a new pass property or resource form cannot ship undocumented.
 *
 *   node shaders/scripts/generate-portable-tables.mjs          writes the file
 *   node shaders/scripts/generate-portable-tables.mjs --check  writes nothing, and
 *                                                              fails when the file differs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as grammar from '../src/portable/grammar.js'
import { buildPortableSchema } from './generate-portable-schema.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const TABLES_PATH = path.join(repoRoot, 'docs', 'shaders', 'portable-grammar.inc')

const BOTH = 'WebGL2, WebGPU'

// [backends, meaning] for each pass property.
const PASS = {
    name: [BOTH, 'Legacy only: the pass name. In version 2 the key of the pass is its name, a DSL identifier.'],
    program: [BOTH, 'Required. The program the pass runs: ``glsl/<program>.glsl``, or ``glsl/<program>.vert`` with ``glsl/<program>.frag``, and ``wgsl/<program>.wgsl`` (Section 8.1).'],
    type: [BOTH, 'Labels the pass. WebGPU chooses compute or render from the ``@compute`` or ``@fragment`` entry in the WGSL source.'],
    entryPoint: ['WebGPU', 'The compute entry point. An entry point found in the source takes precedence. WebGL2 and WebGPU render passes ignore it.'],
    drawMode: [BOTH, 'Draws ``points``, ``billboards`` (one quad for each instance) or ``triangles`` (with a depth test, back-face culling and depth cleared for each pass). Without it the pass draws one full-screen triangle.'],
    drawBuffers: [BOTH, 'More than one selects the multiple render target path. The attachments follow the order of the ``outputs`` keys.'],
    count: [BOTH, 'The vertex or instance count. ``auto`` and ``screen`` use the size of the output texture. ``input`` uses the size of ``xyzTex`` or ``inputTex`` for points, ``xyzTex`` for billboards, and ``meshPositions`` or ``inputTex`` for triangles.'],
    countUniform: [BOTH, 'Triangles only: a declared global whose value, when above 0, sets the count.'],
    repeat: [BOTH, 'Runs the pass this many times in each frame: an integer, or a uniform name that resolves to one.'],
    blend: [BOTH, '``true`` blends additively (one, one). ``[src, dst]`` names the two blend factors.'],
    workgroups: ['WebGPU', 'The compute dispatch size in workgroups, for each dimension. A legacy definition may also give a uniform name, which has no effect; version 2 refuses one.'],
    storageBuffers: ['none', 'Legacy only. It has no effect: the WebGPU backend allocates storage buffers from the shader bindings. Version 2 refuses it.'],
    storageTextures: [BOTH, 'Storage binding name to the texture a compute pass writes: ``outputTex``, a texture the effect declares or a ``global_`` surface. WebGL2 runs the pass\'s GLSL program as a fragment pass that writes the same texture (Limitations below).'],
    viewport: [BOTH, 'The pass region: ``x``, ``y``, ``w`` and ``h`` in pixels, or ``width`` and ``height`` in the size grammar. When the pass writes a texture, both backends render to the full size of that texture.'],
    conditions: [BOTH, '``runIf`` and ``skipIf``: lists of ``{ "uniform", "equals" }``. Each compares a declared global with its value by strict equality, each frame.'],
    defines: [BOTH, 'Preprocessor definitions. The pass runs its own build of its program with them.'],
    uniforms: [BOTH, 'Shader uniform to a global name, or to a numeric literal.'],
    inputs: [BOTH, `Sampler name to texture: a pipeline input (${grammar.PIPELINE_INPUTS.filter(name => !grammar.INERT_PIPELINE_INPUTS.includes(name)).map(name => `\`\`${name}\`\``).join(', ')}), \`\`o0\`\` to \`\`o7\`\`, a \`\`global_\`\` surface, a declared texture, a global, or the \`\`externalTexture\`\` name. Version 2 refuses ${grammar.INERT_PIPELINE_INPUTS.map(name => `\`\`${name}\`\``).join(', ')}, which nothing writes.`],
    outputs: [BOTH, `Fragment output to texture: a pipeline output (${grammar.PIPELINE_OUTPUTS.map(name => `\`\`${name}\`\``).join(', ')}), a \`\`${grammar.FEEDBACK_PREFIX}\`\` texture, a \`\`global_\`\` surface, or a declared texture. Writing to a chain input writes the value back to it.`],
    clear: ['WebGPU', 'Clears the target before the pass. WebGL2 effect passes do not clear.'],
    samplerTypes: ['WebGPU', 'WGSL sampler binding name to ``default`` (linear), ``nearest``, ``repeat`` or ``mipmap``. Without it WebGPU samples nearest, an uploaded texture with ``default``, a mipmapped input with ``mipmap`` and a 3D input with its filter. WebGL2 samples 2D textures nearest, and mipmapped textures with linear mipmap filtering.'],
}

// [declared by, backends, meaning] for each resource form.
const RESOURCE = {
    texture: ['``textures``', BOTH, 'A 2D texture. The size is a number, ``screen``, ``auto``, ``input`` or ``resolution`` (the screen size), a percentage, or a size object (Section 8.6). A size that is not a plain number is resolved again when the canvas resizes. The format defaults to ``rgba16f``.'],
    persistentTexture: ['``persistent: true``', BOTH, 'Keeps the contents when the texture is created again at a new size, and through a simulation reset.'],
    mipmappedTexture: ['``mipmaps: true``', BOTH, 'Allocates a mip chain, which the pipeline generates again after each render. A simulation step may not sample it.'],
    volumeTexture: ['``textures3d``', 'WebGPU writes, WebGL2 samples', 'A 3D texture. ``depth`` defaults to the width, and ``filter`` to ``linear``. WebGL2 creates no framebuffer for a 3D texture: it can sample one but not write one.'],
    volumeAtlas: ['``outputTex3d`` and a ``volumeSize`` global', BOTH, 'A volume stored as a 2D atlas, sized with ``{ "param": "volumeSize" }`` by ``{ "param": "volumeSize", "power": 2 }``. ``outputTex3d`` hands it on to the next effect, and ``volumeSize`` passes down the chain. The size is clamped to the device limit.'],
    geometry: ['``outputGeo``', BOTH, 'A geometry buffer that ``outputGeo`` hands on to the next effect. ``"inputGeo"`` passes the incoming buffer through.'],
    particleState: ['``textures.global_xyz``', BOTH, 'Particle state shared by the effects of one chain: ``global_xyz``, ``global_vel`` and ``global_rgba``. These surfaces keep their bindings from frame to frame instead of swapping.'],
    multipleRenderTargets: ['several ``outputs`` and ``drawBuffers``', BOTH, 'One pass writes several textures. When the colour attachments exceed the device budget, trailing ``rgba32f`` attachments are allocated as ``rgba16f``.'],
    storageTexture: ['``storageTextures``', BOTH, 'A texture that a compute pass writes through a storage binding on WebGPU, and as a render target on WebGL2.'],
    globalSurface: ['``o0`` to ``o7``, ``global_<name>``', BOTH, 'Surfaces that every effect shares, double-buffered. ``o0`` to ``o7``, ``geo0`` to ``geo7`` and ``vol0`` to ``vol7`` always exist, and a ``global_`` surface exists once a pass names it. An ``oN`` input reads the chain input.'],
    meshSurface: ['``global_mesh<N>_positions``, ``_normals``, ``_uvs``', BOTH, 'The vertex data of ``mesh0`` to ``mesh7``, which the host fills with ``loadOBJFromURL()`` or ``loadOBJFromString()``. A triangles pass reads them by ``texelFetch``.'],
    hostTexture: ['``midiNoteGrid``, ``externalTexture``', BOTH, 'Data the host uploads: the MIDI note grid each frame, and the media texture that ``externalTexture`` names, through ``updateTextureFromSource()``.'],
    sampler: ['``samplerTypes``', 'WebGPU', 'The sampler of a sampled WGSL input (see ``samplerTypes``).'],
}

// The accepted values of a schema node, as reStructuredText.
function describe(node, defs) {
    if (node.$ref) return describe(defs[node.$ref.split('/').pop()], defs)
    if (node.enum) return node.enum.map(value => `\`\`${JSON.stringify(value)}\`\``).join(', ')
    if ('const' in node) return `\`\`${JSON.stringify(node.const)}\`\``
    if (node.anyOf) return node.anyOf.map(option => describe(option, defs)).join('; or ')
    if (node.type === 'integer') return node.minimum === 1 ? 'positive integer' : 'integer'
    if (node.type === 'number') return node.exclusiveMinimum === 0 ? 'number above 0' : 'number'
    if (node.type === 'boolean') return 'boolean'
    if (node.type === 'string') return node.pattern === grammar.IDENTIFIER_PATTERN ? 'DSL identifier' : (node.minLength ? 'nonempty string' : 'string')
    if (node.type === 'array') {
        const bounds = node.minItems === node.maxItems ? `${node.minItems}` : `${node.minItems ?? 0} to ${node.maxItems ?? 'any number of'}`
        return `array of ${bounds} items, each: ${describe(node.items ?? {}, defs)}`
    }
    if (node.type === 'object') {
        if (node.properties && node.additionalProperties === false) {
            return `object with ${Object.keys(node.properties).map(key => `\`\`${key}\`\``).join(', ')}`
        }
        if (node.additionalProperties && typeof node.additionalProperties === 'object') {
            return `object of names to: ${describe(node.additionalProperties, defs)}`
        }
        return 'object'
    }
    return 'any value'
}

function row(cells) {
    return cells.map((cell, index) => `${index === 0 ? '   * - ' : '     - '}${cell}`).join('\n')
}

export function renderPortableTables() {
    const schema = buildPortableSchema()
    const missing = [
        ...grammar.PASS_KEYS.filter(key => !PASS[key]).map(key => `pass property ${key}`),
        ...grammar.RESOURCE_FORMS.filter(form => !RESOURCE[form]).map(form => `resource form ${form}`),
        ...Object.keys(PASS).filter(key => !grammar.PASS_KEYS.includes(key)).map(key => `stale pass property ${key}`),
        ...Object.keys(RESOURCE).filter(form => !grammar.RESOURCE_FORMS.includes(form)).map(form => `stale resource form ${form}`),
    ]
    if (missing.length > 0) throw new Error(`the tables need a description for: ${missing.join(', ')}`)
    const passNode = schema.$defs.pass.properties
    const lines = [
        '.. This file is generated by shaders/scripts/generate-portable-tables.mjs from',
        '   shaders/src/portable/grammar.js. Do not edit it by hand.',
        '',
        '.. list-table:: Pass properties',
        '   :header-rows: 1',
        '   :widths: 16 26 12 46',
        '',
        row(['Property', 'Accepted values', 'Backends', 'Meaning']),
        ...grammar.PASS_KEYS.map(key => row([`\`\`${key}\`\``,
            passNode[key] ? describe(passNode[key], schema.$defs) : 'refused in version 2', PASS[key][0], PASS[key][1]])),
        '',
        '.. list-table:: Resource forms',
        '   :header-rows: 1',
        '   :widths: 16 22 14 48',
        '',
        row(['Form', 'Declared by', 'Backends', 'Meaning']),
        ...grammar.RESOURCE_FORMS.map(form => row([`\`\`${form}\`\``, ...RESOURCE[form]])),
        '',
    ]
    return lines.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const text = renderPortableTables()
    if (process.argv.includes('--check')) {
        const current = fs.existsSync(TABLES_PATH) ? fs.readFileSync(TABLES_PATH, 'utf8').replace(/\r\n/g, '\n') : null
        if (current !== text) {
            console.error(`${path.relative(repoRoot, TABLES_PATH)} is stale: run node shaders/scripts/generate-portable-tables.mjs`)
            process.exit(1)
        }
        console.log(`${path.relative(repoRoot, TABLES_PATH)} is current`)
    } else {
        fs.writeFileSync(TABLES_PATH, text)
        console.log(`Wrote ${path.relative(repoRoot, TABLES_PATH)}`)
    }
}
