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

// The forms of resource a definition declares or a pass reads and writes, as
// the runtime allocates them:
//   texture                a 2D texture in `textures`, sized by the size grammar
//   persistentTexture      `persistent`: contents kept when the texture is recreated
//   mipmappedTexture       `mipmaps`: a mip chain regenerated after each render
//   volumeTexture          a 3D texture in `textures3d`
//   volumeAtlas            a 2D atlas of a volume, sized from `volumeSize`, and
//                          handed on by `outputTex3d`
//   geometry               a geometry buffer handed on by `outputGeo`
//   particleState          the shared global_xyz, global_vel and global_rgba textures
//   multipleRenderTargets  several outputs of one pass, with `drawBuffers`
//   storageTexture         a texture a compute pass writes (`storageTextures`)
//   globalSurface          o0-o7 and the global_ surfaces every effect shares
//   meshSurface            the positions, normals and uvs of mesh0-mesh7
//   hostTexture            data a host uploads: midiNoteGrid and `externalTexture`
//   sampler                the WebGPU sampler of a sampled input (`samplerTypes`)
export const RESOURCE_FORMS = Object.freeze([
    'texture', 'persistentTexture', 'mipmappedTexture', 'volumeTexture', 'volumeAtlas',
    'geometry', 'particleState', 'multipleRenderTargets', 'storageTexture',
    'globalSurface', 'meshSurface', 'hostTexture', 'sampler'
])

// Fields the runtime accepts and then reads nowhere. A legacy definition keeps
// them; a version 2 package refuses them, because they have no effect. A
// uniform name in `workgroups` is the same: the dispatch size is never
// resolved from it. (`inputOverride` in a size object has no effect either,
// but catalog definitions carry it, so version 2 still accepts it.)
export const INERT_PASS_KEYS = Object.freeze(['storageBuffers'])
// A pipeline input that nothing writes, so a pass reads a blank texture from it.
export const INERT_PIPELINE_INPUTS = Object.freeze(['noise'])

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
    'inputTex', 'inputTex3d', 'inputGeo', 'inputXyz', 'inputVel', 'inputRgba', 'inputColor',
    'noise', 'midiNoteGrid', 'feedback', 'selfTex', 'outputTex', 'none'
])

// A pass may also write back to a chain input (inputTex3d and the others
// below) or to a feedback texture (FEEDBACK_PREFIX).
export const PIPELINE_OUTPUTS = Object.freeze([
    'outputTex', 'outputTex3d', 'outputXyz', 'outputVel', 'outputRgba',
    'inputTex3d', 'inputGeo', 'inputXyz', 'inputVel', 'inputRgba'
])

export const FEEDBACK_PREFIX = 'feedback_'

// The fields of a version 2 package: the marker, then every declarative field.
// The shaders a host has loaded travel beside a package, not in it.
export const MARKER_KEYS = Object.freeze(['format', 'version'])

// Fields that only a version 2 package has. A JS definition has its lifecycle
// in code, so it declares no capabilities.
export const PACKAGE_ONLY_KEYS = Object.freeze(['capabilities'])

export const DECLARATIVE_TOP_LEVEL_KEYS = Object.freeze([...TOP_LEVEL_KEYS.filter(key =>
    !LIFECYCLE_KEYS.includes(key) && !RUNTIME_STATE_KEYS.includes(key) && key !== 'shaders' && key !== 'paramAliases'),
...PACKAGE_ONLY_KEYS])

// A DSL identifier: the form of func, of a version 2 pass name, and of a global's name.
export const IDENTIFIER_PATTERN = '^[A-Za-z_][A-Za-z0-9_]*$'

// Capabilities: lifecycle behavior that a host provides and a package
// declares. A declaration in a package's `capabilities` list names the
// capability and its contract version, gives options, and binds the
// capability's roles to the package's globals and textures. A descriptor
// states, as data, what a capability accepts: it is the part of a capability
// that a package, an editor or a command-line tool can read without running
// the host's code.
//
// A capability ID is <owner>/<name>, in lower case, with digits and hyphens.
export const CAPABILITY_ID_PATTERN = '^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$'

export const CAPABILITY_KEYS = Object.freeze(['id', 'version', 'options', 'bindings'])

// What a declaration binds: a role to a global (parameters) or to a texture
// the package declares (textures).
export const BINDING_KINDS = Object.freeze(['parameters', 'textures'])

export const DESCRIPTOR_KEYS = Object.freeze([
    'id', 'version', 'description', 'options', 'bindings', 'dependencies', 'uploadOrientation', 'methods'
])

// An option's schema: a subset of JSON Schema, which a descriptor states as data.
export const OPTION_SCHEMA_KEYS = Object.freeze([
    'type', 'description', 'enum', 'minimum', 'maximum', 'required', 'properties', 'items'
])

export const OPTION_TYPES = Object.freeze(['number', 'integer', 'string', 'boolean', 'object', 'array'])

// A binding role's slot in a descriptor: the global types a parameter role
// takes, and whether a declaration must bind it.
export const BINDING_SLOT_KEYS = Object.freeze(['description', 'types', 'required'])

// The bound parameters and resources whose values start a regeneration.
export const DEPENDENCY_KINDS = Object.freeze(['parameters', 'resources'])

// How a provider's canvas reaches its texture: flipY turns the canvas over,
// so that its top row is the texture's last row; none uploads it as it is.
export const UPLOAD_ORIENTATIONS = Object.freeze(['flipY', 'none'])

// Keys that reach the shared operator and enum registries' prototypes. No
// declaration may carry one at any depth.
export const RESERVED_KEYS = Object.freeze([...Object.getOwnPropertyNames(Object.prototype), 'prototype'])
