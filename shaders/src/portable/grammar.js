/**
 * The declaration grammar of an effect definition, as data.
 *
 * One grammar serves the runtime validator (shaders/src/runtime/effect-validator.js),
 * the Portable normalizer (shaders/src/portable/definition.js), the generated
 * JSON Schema (shaders/scripts/generate-portable-schema.mjs) and the
 * documentation tests. It holds names and value sets only: no code that a
 * definition could reach, and no import, so a plain checkout can load it.
 */

// The Portable format marker and the one authoring profile version this core reads.
export const PORTABLE_FORMAT = 'noisemaker-portable-effect'
export const PORTABLE_VERSION = 2

export const GLOBAL_TYPES = Object.freeze([
    'float', 'int', 'boolean', 'vec2', 'vec3', 'vec4', 'mat3',
    'color', 'surface', 'volume', 'geometry', 'member', 'palette', 'button',
    'string'
])

export const UI_CONTROLS = Object.freeze(['slider', 'checkbox', 'dropdown', 'color', 'button', 'vector3', 'vec3'])

export const UI_KEYS = Object.freeze(['label', 'control', 'category', 'hidden', 'hint', 'format', 'buttonLabel', 'enabledBy', 'multiline', 'resetOnChange'])

export const ENABLED_BY_OPS = Object.freeze(['eq', 'neq', 'lt', 'gt', 'gte', 'lte', 'in', 'notIn'])

export const GLOBAL_SPEC_KEYS = Object.freeze([
    'type', 'default', 'uniform', 'define', 'choices', 'enum',
    'min', 'max', 'step', 'zero', 'randMin', 'randMax', 'randChance', 'randChoices',
    'colorModeUniform', 'inheritsSeed', 'ui'
])

export const PASS_KEYS = Object.freeze([
    'name', 'program', 'type', 'entryPoint', 'drawMode', 'drawBuffers',
    'count', 'countUniform', 'repeat', 'blend', 'workgroups',
    'storageBuffers', 'storageTextures', 'viewport', 'conditions',
    'defines', 'uniforms', 'inputs', 'outputs', 'clear', 'samplerTypes'
])

// Sampler names the WebGPU backend creates; pass.samplerTypes picks one per
// sampled input. WebGL2 ignores the field.
export const SAMPLER_TYPES = Object.freeze(['default', 'nearest', 'repeat', 'mipmap'])

export const TEXTURE_SPEC_KEYS = Object.freeze(['width', 'height', 'depth', 'format', 'is3D', 'filter', 'mipmaps', 'persistent'])

// Filtering policies are authorable on 3D textures only. 2D surfaces keep
// the engine-wide nearest filtering for backend parity.
export const TEXTURE_FILTERS = Object.freeze(['nearest', 'linear'])

export const CONDITION_CONTAINER_KEYS = Object.freeze(['runIf', 'skipIf'])

export const DIM_KEYWORDS = Object.freeze(['screen', 'auto', 'input', 'resolution'])

// Formats both backends resolve, in their two spellings.
export const FORMATS = Object.freeze([
    'rgba16f', 'rgba16float', 'rgba8', 'rgba8unorm', 'rgba32f', 'rgba32float',
    'r8', 'r8unorm', 'r16f', 'r16float', 'r32f', 'r32float'
])

export const DRAW_MODES = Object.freeze(['points', 'triangles', 'billboards'])

export const PASS_TYPES = Object.freeze(['render', 'compute'])

export const LAYOUT_ENTRY_KEYS = Object.freeze(['name', 'slot', 'components'])

export const BYTE_LAYOUT_KEYS = Object.freeze(['name', 'offset', 'size', 'type'])

export const DIM_SPEC_KEYS = Object.freeze(['param', 'power', 'multiply', 'default', 'paramDefault', 'screenDivide', 'scale', 'clamp', 'inputOverride', 'inherit'])

// Every top-level field a definition may carry. The lifecycle names and the
// runtime state belong to JS definitions only: a Portable package is data
// (DECLARATIVE_TOP_LEVEL_KEYS below).
export const TOP_LEVEL_KEYS = Object.freeze([
    'name', 'namespace', 'func', 'description', 'feature', 'tags', 'globals', 'passes',
    'textures', 'textures3d', 'shaders', 'uniformLayout', 'uniformLayouts',
    'paramAliases', 'openCategories', 'defaultProgram', 'hidden', 'deprecatedBy',
    'externalTexture', 'externalMesh', 'builtinMeshes', 'outputTex3d', 'outputGeo',
    'state', 'uniforms', 'onInit', 'onUpdate', 'onDestroy', 'asyncInit'
])

export const LIFECYCLE_KEYS = Object.freeze(['onInit', 'onUpdate', 'onDestroy', 'asyncInit'])

export const RUNTIME_STATE_KEYS = Object.freeze(['state', 'uniforms'])

export const PIPELINE_INPUTS = Object.freeze([
    'inputTex', 'inputTex3d', 'inputGeo', 'inputXyz', 'inputVel', 'inputRgba',
    'noise', 'midiNoteGrid', 'feedback', 'selfTex', 'outputTex', 'none'
])

export const PIPELINE_OUTPUTS = Object.freeze(['outputTex', 'outputTex3d', 'outputXyz', 'outputVel', 'outputRgba'])

// The fields of a version 2 package: the marker, then every declarative field.
// The shaders a host has loaded travel beside a package, not in it.
export const MARKER_KEYS = Object.freeze(['format', 'version'])

export const DECLARATIVE_TOP_LEVEL_KEYS = Object.freeze(TOP_LEVEL_KEYS.filter(key =>
    !LIFECYCLE_KEYS.includes(key) && !RUNTIME_STATE_KEYS.includes(key) && key !== 'shaders' && key !== 'paramAliases'))

// A DSL identifier: the form of func, of a version 2 pass name, and of a global's name.
export const IDENTIFIER_PATTERN = '^[A-Za-z_][A-Za-z0-9_]*$'

// Keys that reach the shared operator and enum registries' prototypes. No
// declaration may carry one at any depth.
export const RESERVED_KEYS = Object.freeze([...Object.getOwnPropertyNames(Object.prototype), 'prototype'])
