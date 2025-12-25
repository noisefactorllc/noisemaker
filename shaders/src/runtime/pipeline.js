/**
 * Pipeline Executor
 * Orchestrates frame execution using a compiled graph and backend.
 */

import { WebGL2Backend } from './backends/webgl2.js'
import { WebGPUBackend } from './backends/webgpu.js'

/**
 * Oscillator evaluation functions.
 * Each returns a value between 0 and 1 based on the time phase.
 *
 * Oscillator types:
 * 0: sine    - 0 → 1 → 0 (smooth)
 * 1: tri     - 0 → 1 → 0 (linear)
 * 2: saw     - 0 → 1
 * 3: sawInv  - 1 → 0
 * 4: square  - 0 or 1
 * 5: noise   - periodic 2D noise
 */
const TAU = Math.PI * 2

function oscSine(t) {
    // Smooth continuous sine: 0->1->0 over t=0..1, no discontinuity at wrap
    return (1.0 - Math.cos(t * TAU)) * 0.5
}

function oscTri(t) {
    // Triangle wave: 0->1->0 over t=0..1
    const tf = t - Math.floor(t)
    return 1.0 - Math.abs(tf * 2.0 - 1.0)
}

function oscSaw(t) {
    // Sawtooth: 0->1 over t=0..1
    return t - Math.floor(t)
}

function oscSawInv(t) {
    // Inverted sawtooth: 1->0 over t=0..1
    return 1.0 - (t - Math.floor(t))
}

function oscSquare(t) {
    // Square wave: 0 or 1
    return (t - Math.floor(t)) >= 0.5 ? 1.0 : 0.0
}

// Simple hash for noise
function hash21(px, py, s) {
    let x = (px * 234.34 + s) % 1
    let y = (py * 435.345 + s) % 1
    if (x < 0) x += 1
    if (y < 0) y += 1
    const p = x + y + (x + y) * 34.23
    return (x * y * p) % 1
}

// Value noise 2D
function noise2D(px, py, s) {
    const ix = Math.floor(px)
    const iy = Math.floor(py)
    let fx = px - ix
    let fy = py - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)

    const a = hash21(ix, iy, s)
    const b = hash21(ix + 1, iy, s)
    const c = hash21(ix, iy + 1, s)
    const d = hash21(ix + 1, iy + 1, s)

    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

// Looping noise - samples on a circle for seamless temporal loops
function oscNoise(t, seed) {
    const temporal = t % 1
    const angle = temporal * TAU
    const radius = 2
    const loopX = Math.cos(angle) * radius
    const loopY = Math.sin(angle) * radius
    const n1 = noise2D(loopX + seed, loopY + seed, seed)
    const n2 = noise2D(loopX + seed * 2, loopY + seed * 2, seed)
    return (n1 + n2) / 2
}

/**
 * Evaluate an oscillator value based on current time and animation duration.
 *
 * @param {object} osc - Oscillator configuration
 * @param {number} osc.oscType - 0:sine, 1:tri, 2:saw, 3:sawInv, 4:square, 5:noise
 * @param {number} osc.min - Minimum output value
 * @param {number} osc.max - Maximum output value
 * @param {number} osc.speed - Speed multiplier (integer, divides evenly into loop)
 * @param {number} osc.offset - Phase offset 0..1
 * @param {number} osc.seed - Noise seed (for noise type only)
 * @param {number} normalizedTime - Time normalized to animation duration (0..1)
 * @returns {number} The evaluated oscillator value
 */
function evaluateOscillator(osc, normalizedTime) {
    const { oscType, min, max, speed, offset, seed } = osc

    // Apply speed and offset
    const t = normalizedTime * speed + offset

    // Get raw oscillator value (0..1)
    let value
    switch (oscType) {
        case 0: value = oscSine(t); break
        case 1: value = oscTri(t); break
        case 2: value = oscSaw(t); break
        case 3: value = oscSawInv(t); break
        case 4: value = oscSquare(t); break
        case 5: value = oscNoise(t, seed); break
        default: value = 0
    }

    // Map to min..max range
    return min + value * (max - min)
}

export class Pipeline {
    constructor(graph, backend) {
        this.graph = graph
        this.backend = backend
        this.frameIndex = 0
        this.lastTime = 0
        this.surfaces = new Map()        // Global surfaces (o0-o7)
        this.globalUniforms = {}
        this.width = 0
        this.height = 0
        this.zoom = 1  // Zoom factor for effect surfaces
        // Pre-allocate frame Maps to avoid per-frame allocation
        this.frameReadTextures = new Map()
        this.frameWriteTextures = new Map()
        this.animationDuration = 10  // Default animation loop duration in seconds
        // Pre-allocate frame state object to avoid per-frame allocation
        this._frameState = {
            frameIndex: 0,
            time: 0,
            globalUniforms: null,
            surfaces: {},
            writeSurfaces: {},
            graph: null,
            screenWidth: 0,
            screenHeight: 0
        }
        // Pre-allocated surface key arrays to avoid allocation during getFrameState
        this._surfaceKeys = []
        this._writeSurfaceKeys = []
        // Pre-allocated pass proxy for oscillator resolution (avoids per-frame object spread)
        this._oscillatorPassProxy = {
            uniforms: {}
        }
        this._resolvedUniforms = {}  // Reused for oscillator resolution
        // Track render passes per frame
        this.lastPassCount = 0
    }

