/**
 * Contract test for the machine-facing Noisemaker development documentation.
 *
 * Runtime tests prove engine behavior. This file proves that llms-full.txt
 * exposes those behaviors in a predictable form and pins the authoring fields,
 * MCP signatures, worked transcript, thresholds, graph shape, matrix, and gaps
 * that an agent must consume without prose inference.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import testPatternEffect from '../effects/synth/testPattern/definition.js'
import { registerOp } from '../src/lang/ops.js'
import { registerStarterOps } from '../src/lang/validator.js'
import { compileGraph } from '../src/runtime/compiler.js'
import { registerEffect } from '../src/runtime/registry.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const contract = readFileSync(join(root, 'llms-full.txt'), 'utf8')
const shortIndex = readFileSync(join(root, 'llms.txt'), 'utf8')
const shaderIndex = readFileSync(join(root, 'docs', 'shaders.rst'), 'utf8')

const surfaces = [
  ['DSL', 'DSL program'],
  ['EFFECT', 'Effect definition'],
  ['GLOBALS', 'Parameters and globals'],
  ['GRAPH', 'Passes and render graph'],
  ['TEXTURES', 'Textures and surface resources'],
  ['MUTATION', 'Compatibility and mutation'],
  ['OUTPUT', 'Rendered output'],
  ['PARITY', 'Cross-backend parity'],
  ['MCP', 'Shade MCP tool contracts'],
]

const capabilities = ['Introspect', 'Act', 'Validate', 'Diagnose']

const tools = [
  'compileEffect',
  'renderEffectFrame',
  'describeEffectFrame',
  'benchmarkEffectFPS',
  'testUniformResponsiveness',
  'testNoPassthrough',
  'testPixelParity',
  'runDslProgram',
  'checkEffectStructure',
  'checkAlgEquiv',
  'compareShaders',
  'analyzeBranching',
  'searchEffects',
  'analyzeEffect',
  'searchShaderSource',
  'searchShaderKnowledge',
  'listEffects',
  'generateManifest',
]

function sectionFor(id, nextId) {
  const startMarker = `<!-- SURFACE:${id} -->`
  const start = contract.indexOf(startMarker)
  assert.notEqual(start, -1, `missing surface marker ${startMarker}`)

  if (!nextId) return contract.slice(start)
  const end = contract.indexOf(`<!-- SURFACE:${nextId} -->`, start + startMarker.length)
  assert.notEqual(end, -1, `missing next surface marker SURFACE:${nextId}`)
  return contract.slice(start, end)
}

function test(name, fn) {
  try {
    fn()
    console.log(`PASS: ${name}`)
  } catch (error) {
    console.error(`FAIL: ${name}`)
    throw error
  }
}

function fencedSourceAfter(marker, language) {
  const markerIndex = contract.indexOf(marker)
  assert.notEqual(markerIndex, -1, `missing marker ${marker}`)
  const fence = `\`\`\`${language}\n`
  const start = contract.indexOf(fence, markerIndex)
  assert.notEqual(start, -1, `missing ${language} fence after ${marker}`)
  const bodyStart = start + fence.length
  const end = contract.indexOf('\n```', bodyStart)
  assert.notEqual(end, -1, `unterminated ${language} fence after ${marker}`)
  return contract.slice(bodyStart, end)
}

function normalizeSource(source) {
  return source.replace(/[ \t]+$/gm, '').trimEnd()
}

function parseJsonLines(source, label) {
  return source.trim().split('\n').map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      throw new Error(`${label} line ${index + 1} is not JSON: ${error.message}`)
    }
  })
}

function toolContract(name, nextName) {
  const start = contract.indexOf(`#### ${name}`)
  assert.notEqual(start, -1, `missing tool ${name}`)
  const end = nextName ? contract.indexOf(`#### ${nextName}`, start) : contract.indexOf('### Validate', start)
  assert.notEqual(end, -1, `missing end of tool ${name}`)
  return contract.slice(start, end)
}

function interfaceContract(section, name) {
  const match = section.match(new RegExp(`interface ${name}\\b[\\s\\S]*?^}`, 'm'))
  assert.ok(match, `missing interface ${name}`)
  return match[0]
}

test('all nine surfaces expose all four capabilities', () => {
  surfaces.forEach(([id], index) => {
    const section = sectionFor(id, surfaces[index + 1]?.[0])
    for (const capability of capabilities) {
      assert.match(
        section,
        new RegExp(`^### ${capability}$`, 'm'),
        `${id} is missing ${capability}`,
      )
    }
    assert.match(section, /Source(?:s)?: /, `${id} is missing a source citation`)
  })
})

test('the four authoring schemas are formal typed contracts', () => {
  for (const schema of ['EffectDefinition', 'GlobalSpec', 'PassSpec', 'TextureSpec']) {
    assert.match(contract, new RegExp(`(?:interface|type) ${schema}\\b`), `missing ${schema}`)
  }
})

test('authoring schemas enumerate the source-consumed fields', () => {
  const fixtures = [
    [
      interfaceContract(sectionFor('EFFECT', 'GLOBALS'), 'EffectDefinition'),
      ['name', 'namespace', 'func', 'globals', 'passes', 'textures', 'outputTex3d',
        'outputGeo', 'uniformLayout', 'uniformLayouts', 'paramAliases',
        'defaultProgram', 'onInit', 'onUpdate', 'onDestroy', 'asyncInit'],
    ],
    [
      interfaceContract(sectionFor('GLOBALS', 'GRAPH'), 'GlobalSpec'),
      ['type', 'default', 'uniform', 'min', 'max', 'step', 'enum', 'choices',
        'define', 'colorModeUniform', 'zero', 'randMin', 'randMax', 'randChance',
        'randChoices', 'ui'],
    ],
    [
      interfaceContract(sectionFor('GRAPH', 'TEXTURES'), 'PassSpec'),
      ['program', 'inputs', 'outputs', 'uniforms', 'entryPoint', 'drawMode',
        'drawBuffers', 'count', 'countUniform', 'repeat', 'blend', 'workgroups',
        'storageBuffers', 'storageTextures', 'conditions', 'viewport', 'clear',
        'samplerTypes', 'type'],
    ],
    [
      interfaceContract(sectionFor('TEXTURES', 'MUTATION'), 'TextureSpec2D'),
      ['width', 'height', 'format'],
    ],
    [
      interfaceContract(sectionFor('TEXTURES', 'MUTATION'), 'TextureSpec3D'),
      ['depth'],
    ],
  ]

  for (const [declaration, fields] of fixtures) {
    for (const field of fields) {
      assert.match(declaration, new RegExp(`\\b${field}\\??:`), `schema omits ${field}`)
    }
  }
})

test('every registered Shade MCP verb has a full contract', () => {
  for (const [index, tool] of tools.entries()) {
    assert.match(
      contract,
      new RegExp(`^#### ${tool}$`, 'm'),
      `missing tool contract for ${tool}`,
    )
    const section = toolContract(tool, tools[index + 1])
    const inputType = `${tool[0].toUpperCase()}${tool.slice(1)}Input`
    assert.match(section, new RegExp(`type ${inputType}\\b`), `${tool} is missing ${inputType}`)
    assert.match(section, /type \w+Result\b/, `${tool} is missing a result type`)
  }
})

test('Shade MCP tool-specific input fields match the pinned schemas', () => {
  const specificFields = {
    compileEffect: ['backend'],
    renderEffectFrame: ['warmup_frames', 'capture_image', 'uniforms', 'time', 'resolution'],
    describeEffectFrame: ['prompt'],
    benchmarkEffectFPS: ['target_fps', 'duration_seconds', 'resolution'],
    testUniformResponsiveness: [],
    testNoPassthrough: [],
    testPixelParity: ['epsilon', 'seed'],
    runDslProgram: ['dsl', 'backend', 'warmup_frames', 'capture_image', 'uniforms'],
    checkEffectStructure: ['effect_id'],
    checkAlgEquiv: ['effect_id'],
    compareShaders: ['effect_id'],
    analyzeBranching: ['effect_id', 'backend'],
    searchEffects: ['query', 'limit'],
    analyzeEffect: ['effect_id'],
    searchShaderSource: ['query', 'context_lines', 'limit'],
    searchShaderKnowledge: ['query', 'category', 'limit'],
    listEffects: ['namespace'],
    generateManifest: [],
  }

  assert.match(contract, /type EffectSelector\s*=\s*\{[\s\S]*?effect_id\??:[\s\S]*?effects\??:/)
  assert.match(contract, /type BrowserSelector\s*=\s*EffectSelector\s*&\s*\{[\s\S]*?backend\??:/)

  for (const [index, name] of tools.entries()) {
    const section = toolContract(name, tools[index + 1])
    for (const field of specificFields[name]) {
      assert.match(section, new RegExp(`\\b${field}\\??:`), `${name} omits input field ${field}`)
    }
  }
})

test('Shade MCP result fields and defaults match the pinned schemas', () => {
  const resultFields = {
    compileEffect: ['passes', 'message', 'console_errors'],
    renderEffectFrame: ['frame', 'metrics', 'console_errors'],
    describeEffectFrame: ['vision'],
    benchmarkEffectFPS: ['achieved_fps', 'meets_target', 'stats'],
    testUniformResponsiveness: ['tested_uniforms'],
    testNoPassthrough: ['temporalDiff', 'uniqueColors', 'similarity'],
    testPixelParity: ['mismatchPercent'],
    runDslProgram: ['frame', 'metrics'],
    checkEffectStructure: ['unusedFiles', 'structuralParityIssues', 'passCount'],
    checkAlgEquiv: ['pairs', 'unmatchedGlsl', 'unmatchedWgsl'],
    compareShaders: ['programs', 'summary'],
    analyzeBranching: ['status'],
    searchEffects: ['results', 'total'],
    analyzeEffect: ['globals', 'passes', 'shaders'],
    searchShaderSource: ['matchCount', 'results'],
    searchShaderKnowledge: ['matchCount', 'databaseStats', 'results'],
    listEffects: ['count', 'effects'],
    generateManifest: ['effectCount'],
  }

  for (const [index, name] of tools.entries()) {
    const section = toolContract(name, tools[index + 1])
    const resultSection = name === 'renderEffectFrame'
      ? sectionFor('OUTPUT', 'PARITY')
      : name === 'testUniformResponsiveness'
        ? sectionFor('GLOBALS', 'GRAPH')
        : name === 'testPixelParity'
          ? sectionFor('PARITY', 'MCP')
          : section
    for (const field of resultFields[name]) {
      assert.match(resultSection, new RegExp(`\\b${field}\\??:`), `${name} omits result field ${field}`)
    }
  }

  assert.match(contract, /type BrowserSelector[\s\S]*?backend\??:[^\n]*default(?:s)? to webgl2/)
  const defaults = {
    compileEffect: [['backend', 'webgl2']],
    renderEffectFrame: [['warmup_frames', '10'], ['capture_image', 'false']],
    benchmarkEffectFPS: [['target_fps', '60'], ['duration_seconds', '5']],
    testPixelParity: [['epsilon', '1'], ['seed', '42']],
    runDslProgram: [['backend', 'webgl2'], ['warmup_frames', '10'], ['capture_image', 'false']],
    searchEffects: [['limit', '10']],
    searchShaderSource: [['context_lines', '5'], ['limit', '10']],
    searchShaderKnowledge: [['limit', '5']],
  }

  for (const [index, name] of tools.entries()) {
    const section = toolContract(name, tools[index + 1])
    for (const [field, value] of defaults[name] ?? []) {
      assert.match(
        section,
        new RegExp(`\\b${field}\\??:[^\\n]*default(?:s)?(?: to)? ${value}\\b`),
        `${name} omits default ${field}=${value}`,
      )
    }
  }
})

test('describeEffectFrame permits every JSON value returned by JSON.parse', () => {
  const mcpSection = sectionFor('MCP')
  const start = mcpSection.indexOf('#### describeEffectFrame')
  const end = mcpSection.indexOf('#### benchmarkEffectFPS', start)
  const describeContract = mcpSection.slice(start, end)

  assert.match(contract, /type JsonValue\s*=/)
  assert.match(describeContract, /vision: JsonValue \| null/)
})

test('lifecycle and AI-analysis contracts expose their runtime caveats', () => {
  const effectSection = sectionFor('EFFECT', 'GLOBALS')
  const mcpSection = sectionFor('MCP')
  assert.match(effectSection, /this: EffectHookThis/)
  assert.match(effectSection, /production pipeline[\s\S]*invokes `asyncInit\(\)`/)
  assert.match(effectSection, /No production code invokes[\s\S]*`onInit\(\)`[\s\S]*`onUpdate\(\)`[\s\S]*`onDestroy\(\)`/)
  assert.match(mcpSection, /type AnalyzeBranchingResult[\s\S]*status: JsonValue/)
  assert.match(mcpSection, /Record<string, JsonValue>/)
  assert.match(mcpSection, /spreads parsed AI JSON after that field/)
  assert.match(contract, /GAP-025/)
  assert.match(contract, /GAP-026/)
})

test('implemented validation thresholds are stated as inequalities', () => {
  const requiredPredicates = [
    'mean_alpha < 0.01',
    'luma_variance < 0.0001',
    'unique_sampled_colors <= 1',
    'luma_delta > 0.002',
    'max_channel_delta > 0.002',
    'temporalDiff > 0.01',
    'uniqueColors > 5',
    'mismatch_percent < 1',
    'fps >= target_fps',
  ]

  for (const predicate of requiredPredicates) {
    assert.ok(contract.includes(predicate), `missing threshold: ${predicate}`)
  }
})

test('worked effect contains source, requests, and actual responses', () => {
  for (const marker of [
    '<!-- WORKED:DEFINITION -->',
    '<!-- WORKED:GLSL -->',
    '<!-- WORKED:WGSL -->',
    '<!-- WORKED:MCP-REQUESTS -->',
    '<!-- WORKED:MCP-RESPONSES -->',
  ]) {
    assert.ok(contract.includes(marker), `missing worked-effect marker ${marker}`)
  }
  assert.match(contract, /synth\/testPattern/)

  const effectDir = join(root, 'shaders', 'effects', 'synth', 'testPattern')
  const checkedInSources = [
    ['<!-- WORKED:DEFINITION -->', 'js', join(effectDir, 'definition.js')],
    ['<!-- WORKED:GLSL -->', 'glsl', join(effectDir, 'glsl', 'testPattern.glsl')],
    ['<!-- WORKED:WGSL -->', 'wgsl', join(effectDir, 'wgsl', 'testPattern.wgsl')],
  ]

  for (const [marker, language, path] of checkedInSources) {
    assert.equal(
      normalizeSource(fencedSourceAfter(marker, language)),
      normalizeSource(readFileSync(path, 'utf8')),
      `${marker} must reproduce the checked-in source completely`,
    )
  }
})

test('worked MCP transcript has eight matched JSON-RPC calls and decoded responses', () => {
  const requests = parseJsonLines(
    fencedSourceAfter('<!-- WORKED:MCP-REQUESTS -->', 'json'),
    'MCP request',
  )
  const responses = parseJsonLines(
    fencedSourceAfter('<!-- WORKED:MCP-RESPONSES -->', 'json'),
    'MCP response',
  )
  const expectedTools = [
    'checkEffectStructure',
    'compileEffect',
    'compileEffect',
    'renderEffectFrame',
    'testUniformResponsiveness',
    'testNoPassthrough',
    'testPixelParity',
    'benchmarkEffectFPS',
  ]

  assert.equal(requests.length, expectedTools.length)
  assert.equal(responses.length, expectedTools.length)
  assert.deepEqual(requests.map(request => request.id), [3, 4, 5, 6, 7, 8, 9, 10])
  assert.deepEqual(requests.map(request => request.params.name), expectedTools)
  assert.ok(requests.every(request => request.method === 'tools/call'))
  assert.ok(requests.every(request => request.params.arguments.effect_id === 'synth/testPattern'))

  assert.equal(responses[0].passCount, 1)
  assert.equal(responses[1].passes.length, 3) // preserved stale response; GAP-024
  assert.equal(responses[2].passes.length, 3) // preserved stale response; GAP-024
  assert.equal(responses[3].metrics.unique_sampled_colors, 2)
  assert.deepEqual(responses[4].tested_uniforms, ['gridSize:pass'])
  assert.equal(responses[5].status, 'skipped')
  assert.equal(responses[6].mismatchPercent, 0)
  assert.equal(responses[7].meets_target, true)
  assert.match(contract, /GAP-024/)
})

test('worked DSL expands to the graph documented for testPattern', () => {
  const effect = testPatternEffect
  for (const key of [
    effect.func,
    `${effect.namespace}.${effect.func}`,
    `${effect.namespace}/testPattern`,
    `${effect.namespace}.testPattern`,
  ]) {
    registerEffect(key, effect)
  }
  registerOp(`${effect.namespace}.${effect.func}`, {
    name: effect.func,
    args: Object.entries(effect.globals).map(([name, spec]) => ({
      name,
      type: spec.type,
      default: spec.default,
      min: spec.min,
      max: spec.max,
      uniform: spec.uniform,
      choices: spec.choices,
    })),
  })
  registerStarterOps([effect.func, `${effect.namespace}.${effect.func}`])

  const dsl = [
    'search synth',
    'testPattern(pattern: checkerboard, gridSize: 4).write(o0)',
    'render(o0)',
  ].join('\n')
  const graph = compileGraph(dsl)

  assert.deepEqual(
    graph.passes.map(pass => pass.id),
    ['node_0_pass_0', 'node_1_write_blit'],
  )
  assert.equal(graph.passes[0].type, undefined)
  assert.equal(graph.passes[1].type, 'render')
  assert.match(contract, /"id":"node_1_write_blit","program":"blit","type":"render"/)
  assert.match(contract, /two expanded passes/)
})

test('texture authoring schema excludes fields discarded by compileGraph', () => {
  const textureSection = sectionFor('TEXTURES', 'MUTATION')
  const texture3d = textureSection.match(/interface TextureSpec3D[\s\S]*?\n}/)?.[0]
  assert.ok(texture3d, 'missing TextureSpec3D interface')
  assert.doesNotMatch(texture3d, /\bfilter\??:/)
  assert.match(textureSection, /definition-level `filter` is discarded/)
})

test('traceability matrix contains one complete row per surface', () => {
  const matrixStart = contract.indexOf('<!-- TRACEABILITY-MATRIX -->')
  assert.notEqual(matrixStart, -1, 'missing traceability matrix marker')
  const matrixEnd = contract.indexOf('<!-- GAP-REGISTER -->', matrixStart)
  assert.notEqual(matrixEnd, -1, 'missing gap register marker')
  const matrix = contract.slice(matrixStart, matrixEnd)

  for (const [id, label] of surfaces) {
    const row = matrix.split('\n').find(line => line.startsWith(`| ${label} |`))
    assert.ok(row, `missing traceability row for ${label}`)
    const cells = row.split('|').slice(1, -1).map(cell => cell.trim())
    assert.equal(cells.length, 5, `${label} row must have label plus four capability cells`)
    for (const [index, cell] of cells.slice(1).entries()) {
      assert.ok(cell.length > 0 && cell !== '—', `${id}/${capabilities[index]} is empty`)
    }
  }
})

test('traceability matrix names only documented runtime contracts', () => {
  const matrixStart = contract.indexOf('<!-- TRACEABILITY-MATRIX -->')
  const matrixEnd = contract.indexOf('<!-- GAP-REGISTER -->', matrixStart)
  const matrix = contract.slice(matrixStart, matrixEnd)

  for (const nonexistent of [
    'graph.toJSON()',
    'AnalysisError',
    'GraphJSON',
    'ResourceAllocationMap',
    'FrameMetrics',
  ]) {
    assert.ok(!matrix.includes(nonexistent), `matrix references nonexistent ${nonexistent}`)
  }
  for (const implemented of ['CompiledGraph', 'Diagnostic', 'ImageMetrics']) {
    assert.ok(matrix.includes(implemented), `matrix omits documented ${implemented}`)
  }
})

test('gap register cites real source files and copied pass fields accurately', () => {
  const gaps = contract.slice(contract.indexOf('<!-- GAP-REGISTER -->'))
  for (const stalePath of [
    '`error.js`',
    '`surface.js`',
    '`resource.js`',
    '`test-uniforms.ts`',
    '`render-frame.ts`',
    '`frame-metrics.ts`',
    '`run-dsl.ts`',
    '`definition-parser.ts`',
    '`test-no-passthrough.ts`',
  ]) {
    assert.ok(!gaps.includes(stalePath), `gap register cites nonexistent ${stalePath}`)
  }

  const passGap = gaps.split('\n').find(line => line.startsWith('| GAP-005 |'))
  assert.ok(passGap, 'missing GAP-005')
  assert.ok(!passGap.includes('blend'), 'GAP-005 incorrectly classifies blend as dropped')
  for (const dropped of ['conditions', 'viewport', 'clear', 'samplerTypes', 'type']) {
    assert.ok(passGap.includes(dropped), `GAP-005 omits dropped pass field ${dropped}`)
  }

  const readinessGap = gaps.split('\n').find(line => line.startsWith('| GAP-024 |'))
  assert.ok(readinessGap?.includes('describeEffectFrame'), 'GAP-024 omits delegated vision race')
  assert.ok(readinessGap?.includes('`describe.ts`'), 'GAP-024 omits describe.ts source')
})

test('gap register and supporting documentation are connected', () => {
  assert.match(contract, /<!-- GAP-REGISTER -->[\s\S]*\bGAP-001\b/)
  assert.match(contract, /\bGAP-\d{3}\b/g)
  assert.match(shortIndex, /source-pinned authoring schemas/)
  assert.match(shaderIndex, /^\s+shaders\/agent-instrumentation$/m)
})

console.log('llms-full contract checks passed')
