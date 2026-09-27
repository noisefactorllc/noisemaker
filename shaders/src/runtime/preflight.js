/**
 * Effect preflight — static, side-effect-free analysis of an effect definition
 * against device capabilities.
 *
 * GAP-016: previously, impossible cases (a program with no GLSL source on
 * WebGL2, no WGSL on WebGPU) and device-specific format changes (MRT
 * attachments demoted by the color-attachment byte budget, textures clamped
 * by MAX_TEXTURE_SIZE) were only discovered during pipeline initialization
 * and compilation. preflightEffect() consumes a definition plus a
 * capabilities object — the same shape Pipeline.getCapabilities() returns —
 * and predicts both before anything is compiled:
 *
 *   {
 *     backends: {
 *       webgl2: { authorable: boolean, reasons: string[] },
 *       webgpu: { authorable: boolean, reasons: string[] }
 *     },
 *     formatChanges: [{ texture, pass, from, to, budget }],
 *     clamps: [{ texture, field, requested, limit }]
 *   }
 *
 * Authorability mirrors what the backends actually accept:
 *  - WebGL2 compileProgram() reads spec.source || spec.glsl || spec.fragment
 *    (GLSL); WGSL-only programs cannot run there.
 *  - WebGPU resolveWGSLSource() reads spec.wgsl, then non-GLSL
 *    source/fragment; GLSL-only programs cannot run there.
 *
 * The predicted MRT demotion replicates Pipeline.applyMrtFormatBudget()
 * exactly (trailing rgba32f attachments demoted to rgba16f until the group
 * fits maxColorBytesPerSample), and texture clamps mirror the
 * maxTextureSize enforcement applied at allocation time.
 */

const GLSL_ONLY_HINT = '#version'

/**
 * Byte cost per sample of a color attachment format, for the MRT
 * attachment budget. Unlisted formats (including defaulted rgba16f
 * surfaces) cost 8.
 * @param {string|undefined} format - Texture format name
 * @returns {number} Bytes per sample
 */
export function mrtFormatBytes(format) {
    switch (format) {
        case 'rgba32f':
        case 'rgba32float':
            return 16
        case 'rgba8':
        case 'rgba8unorm':
            return 4
        default:
            return 8
    }
}

function isGLSLSource(text) {
    return typeof text === 'string' && text.includes(GLSL_ONLY_HINT)
}

function isWGSLBucket(bucket) {
    if (!bucket) return false
    if (bucket.wgsl) return true
    // WebGPU falls back to generic source/fragment when they are not GLSL.
    if (bucket.source && !isGLSLSource(bucket.source)) return true
    if (bucket.fragment && !isGLSLSource(bucket.fragment)) return true
    return false
}

function isGLSLBucket(bucket) {
    if (!bucket) return false
    if (bucket.glsl || bucket.fragment || bucket.vertex) return true
    if (bucket.source && !isWGSLBucket(bucket)) return true
    return false
}

function definitionPasses(definition) {
    if (!definition || typeof definition !== 'object') return []
    if (Array.isArray(definition.passes)) return definition.passes
    return []
}

function definitionTextures(definition) {
    if (!definition || typeof definition !== 'object') return null
    if (definition.textures instanceof Map) return definition.textures
    if (definition.textures && typeof definition.textures === 'object') {
        return new Map(Object.entries(definition.textures))
    }
    return null
}

/**
 * Predict per-backend authorability and device-limit-driven format changes
 * for an effect definition.
 *
 * @param {object} definition - Effect definition (plain object or Effect instance)
 * @param {object} capabilities - Device capabilities
 *   ({ maxDrawBuffers, maxTextureSize, maxColorBytesPerSample, ... });
 *   omitted or partial capabilities are simply not checked.
 * @param {Object<string, object>} [shaders] - Per-program shader buckets as
 *   produced by loadEffectShaders() ({ program: { glsl|fragment|vertex|wgsl } });
 *   defaults to definition.shaders. When absent, source availability is
 *   unknown and only structural/limit checks are reported.
 * @returns {{ backends: {webgl2: {authorable: boolean, reasons: string[]}, webgpu: {authorable: boolean, reasons: string[]}}, formatChanges: Array, clamps: Array }}
 */
export function preflightEffect(definition, capabilities, shaders) {
    const caps = capabilities || {}
    const shadersArg = shaders || (definition && definition.shaders)
    const hasShaderInfo = shadersArg && typeof shadersArg === 'object' && Object.keys(shadersArg).length > 0
    const buckets = hasShaderInfo ? shadersArg : {}
    const passes = definitionPasses(definition)
    const textures = definitionTextures(definition)

    const webgl2Reasons = []
    const webgpuReasons = []
    const formatChanges = []
    const clamps = []
    const budget = caps.maxColorBytesPerSample
    const maxDrawBuffers = caps.maxDrawBuffers
    const maxTextureSize = caps.maxTextureSize

    for (const pass of passes) {
        const program = pass && pass.program
        if (!program) continue
        const bucket = buckets[program]

        // Source availability per backend (only when shader info is provided).
        if (hasShaderInfo) {
            if (!isGLSLBucket(bucket)) {
                webgl2Reasons.push(`program '${program}' has no GLSL source (pass '${pass.name || program}')`)
            }
            if (!isWGSLBucket(bucket)) {
                webgpuReasons.push(`program '${program}' has no WGSL source (pass '${pass.name || program}')`)
            }
        }

        // MRT draw-buffer limit.
        const outputCount = pass.outputs ? Object.keys(pass.outputs).length : 0
        if (typeof maxDrawBuffers === 'number' && outputCount > maxDrawBuffers) {
            const reason = `pass '${pass.name || program}' writes ${outputCount} color attachments, device allows ${maxDrawBuffers}`
            webgl2Reasons.push(reason)
            webgpuReasons.push(reason)
        }

        // Predict the applyMrtFormatBudget() demotion for this pass.
        if (budget && outputCount > 1) {
            const entries = Object.values(pass.outputs).map((texId) => ({
                texId,
                spec: textures ? textures.get(texId) : undefined
            }))
            let total = entries.reduce((sum, entry) => sum + mrtFormatBytes(entry.spec && entry.spec.format), 0)
            if (total > budget) {
                for (let i = entries.length - 1; i >= 0 && total > budget; i--) {
                    const spec = entries[i].spec
                    if (!spec) continue
                    if (spec.format === 'rgba32f' || spec.format === 'rgba32float') {
                        formatChanges.push({
                            texture: entries[i].texId,
                            pass: pass.name || pass.id || program,
                            from: spec.format,
                            to: 'rgba16f',
                            budget
                        })
                        total -= 8
                    }
                }
            }
        }
    }

    // Predict maxTextureSize clamps for explicit texture dimensions.
    if (textures && typeof maxTextureSize === 'number') {
        for (const [texId, spec] of textures) {
            if (!spec || typeof spec !== 'object') continue
            for (const field of ['width', 'height', 'depth']) {
                const value = spec[field]
                if (typeof value === 'number' && value > maxTextureSize) {
                    clamps.push({ texture: texId, field, requested: value, limit: maxTextureSize })
                }
            }
        }
    }

    return {
        backends: {
            webgl2: { authorable: webgl2Reasons.length === 0, reasons: webgl2Reasons },
            webgpu: { authorable: webgpuReasons.length === 0, reasons: webgpuReasons }
        },
        formatChanges,
        clamps
    }
}