    /**
     * Set the animation duration for oscillators.
     * Oscillators loop evenly over this duration.
     * @param {number} seconds - Animation loop duration in seconds
     */
    setAnimationDuration(seconds) {
        this.animationDuration = seconds
    }

    /**
     * Initialize the pipeline
     * @param {number} width - Width in pixels
     * @param {number} height - Height in pixels
     * @param {number} [zoom=1] - Zoom factor for effect surfaces
     */
    async init(width, height, zoom = 1) {
        await this.backend.init()
        await this.compilePrograms()
        this.resize(width, height, zoom)
    }

    /**
     * Compile all shader programs referenced by the graph
     */
    async compilePrograms() {
        if (!this.graph || !this.graph.passes) return

        const compiled = new Set()

        for (const pass of this.graph.passes) {
            if (compiled.has(pass.program)) continue

            const spec = this.resolveProgramSpec(pass)

            if (!spec) {
                throw {
                    code: 'ERR_PROGRAM_SPEC_MISSING',
                    program: pass.program,
                    pass: pass.id
                }
            }

            await this.backend.compileProgram(pass.program, spec)
            compiled.add(pass.program)
        }
    }

    /**
     * Resolve the program specification for a pass
     */
    resolveProgramSpec(pass) {
        const programs = this.graph?.programs

        if (programs instanceof Map && programs.has(pass.program)) {
            return programs.get(pass.program)
        }

        if (programs && typeof programs === 'object' && programs[pass.program]) {
            return programs[pass.program]
        }

        return null
    }

    /**
     * Resize the pipeline
     * @param {number} width - Width in pixels
     * @param {number} height - Height in pixels
     * @param {number} [zoom=1] - Zoom factor for effect surfaces
     */
    resize(width, height, zoom = 1) {
        this.width = width
        this.height = height
        this.zoom = zoom

        // Create/recreate global surfaces
        this.createSurfaces()

        // Recreate textures with screen-relative dimensions
        // Collect default uniforms from passes for parameter-based texture sizing
        const defaultUniforms = this.collectDefaultUniforms()
        this.recreateTextures(defaultUniforms)

        this.backend.resize(width, height)
    }

    /**
     * Collect default uniform values from all passes
     * Used for resolving parameter-based texture dimensions
     */
    collectDefaultUniforms() {
        const uniforms = {}
        if (this.graph && this.graph.passes) {
            for (const pass of this.graph.passes) {
                if (pass.uniforms) {
                    Object.assign(uniforms, pass.uniforms)
                }
            }
        }
        return uniforms
    }

    /**
     * Create global output surfaces (o0, o1, o2, o3, o4, o5, o6, o7)
     * Also scans the graph for any other required global surfaces (starting with global_)
     */
    /**
     * Check if a texture ID is a global surface reference and extract the name.
     * Supports "global_name" pattern.
     * Returns null if not a global, otherwise returns the surface name.
     */
    parseGlobalName(texId) {
        if (typeof texId !== 'string') return null

        // "global_name" (underscore separator)
        if (texId.startsWith('global_')) {
            return texId.replace('global_', '')
        }

        return null
    }

    createSurfaces() {
        const surfaceNames = new Set(['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'])

        // Global geometry buffers (geo0-geo7) - 2D textures with normals + depth
        const geoBufferNames = new Set(['geo0', 'geo1', 'geo2', 'geo3', 'geo4', 'geo5', 'geo6', 'geo7'])

        // Global 3D volume buffers (vol0-vol7)
        const volumeNames = new Set(['vol0', 'vol1', 'vol2', 'vol3', 'vol4', 'vol5', 'vol6', 'vol7'])

        // Collect default uniforms for parameter-based texture sizing
        const defaultUniforms = this.collectDefaultUniforms()

        // Scan graph for other globals
        if (this.graph && this.graph.passes) {
            for (const pass of this.graph.passes) {
                if (pass.inputs) {
                    for (const texId of Object.values(pass.inputs)) {
                        const globalName = this.parseGlobalName(texId)
                        if (globalName) {
                            surfaceNames.add(globalName)
                        }
                    }
                }
                if (pass.outputs) {
                    for (const texId of Object.values(pass.outputs)) {
                        const globalName = this.parseGlobalName(texId)
                        if (globalName) {
                            surfaceNames.add(globalName)
                        }
                    }
                }
            }
        }

        // Use stored zoom value
        const effectiveZoom = (typeof this.zoom === 'number' && this.zoom > 0) ? this.zoom : 1

        // Create global surfaces (o0-o7 and dynamic globals)
        for (const name of surfaceNames) {
            // Calculate scaled dimensions for zoom-sensitive surfaces
            let surfaceWidth = this.width
            let surfaceHeight = this.height
            let surfaceFormat = 'rgba16f'

            // Check if there's a texture spec for this surface in graph.textures
            // This handles effect-defined textures that need ping-pong buffering
            // Support both naming conventions: "global_name" and "globalName"
            const underscoreId = `global_${name}`
            let texSpec = this.graph?.textures?.get?.(underscoreId)
            if (texSpec) {
                surfaceWidth = this.resolveDimension(texSpec.width, this.width, defaultUniforms)
                surfaceHeight = this.resolveDimension(texSpec.height, this.height, defaultUniforms)
                if (texSpec.format) surfaceFormat = texSpec.format
            } else {
                // Apply zoom scaling to non-standard global surfaces
                // Standard outputs (o0-o7) are always screen-sized
                // Custom effect surfaces get zoom scaling if the effect has a zoom control
                const isStandardOutput = /^o[0-7]$/.test(name)
                if (!isStandardOutput && effectiveZoom > 1) {
                    surfaceWidth = Math.max(1, Math.round(this.width / effectiveZoom))
                    surfaceHeight = Math.max(1, Math.round(this.height / effectiveZoom))
                }
            }

            // Check if existing surface can be reused (preserves sim state on recompile)
            const oldSurface = this.surfaces.get(name)
            if (oldSurface) {
                const existingTex = this.backend.textures?.get?.(oldSurface.read)
                if (existingTex &&
                    existingTex.width === surfaceWidth &&
                    existingTex.height === surfaceHeight) {
                    // Surface exists with correct dimensions, preserve it
                    continue
                }
                // Dimensions changed, destroy old surface
                this.backend.destroyTexture(`global_${name}_read`)
                this.backend.destroyTexture(`global_${name}_write`)
            }

            // Create double-buffered surface
            // Include 'storage' usage for compute shader output
            this.backend.createTexture(`global_${name}_read`, {
                width: surfaceWidth,
                height: surfaceHeight,
                format: surfaceFormat,
                usage: ['render', 'sample', 'copySrc', 'storage']
            })

            this.backend.createTexture(`global_${name}_write`, {
                width: surfaceWidth,
                height: surfaceHeight,
                format: surfaceFormat,
                usage: ['render', 'sample', 'copySrc', 'storage']
            })

            this.surfaces.set(name, {
                read: `global_${name}_read`,
                write: `global_${name}_write`,
                currentFrame: 0
            })
        }

        // Create geometry buffers (geo0-geo7) - 2D textures with normals + depth
        // These store precomputed raymarching results for post-processing
        for (const name of geoBufferNames) {
            const oldSurface = this.surfaces.get(name)
            if (oldSurface) {
                const existingTex = this.backend.textures?.get?.(oldSurface.read)
                if (existingTex &&
                    existingTex.width === this.width &&
                    existingTex.height === this.height) {
                    continue
                }
                this.backend.destroyTexture(`global_${name}_read`)
                this.backend.destroyTexture(`global_${name}_write`)
            }

            // Geometry buffers are screen-sized, RGBA16F (xyz=normal, w=depth)
            this.backend.createTexture(`global_${name}_read`, {
                width: this.width,
                height: this.height,
                format: 'rgba16f',
                usage: ['render', 'sample', 'copySrc', 'storage']
            })

            this.backend.createTexture(`global_${name}_write`, {
                width: this.width,
                height: this.height,
                format: 'rgba16f',
                usage: ['render', 'sample', 'copySrc', 'storage']
            })

            this.surfaces.set(name, {
                read: `global_${name}_read`,
                write: `global_${name}_write`,
                currentFrame: 0
            })
        }

        // Create 3D volume buffers (vol0-vol7) as 2D atlas textures
        // Using 64x4096 (64^3 stored as 64 slices of 64x64)
        // This matches the atlas layout used by effects like ca3d, rd3d, noise3d
        const volumeSliceSize = 64
        const volumeAtlasHeight = volumeSliceSize * volumeSliceSize // 64 * 64 = 4096
        for (const name of volumeNames) {
            const oldSurface = this.surfaces.get(name)
            if (oldSurface) {
                const existingTex = this.backend.textures?.get?.(oldSurface.read)
                if (existingTex &&
                    existingTex.width === volumeSliceSize &&
                    existingTex.height === volumeAtlasHeight) {
                    continue
                }
                this.backend.destroyTexture(`global_${name}_read`)
                this.backend.destroyTexture(`global_${name}_write`)
            }

            // Volume atlases are volumeSliceSize x volumeSliceSize^2, RGBA16F
            this.backend.createTexture(`global_${name}_read`, {
                width: volumeSliceSize,
                height: volumeAtlasHeight,
                format: 'rgba16f',
                usage: ['render', 'sample', 'copySrc', 'storage']
            })

            this.backend.createTexture(`global_${name}_write`, {
                width: volumeSliceSize,
                height: volumeAtlasHeight,
                format: 'rgba16f',
                usage: ['render', 'sample', 'copySrc', 'storage']
            })

            this.surfaces.set(name, {
                read: `global_${name}_read`,
                write: `global_${name}_write`,
                currentFrame: 0
            })
        }
    }

    /**
     * Check if a dimension spec is parameter-dependent
     * @param {number|string|object} spec - Dimension specification
     * @returns {boolean} True if the spec references a parameter
     */
    isParameterDependentDimension(spec) {
        return typeof spec === 'object' && spec !== null && spec.param !== undefined
    }

    /**
     * Recreate textures with new dimensions based on current uniform values
     * @param {object} [uniforms] - Current uniform values for parameter-based sizing
     */
    recreateTextures(uniforms = {}) {
        if (!this.graph || !this.graph.textures) return

        for (const [texId, spec] of this.graph.textures.entries()) {
            // Check if this is a global surface (double-buffered)
            // Global surfaces use naming like "global_node_X_caState" in textures map
            // but the surface is stored as "caState" with read/write variants
            const isGlobalSurface = texId.startsWith('global_') || texId.startsWith('global')

            // For global surfaces, only resize if they have parameter-dependent dimensions
            if (isGlobalSurface) {
                const hasParamWidth = this.isParameterDependentDimension(spec.width)
                const hasParamHeight = this.isParameterDependentDimension(spec.height)
                if (!hasParamWidth && !hasParamHeight) {
                    continue  // Fixed-size global, skip
                }
            }

            // Resolve dimensions with current uniforms
            const width = this.resolveDimension(spec.width, this.width, uniforms)
            const height = this.resolveDimension(spec.height, this.height, uniforms)

            if (isGlobalSurface) {
                // Handle double-buffered global surface
                // Extract the surface name from the texture ID
                // texId might be "global_node_0_caState" or "globalCaState"
                let surfaceName = null
                if (texId.startsWith('global_')) {
                    // "global_node_0_caState" -> find the surface name after last underscore segment
                    // Actually, we need to match against our surfaces Map
                    // Try to find matching surface - could be "caState" or "node_0_caState"
                    for (const name of this.surfaces.keys()) {
                        if (texId.includes(name) || texId.endsWith(name)) {
                            surfaceName = name
                            break
                        }
                    }
                } else if (texId.startsWith('global')) {
                    // "globalCaState" -> "caState"
                    const suffix = texId.slice(6)
                    surfaceName = suffix.charAt(0).toLowerCase() + suffix.slice(1)
                }

                if (!surfaceName || !this.surfaces.has(surfaceName)) {
                    continue  // Can't find matching surface
                }

                const surface = this.surfaces.get(surfaceName)
                const readTexId = surface.read
                const writeTexId = surface.write

                // Check if size changed
                const existingTex = this.backend.textures?.get?.(readTexId)
                if (existingTex && existingTex.width === width && existingTex.height === height) {
                    continue  // No change needed
                }

                // Destroy old textures
                this.backend.destroyTexture(readTexId)
                this.backend.destroyTexture(writeTexId)

                // Recreate double-buffered surface with new dimensions
                const format = spec.format || 'rgba16f'
                this.backend.createTexture(readTexId, {
                    width,
                    height,
                    format,
                    usage: ['render', 'sample', 'copySrc', 'storage']
                })
                this.backend.createTexture(writeTexId, {
                    width,
                    height,
                    format,
                    usage: ['render', 'sample', 'copySrc', 'storage']
                })
            } else {
                // Handle regular (non-global) texture
                // Check if size changed
                const existingTex = this.backend.textures?.get?.(texId)
                if (existingTex && existingTex.width === width && existingTex.height === height) {
                    // For 3D textures, also check depth
                    if (!spec.is3D || existingTex.depth === this.resolveDimension(spec.depth, width, uniforms)) {
                        continue  // No change needed
                    }
                }

                // Destroy old texture
                this.backend.destroyTexture(texId)

                // Create texture (2D or 3D based on spec)
                if (spec.is3D) {
                    const depth = this.resolveDimension(spec.depth, width, uniforms)
                    this.backend.createTexture3D(texId, {
                        ...spec,
                        width,
                        height,
                        depth
                    })
                } else {
                    this.backend.createTexture(texId, {
                        ...spec,
                        width,
                        height
                    })
                }
            }
        }
    }

    /**
     * Update parameter-dependent textures when uniforms change
     * Call this when volumeSize or similar sizing parameters change
     * @param {object} uniforms - Current uniform values
     */
    updateParameterTextures(uniforms = {}) {
        this.recreateTextures(uniforms)
    }

    /**
     * Set a global uniform value
     * Automatically triggers texture resizing if the parameter affects texture dimensions
     * @param {string} name - Uniform name
     * @param {any} value - Uniform value
     */
    setUniform(name, value) {
        const oldValue = this.globalUniforms[name]
        this.globalUniforms[name] = value

        // Check if this is a scoped uniform (e.g., 'stateSize_node_5')
        // Scoped uniforms should NOT propagate to other scoped variants
        const isScopedUniform = /_node_\d+$/.test(name)

        // Also update the uniform in all passes that reference it
        // Additionally, propagate to scoped variants (e.g., stateSize -> stateSize_node_1)
        // This supports multiple particle pipelines with per-pipeline texture sizing
        if (this.graph && this.graph.passes) {
            for (const pass of this.graph.passes) {
                if (pass.uniforms && name in pass.uniforms) {
                    pass.uniforms[name] = value
                }
                // Only propagate from base name to scoped variants, not from scoped to scoped
                // This allows each pipeline's stateSize to be set independently
                if (!isScopedUniform && pass.uniforms) {
                    for (const key of Object.keys(pass.uniforms)) {
                        if (key.startsWith(name + '_node_')) {
                            pass.uniforms[key] = value
                            this.globalUniforms[key] = value
                        }
                    }
                }
            }
        }

        // Check if this uniform affects any texture dimensions
        // Include both direct matches and scoped variants (e.g., stateSize_node_1)
        if (oldValue !== value && this.graph && this.graph.textures) {
            let affectsTextures = false
            for (const spec of this.graph.textures.values()) {
                if (this.dimensionReferencesParam(spec.width, name) ||
                    this.dimensionReferencesParam(spec.height, name) ||
                    (spec.depth && this.dimensionReferencesParam(spec.depth, name)) ||
                    this.dimensionReferencesScopedParam(spec.width, name) ||
                    this.dimensionReferencesScopedParam(spec.height, name) ||
                    (spec.depth && this.dimensionReferencesScopedParam(spec.depth, name))) {
                    affectsTextures = true
                    break
                }
            }

            if (affectsTextures) {
                this.updateParameterTextures(this.globalUniforms)
            }
        }
    }

    /**
     * Check if a dimension spec references a specific parameter
     * @param {number|string|object} spec - Dimension specification
     * @param {string} paramName - Parameter name to check for
     * @returns {boolean} True if the spec references the parameter
     */
    dimensionReferencesParam(spec, paramName) {
        return typeof spec === 'object' && spec !== null && spec.param === paramName
    }

    /**
     * Check if a dimension spec references a scoped variant of a parameter
     * Scoped params look like 'stateSize_node_1' for param 'stateSize'
     * @param {number|string|object} spec - Dimension specification
     * @param {string} paramName - Base parameter name to check for
     * @returns {boolean} True if the spec references a scoped version of the parameter
     */
    dimensionReferencesScopedParam(spec, paramName) {
        return typeof spec === 'object' && spec !== null &&
               typeof spec.param === 'string' &&
               spec.param.startsWith(paramName + '_node_')
    }

    /**
     * Resolve dimension spec to actual pixel value
     * @param {number|string|object} spec - Dimension specification
     * @param {number} screenSize - Screen dimension for relative specs
     * @param {object} [uniforms] - Current uniform values for param references
     */
    resolveDimension(spec, screenSize, uniforms = {}) {
        if (typeof spec === 'number') {
            return Math.max(1, Math.floor(spec))
        }

        if (spec === 'screen' || spec === 'auto') {
            return screenSize
        }

        if (typeof spec === 'string' && spec.endsWith('%')) {
            const percent = parseFloat(spec)
            return Math.max(1, Math.floor(screenSize * percent / 100))
        }

        if (typeof spec === 'object') {
            // Handle parameter reference: { param: 'volumeSize' }
            if (spec.param !== undefined) {
                // Get the parameter value from uniforms, or use paramDefault/64 as fallback
                // NOTE: 'default' is used as the FINAL computed fallback when power/multiply
                // are present. Use 'paramDefault' to specify the param's own default.
                const hasTransform = spec.power !== undefined || spec.multiply !== undefined
                const paramDefault = spec.paramDefault ?? 64  // Default param value

                // If param is in uniforms, use it. Otherwise use paramDefault for computation.
                let value = uniforms[spec.param] ?? paramDefault

                // Apply multiplier if specified: { param: 'volumeSize', multiply: 2 }
                if (spec.multiply !== undefined) {
                    value *= spec.multiply
                }

                // Apply power if specified: { param: 'volumeSize', power: 2 } means value^2
                if (spec.power !== undefined) {
                    value = Math.pow(value, spec.power)
                }

                // If we have a transform AND the param wasn't found in uniforms AND
                // a 'default' is specified, use 'default' as the final computed value
                // This allows specs like { param: 'volumeSize', power: 2, default: 4096 }
                // where 4096 is the intended height when volumeSize=64 (64^2=4096)
                if (hasTransform && uniforms[spec.param] === undefined && spec.default !== undefined) {
                    value = spec.default
                }

                return Math.max(1, Math.floor(value))
            }

            // Handle scale-based spec
            if (spec.scale !== undefined) {
                let computed = Math.floor(screenSize * spec.scale)
                if (spec.clamp) {
                    if (spec.clamp.min !== undefined) {
                        computed = Math.max(spec.clamp.min, computed)
                    }
                    if (spec.clamp.max !== undefined) {
                        computed = Math.min(spec.clamp.max, computed)
                    }
                }
                return Math.max(1, computed)
            }
        }

        return screenSize
    }

    /**
     * Execute a single frame
     */
    render(time = 0) {
        // Handle deltaTime carefully - time is normalized 0-1 and wraps
        // When time wraps from ~1 to ~0, use a small positive delta instead of negative
        let deltaTime = this.lastTime > 0 ? time - this.lastTime : 0
        if (deltaTime < 0) {
            // Time wrapped around, use a reasonable small delta
            deltaTime = 1.0 / 60.0 / 10.0  // Approximate one frame at 60fps normalized to 10s loop
        }
        this.lastTime = time

        // Update global uniforms
        this.updateGlobalUniforms(time, deltaTime)

        // Initialize per-frame surface bindings so within-frame reads see fresh writes
        // Clear and reuse Maps to avoid per-frame allocation
        this.frameReadTextures.clear()
        this.frameWriteTextures.clear()
        for (const [name, surface] of this.surfaces.entries()) {
            this.frameReadTextures.set(name, surface.read)
            this.frameWriteTextures.set(name, surface.write)  // Start by writing to write buffer
        }

        // Begin frame
        this.backend.beginFrame(this.getFrameState())

        // Track passes executed this frame
        let passCount = 0

        // Execute passes
        if (this.graph && this.graph.passes) {
            try {
                for (let i = 0; i < this.graph.passes.length; i++) {
                    const originalPass = this.graph.passes[i]
                    // Check pass conditions
                    if (this.shouldSkipPass(originalPass)) {
                        continue
                    }

                    // Resolve oscillators in pass uniforms for this frame
                    const pass = this.resolvePassUniforms(originalPass, time)

                    // Determine iteration count (repeat N times per frame)
                    const repeatCount = this.resolveRepeatCount(pass)

                    for (let iter = 0; iter < repeatCount; iter++) {
                        // Execute pass
                        try {
                            const state = this.getFrameState()
                            this.backend.executePass(pass, state)
                            passCount++
                            this.updateFrameSurfaceBindings(pass, state)
                        } catch (err) {
                            console.error('[Pipeline.render] ERROR executing pass:', pass.id, err)
                            throw err
                        }

                        // Swap global surface read/write pointers for ping-pong between iterations
                        if (repeatCount > 1) {
                            this.swapIterationBuffers(pass)
                        }
                    }
                }
            } catch (loopErr) {
                console.error('[Pipeline.render] LOOP ERROR:', loopErr)
                throw loopErr
            }
        }

        // End frame
        this.backend.endFrame()

        // Present the render surface to screen
        // Use explicit render() directive or the last surface written to
        const renderSurfaceName = this.graph?.renderSurface
        if (!renderSurfaceName) {
            console.warn('[Pipeline.render] No renderSurface specified in graph')
            return
        }
        const renderSurface = this.surfaces.get(renderSurfaceName)
        if (renderSurface && this.backend.present) {
            const presentId = this.frameReadTextures?.get(renderSurfaceName) ?? renderSurface.read
            this.backend.present(presentId)
        }

        // Swap double buffers for global surfaces
        this.swapBuffers()

        // Store pass count for this frame
        this.lastPassCount = passCount

        this.frameIndex++
    }

    /**
     * Update global uniforms (time, resolution, etc.)
     * Mutates existing object to avoid per-frame allocation
     */
    updateGlobalUniforms(time, deltaTime) {
        const g = this.globalUniforms
        const aspectValue = this.width / this.height
        // Update time-varying uniforms in place
        g.time = time
        g.deltaTime = deltaTime
        g.frame = this.frameIndex
        // Reuse or create resolution array
        if (!g.resolution) {
            g.resolution = [this.width, this.height]
        } else {
            g.resolution[0] = this.width
            g.resolution[1] = this.height
        }
        g.aspect = aspectValue
        g.aspectRatio = aspectValue // Alias for shaders expecting this name
    }

    /**
     * Resolve oscillators in a uniform value.
     * If the value is an oscillator configuration, evaluate it.
     * @param {any} value - The uniform value (may be an oscillator config)
     * @param {number} time - Current time in seconds
     * @returns {any} The resolved value
     */
    resolveUniformValue(value, time) {
        // Check if this is an oscillator configuration
        // Note: `time` is already normalized 0-1 from CanvasRenderer
        if (value && typeof value === 'object' && value.oscillator === true) {
            const result = evaluateOscillator(value, time)
            return result
        }
        return value
    }

    /**
     * Resolve all oscillators in pass uniforms for the current frame.
     * Uses a pre-allocated proxy object to avoid per-frame allocations.
     * @param {Object} pass - The pass definition
     * @param {number} time - Current time in seconds
     * @returns {Object} Pass or proxy with resolved uniforms
     */
    resolvePassUniforms(pass, time) {
        if (!pass.uniforms) return pass

        const resolvedUniforms = this._resolvedUniforms
        let hasOscillators = false

        // Clear resolved uniforms (set to undefined to avoid delete deopt)
        for (const key in resolvedUniforms) {
            resolvedUniforms[key] = undefined
        }

        for (const name in pass.uniforms) {
            const value = pass.uniforms[name]
            const resolved = this.resolveUniformValue(value, time)
            resolvedUniforms[name] = resolved
            if (resolved !== value) {
                hasOscillators = true
            }
        }

        // If no oscillators, return original pass
        if (!hasOscillators) {
            return pass
        }

        // Use pre-allocated proxy object to avoid per-frame allocation
        // Copy all pass properties to proxy (this is rare - only for oscillator passes)
        const proxy = this._oscillatorPassProxy
        proxy.id = pass.id
        proxy.program = pass.program
        proxy.inputs = pass.inputs
        proxy.outputs = pass.outputs
        proxy.clear = pass.clear
        proxy.blend = pass.blend
        proxy.drawMode = pass.drawMode
        proxy.count = pass.count
        proxy.repeat = pass.repeat
        proxy.conditions = pass.conditions
        proxy.viewport = pass.viewport
        proxy.drawBuffers = pass.drawBuffers
        proxy.storageTextures = pass.storageTextures
        proxy.samplerTypes = pass.samplerTypes
        proxy.entryPoint = pass.entryPoint

        // Swap uniform references (avoid copying values)
        const proxyUniforms = proxy.uniforms
        proxy.uniforms = resolvedUniforms
        this._resolvedUniforms = proxyUniforms

        return proxy
    }

    /**
     * Check if a pass should be skipped based on conditions
     */
    shouldSkipPass(pass) {
        if (!pass.conditions) return false

        const { skipIf, runIf } = pass.conditions

        // Check skipIf conditions - skip if ANY condition matches
        if (skipIf) {
            for (const condition of skipIf) {
                const value = this.globalUniforms[condition.uniform] ?? pass.uniforms?.[condition.uniform]
                if (value === condition.equals) {
                    return true
                }
            }
        }

        // Check runIf conditions - skip if ANY condition doesn't match
        if (runIf) {
            let shouldRun = true
            for (const condition of runIf) {
                const value = this.globalUniforms[condition.uniform] ?? pass.uniforms?.[condition.uniform]
                if (value !== condition.equals) {
                    shouldRun = false
                    break
                }
            }
            if (!shouldRun) {
                return true
            }
        }

        return false
    }

    /**
     * Resolve the repeat count for a pass.
     * Supports static values or uniform-driven iteration counts.
     * @param {Object} pass - The pass definition
     * @returns {number} - Number of times to execute the pass
     */
    resolveRepeatCount(pass) {
        if (!pass.repeat) return 1

        // If repeat is a number, use it directly
        if (typeof pass.repeat === 'number') {
            return Math.max(1, Math.floor(pass.repeat))
        }

        // If repeat is a string, treat it as a uniform name
        if (typeof pass.repeat === 'string') {
            const value = this.globalUniforms[pass.repeat] ?? pass.uniforms?.[pass.repeat]
            if (typeof value === 'number') {
                return Math.max(1, Math.floor(value))
            }
        }

        return 1
    }

    /**
     * Swap read/write pointers for global surfaces written by a pass.
     * Used for ping-pong between iterations of a repeated pass.
     * @param {Object} pass - The pass that just executed
     */
    swapIterationBuffers(pass) {
        if (!pass.outputs) return

        for (const outputName of Object.values(pass.outputs)) {
            if (typeof outputName !== 'string') continue

            // Only swap global surfaces (not feedback surfaces)
            const globalName = this.parseGlobalName(outputName)
            if (!globalName) continue

            const surface = this.surfaces.get(globalName)
            if (!surface) continue

            // Swap read/write pointers
            const temp = surface.read
            surface.read = surface.write
            surface.write = temp

            // Update frameReadTextures and frameWriteTextures to match
            if (this.frameReadTextures) {
                this.frameReadTextures.set(globalName, surface.read)
            }
            if (this.frameWriteTextures) {
                this.frameWriteTextures.set(globalName, surface.write)
            }
        }
    }

    /**
     * Swap double-buffered surfaces at end of frame.
     *
     * For state surfaces (xyz, vel, rgba, trail), we DON'T swap - we persist
     * the frame's final read/write bindings so particles continue from where they left off.
     *
     * For display surfaces (o0-o7), we swap so the next frame renders fresh.
     */
    swapBuffers() {
        // Check if a surface name is a state surface that should persist
        const isStateSurface = (name) => {
            // Exact matches
            if (name === 'xyz' || name === 'vel' || name === 'rgba' || name === 'trail') {
                return true
            }
            // Suffix matches for namespaced surfaces (e.g., points_trail, flow_trail)
            if (name.endsWith('_xyz') || name.endsWith('_vel') ||
                name.endsWith('_rgba') || name.endsWith('_trail')) {
                return true
            }
            // State texture patterns
            if (name.includes('state') || name.includes('State')) {
                return true
            }
            // Scoped particle textures: xyz_node_N, vel_node_N, rgba_node_N, points_trail_node_N
            // These are created when multiple particle pipelines coexist in the same chain
            if (/^(xyz|vel|rgba|points_trail)_node_\d+$/.test(name)) {
                return true
            }
            return false
        }

        for (const [name, surface] of this.surfaces.entries()) {
            surface.currentFrame = this.frameIndex

            if (isStateSurface(name)) {
                // State surfaces: persist the frame's final bindings
                const finalRead = this.frameReadTextures?.get(name)
                const finalWrite = this.frameWriteTextures?.get(name)

                if (finalRead && finalWrite) {
                    surface.read = finalRead
                    surface.write = finalWrite
                }
            } else {
                // Display surfaces: normal swap
                const temp = surface.read
                surface.read = surface.write
                surface.write = temp
            }
        }
    }

    /**
     * Get current frame state
     * Reuses pre-allocated objects to minimize per-frame allocations
     */
    getFrameState() {
        const state = this._frameState
        const surfaceMap = state.surfaces
        const writeSurfaceMap = state.writeSurfaces

        // Clear previous frame's surface entries by setting to undefined
        // (delete causes hidden class deoptimization)
        const oldSurfaceKeys = this._surfaceKeys
        const oldWriteSurfaceKeys = this._writeSurfaceKeys
        for (let i = 0; i < oldSurfaceKeys.length; i++) {
            surfaceMap[oldSurfaceKeys[i]] = undefined
        }
        for (let i = 0; i < oldWriteSurfaceKeys.length; i++) {
            writeSurfaceMap[oldWriteSurfaceKeys[i]] = undefined
        }
        // Reset key arrays (reuse same arrays)
        oldSurfaceKeys.length = 0
        oldWriteSurfaceKeys.length = 0

        // Build surfaces map with current read textures
        for (const [name, surface] of this.surfaces.entries()) {
            const readTextureId = this.frameReadTextures.get(name) ?? surface.read
            const tex = this.backend.textures.get(readTextureId)
            if (tex) {
                surfaceMap[name] = tex
                oldSurfaceKeys.push(name)
            }
            // Use the frame's write target (set at frame start, doesn't change during frame)
            // This ensures multiple passes writing to the same surface all write to the same buffer
            const writeTarget = this.frameWriteTextures.get(name) ?? surface.write
            writeSurfaceMap[name] = writeTarget
            oldWriteSurfaceKeys.push(name)
        }

        // Update scalar state fields
        state.frameIndex = this.frameIndex
        state.time = this.lastTime
        state.globalUniforms = this.globalUniforms
        state.graph = this.graph
        state.screenWidth = this.width
        state.screenHeight = this.height

        return state
    }

    /**
     * Get the output texture for a surface
     * @param {string} surfaceName - Surface name (defaults to graph.renderSurface)
     */
    getOutput(surfaceName) {
        const name = surfaceName || this.graph?.renderSurface
        if (!name) return null
        const surface = this.surfaces.get(name)
        if (!surface) return null

        return this.backend.textures.get(surface.read)
    }

    /**
     * Clear a surface to transparent black.
     * Used to clear surfaces when chains are deleted.
     * @param {string} surfaceName - Surface name (e.g., 'o0', 'o1')
     */
    clearSurface(surfaceName) {
        if (!surfaceName) return

        const surface = this.surfaces.get(surfaceName)
        if (!surface) return

        // Clear both read and write textures to ensure no stale data
        if (this.backend.clearTexture) {
            this.backend.clearTexture(surface.read)
            this.backend.clearTexture(surface.write)
        }
    }

    /**
     * Update frame-local surface bindings after a pass writes to a global surface.
     * This implements within-frame ping-pong: after a pass writes to a surface,
     * subsequent passes will read from that write buffer, and write to the other buffer.
     */
    updateFrameSurfaceBindings(pass, state) {
        if (!pass.outputs) return

        for (const outputName of Object.values(pass.outputs)) {
            if (typeof outputName !== 'string') continue

            // Handle global surface writes (both global_ and globalName patterns)
            const surfaceName = this.parseGlobalName(outputName)
            if (surfaceName) {
                if (!this.frameReadTextures || !this.frameWriteTextures) continue

                const writeId = state.writeSurfaces?.[surfaceName]
                if (!writeId) continue

                // Get the current read texture (will become the new write target)
                const currentReadId = this.frameReadTextures.get(surfaceName)

                // Subsequent passes in this frame should sample the freshly written texture
                this.frameReadTextures.set(surfaceName, writeId)

                // And write to the buffer we were just reading from (ping-pong)
                if (currentReadId) {
                    this.frameWriteTextures.set(surfaceName, currentReadId)
                }
            }
        }
    }

    /**
     * Dispose of all pipeline resources
     */
    dispose() {
        // Destroy all global surfaces
        for (const [name] of this.surfaces) {
            this.backend.destroyTexture(`global_${name}_read`)
            this.backend.destroyTexture(`global_${name}_write`)
        }
        this.surfaces.clear()

        // Destroy all graph textures
        if (this.graph && this.graph.textures) {
            for (const texId of this.graph.textures.keys()) {
                if (!texId.startsWith('global_') && !texId.startsWith('feedback_')) {
                    this.backend.destroyTexture(texId)
                }
            }
        }

        // Destroy backend resources
        if (this.backend && typeof this.backend.destroy === 'function') {
            this.backend.destroy({ skipTextures: true })
        }

        // Clear references
        this.graph = null
        this.frameReadTextures = null
        this.globalUniforms = {}
    }
}

/**
 * Create a pipeline with the appropriate backend
 * @param {object} graph - Compiled shader graph
 * @param {object} options - Options
 * @param {HTMLCanvasElement} options.canvas - Canvas element
 * @param {number} options.width - Width in pixels
 * @param {number} options.height - Height in pixels
 * @param {boolean} options.preferWebGPU - Use WebGPU if available
 * @param {number} [options.zoom=1] - Zoom factor for effect surfaces
 */
export async function createPipeline(graph, options = {}) {
    let backend

    // Determine backend
    if (options.preferWebGPU && await WebGPUBackend.isAvailable()) {
        const adapter = await navigator.gpu.requestAdapter()
        // Request higher limits for MRT with high-precision textures
        // Default maxColorAttachmentBytesPerSample is 32, but we need 40+
        // for 2x RGBA32Float (16 bytes each) + RGBA8Unorm (4 bytes) = 40 bytes
        const device = await adapter.requestDevice({
            requiredLimits: {
                maxColorAttachmentBytesPerSample: Math.min(
                    adapter.limits.maxColorAttachmentBytesPerSample,
                    128  // Request up to 128 bytes for flexibility
                )
            }
        })
        let context = null
        if (options.canvas) {
            context = options.canvas.getContext('webgpu')
            if (context) {
                context.configure({
                    device: device,
                    format: navigator.gpu.getPreferredCanvasFormat(),
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
                    alphaMode: 'premultiplied'
                })
            }
        }
        backend = new WebGPUBackend(device, context)
    } else if (options.canvas) {
        const gl = options.canvas.getContext('webgl2', { preserveDrawingBuffer: true })
        if (!gl) {
            throw new Error('WebGL2 not available')
        }
        backend = new WebGL2Backend(gl)
    } else {
        throw new Error('No backend available or canvas not provided')
    }

    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(options.width || 800, options.height || 600, options.zoom || 1)

    return pipeline
}
