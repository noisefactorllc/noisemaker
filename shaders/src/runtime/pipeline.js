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
        this.feedbackSurfaces = new Map() // Feedback surfaces (f0-f3)
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
            feedbackSurfaces: {},
            writeFeedbackSurfaces: {},
            graph: null,
            screenWidth: 0,
            screenHeight: 0
        }
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
     * Supports both "global_name" and "globalName" patterns.
     * Returns null if not a global, otherwise returns the surface name.
     */
    parseGlobalName(texId) {
        if (typeof texId !== 'string') return null

        // Pattern 1: "global_name" (underscore separator)
        if (texId.startsWith('global_')) {
            return texId.replace('global_', '')
        }

        // Pattern 2: "globalName" (camelCase)
        if (texId.startsWith('global') && texId.length > 6) {
            const suffix = texId.slice(6)
            // Check it's actually camelCase (next char is uppercase or digit)
            if (/^[A-Z0-9]/.test(suffix)) {
                // Convert to surface name: "CaState" → "caState"
                return suffix.charAt(0).toLowerCase() + suffix.slice(1)
            }
        }

        return null
    }

    /**
     * Check if a texture ID is a feedback surface reference and extract the name.
     * Supports "feedback_name" pattern (e.g., "feedback_f0").
     * Returns null if not a feedback surface, otherwise returns the surface name.
     */
    parseFeedbackName(texId) {
        if (typeof texId !== 'string') return null

        if (texId.startsWith('feedback_')) {
            return texId.replace('feedback_', '')
        }

        return null
    }

    createSurfaces() {
        const surfaceNames = new Set(['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'])
        const feedbackNames = new Set(['f0', 'f1', 'f2', 'f3'])

        // Collect default uniforms for parameter-based texture sizing
        const defaultUniforms = this.collectDefaultUniforms()

        // Scan graph for other globals and feedbacks
        if (this.graph && this.graph.passes) {
            for (const pass of this.graph.passes) {
                if (pass.inputs) {
                    for (const texId of Object.values(pass.inputs)) {
                        const globalName = this.parseGlobalName(texId)
                        if (globalName) {
                            surfaceNames.add(globalName)
                        }
                        const feedbackName = this.parseFeedbackName(texId)
                        if (feedbackName) {
                            feedbackNames.add(feedbackName)
                        }
                    }
                }
                if (pass.outputs) {
                    for (const texId of Object.values(pass.outputs)) {
                        const globalName = this.parseGlobalName(texId)
                        if (globalName) {
                            surfaceNames.add(globalName)
                        }
                        const feedbackName = this.parseFeedbackName(texId)
                        if (feedbackName) {
                            feedbackNames.add(feedbackName)
                        }
                    }
                }
            }
        }

        // Use stored zoom value
        const effectiveZoom = (typeof this.zoom === 'number' && this.zoom > 0) ? this.zoom : 1

        // Create global surfaces (o0-o7 and dynamic globals)
        for (const name of surfaceNames) {
            // Destroy old surface if exists
            const oldSurface = this.surfaces.get(name)
            if (oldSurface) {
                this.backend.destroyTexture(`global_${name}_read`)
                this.backend.destroyTexture(`global_${name}_write`)
            }

            // Calculate scaled dimensions for zoom-sensitive surfaces
            let surfaceWidth = this.width
            let surfaceHeight = this.height
            let surfaceFormat = 'rgba16f'

            // Check if there's a texture spec for this surface in graph.textures
            // This handles effect-defined textures that need ping-pong buffering
            // Support both naming conventions: "global_name" and "globalName"
            const underscoreId = `global_${name}`
            const camelCaseId = `global${name.charAt(0).toUpperCase()}${name.slice(1)}`
            let texSpec = this.graph?.textures?.get?.(underscoreId)
            if (!texSpec) {
                texSpec = this.graph?.textures?.get?.(camelCaseId)
            }
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

        // Create feedback surfaces (f0-f3)
        // Feedback surfaces use ping-pong blitting: reads always get previous frame,
        // writes go to a separate buffer that is blitted to read buffer at frame end
        for (const name of feedbackNames) {
            // Destroy old surface if exists
            const oldSurface = this.feedbackSurfaces.get(name)
            if (oldSurface) {
                this.backend.destroyTexture(`feedback_${name}_read`)
                this.backend.destroyTexture(`feedback_${name}_write`)
            }

            // Feedback surfaces are screen-sized rgba16f
            const surfaceWidth = this.width
            const surfaceHeight = this.height
            const surfaceFormat = 'rgba16f'

            // Create double-buffered feedback surface
            this.backend.createTexture(`feedback_${name}_read`, {
                width: surfaceWidth,
                height: surfaceHeight,
                format: surfaceFormat,
                usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage']
            })

            this.backend.createTexture(`feedback_${name}_write`, {
                width: surfaceWidth,
                height: surfaceHeight,
                format: surfaceFormat,
                usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage']
            })

            this.feedbackSurfaces.set(name, {
                read: `feedback_${name}_read`,
                write: `feedback_${name}_write`,
                currentFrame: 0,
                dirty: false  // Track if written to this frame
            })
        }
    }

    /**
     * Mark a feedback surface as dirty (for testing and manual control).
     * @param {string} name - Feedback surface name (e.g., 'f0')
     */
    markFeedbackDirty(name) {
        const surface = this.feedbackSurfaces.get(name)
        if (surface) {
            surface.dirty = true
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

        // Also update the uniform in all passes that reference it
        if (this.graph && this.graph.passes) {
            for (const pass of this.graph.passes) {
                if (pass.uniforms && name in pass.uniforms) {
                    pass.uniforms[name] = value
                }
            }
        }

        // Check if this uniform affects any texture dimensions
        if (oldValue !== value && this.graph && this.graph.textures) {
            let affectsTextures = false
            for (const spec of this.graph.textures.values()) {
                if (this.dimensionReferencesParam(spec.width, name) ||
                    this.dimensionReferencesParam(spec.height, name) ||
                    (spec.depth && this.dimensionReferencesParam(spec.depth, name))) {
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
                const paramValue = uniforms[spec.param] ?? spec.default ?? 64
                let value = paramValue

                // Apply multiplier if specified: { param: 'volumeSize', multiply: 2 }
                if (spec.multiply !== undefined) {
                    value *= spec.multiply
                }

                // Apply power if specified: { param: 'volumeSize', power: 2 } means value^2
                if (spec.power !== undefined) {
                    value = Math.pow(value, spec.power)
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
        const deltaTime = this.lastTime > 0 ? time - this.lastTime : 0
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

        // Note: feedback surfaces always read from previous frame (no frameReadTextures update)
        // We do NOT reset dirty flags here - they're set during pass execution
        // and cleared after blitFeedbackSurfaces at frame end

        // Begin frame
        this.backend.beginFrame(this.getFrameState())

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

        // Blit feedback surface writes to reads (ping-pong)
        // This preserves the written content for next frame's reads
        this.blitFeedbackSurfaces()

        // Present the render surface to screen
        // Use explicit render() directive, or the last surface written to, or default to o0
        const renderSurfaceName = this.graph?.renderSurface || 'o0'
        const renderSurface = this.surfaces.get(renderSurfaceName)
        if (renderSurface && this.backend.present) {
            const presentId = this.frameReadTextures?.get(renderSurfaceName) ?? renderSurface.read
            this.backend.present(presentId)
        }

        // Swap double buffers for global surfaces
        this.swapBuffers()

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
     * @param {Object} pass - The pass definition
     * @param {number} time - Current time in seconds
     * @returns {Object} Pass with resolved uniforms
     */
    resolvePassUniforms(pass, time) {
        if (!pass.uniforms) return pass

        const resolvedUniforms = {}
        let hasOscillators = false

        for (const [name, value] of Object.entries(pass.uniforms)) {
            const resolved = this.resolveUniformValue(value, time)
            resolvedUniforms[name] = resolved
            if (resolved !== value) {
                hasOscillators = true
            }
        }

        // Only create a new pass object if we resolved oscillators
        if (hasOscillators) {
            return { ...pass, uniforms: resolvedUniforms }
        }
        return pass
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
     * Swap double-buffered surfaces
     */
    swapBuffers() {
        for (const surface of this.surfaces.values()) {
            surface.currentFrame = this.frameIndex

            // Swap read/write pointers
            const temp = surface.read
            surface.read = surface.write
            surface.write = temp
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
        const feedbackSurfaceMap = state.feedbackSurfaces
        const writeFeedbackMap = state.writeFeedbackSurfaces

        // Clear previous frame's surface entries
        for (const key in surfaceMap) {
            delete surfaceMap[key]
        }
        for (const key in writeSurfaceMap) {
            delete writeSurfaceMap[key]
        }
        for (const key in feedbackSurfaceMap) {
            delete feedbackSurfaceMap[key]
        }
        for (const key in writeFeedbackMap) {
            delete writeFeedbackMap[key]
        }

        // Build surfaces map with current read textures
        for (const [name, surface] of this.surfaces.entries()) {
            const readTextureId = this.frameReadTextures.get(name) ?? surface.read
            const tex = this.backend.textures.get(readTextureId)
            if (tex) {
                surfaceMap[name] = tex
            }
            // Use the frame's write target (set at frame start, doesn't change during frame)
            // This ensures multiple passes writing to the same surface all write to the same buffer
            writeSurfaceMap[name] = this.frameWriteTextures.get(name) ?? surface.write
        }

        // Build feedback surfaces map
        // Reads always come from 'read' buffer (previous frame's content)
        // Writes go to 'write' buffer
        for (const [name, surface] of this.feedbackSurfaces.entries()) {
            const tex = this.backend.textures.get(surface.read)
            if (tex) {
                feedbackSurfaceMap[name] = tex
            }
            writeFeedbackMap[name] = surface.write
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
     * @param {string} surfaceName - Surface name (defaults to graph.renderSurface or 'o0')
     */
    getOutput(surfaceName) {
        const name = surfaceName || this.graph?.renderSurface || 'o0'
        const surface = this.surfaces.get(name)
        if (!surface) return null

        return this.backend.textures.get(surface.read)
    }

    /**
     * Update frame-local surface bindings after a pass writes to a global surface.
     * For feedback surfaces, mark them as dirty (but don't update frameReadTextures).
     */
    updateFrameSurfaceBindings(pass, state) {
        if (!pass.outputs) return

        for (const outputName of Object.values(pass.outputs)) {
            if (typeof outputName !== 'string') continue

            // Handle global surface writes (both global_ and globalName patterns)
            const surfaceName = this.parseGlobalName(outputName)
            if (surfaceName) {
                if (!this.frameReadTextures) continue

                const writeId = state.writeSurfaces?.[surfaceName]
                if (!writeId) continue

                // Subsequent passes in this frame should sample the freshly written texture
                this.frameReadTextures.set(surfaceName, writeId)
            }

            // Handle feedback surface writes
            if (outputName.startsWith('feedback_')) {
                const feedbackName = outputName.replace('feedback_', '')
                const surface = this.feedbackSurfaces.get(feedbackName)
                if (surface) {
                    surface.dirty = true
                }
                // Note: We do NOT update frameReadTextures for feedback surfaces
                // Reads always come from previous frame's content
            }
        }
    }

    /**
     * Blit feedback surfaces from write buffer to read buffer.
     * This is called at the end of each frame to persist written content
     * for the next frame's reads.
     */
    blitFeedbackSurfaces() {
        for (const surface of this.feedbackSurfaces.values()) {
            if (!surface.dirty) continue

            // Blit write → read using the backend's copy capability
            this.backend.copyTexture(surface.write, surface.read)
            surface.dirty = false
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

        // Destroy all feedback surfaces
        for (const [name] of this.feedbackSurfaces) {
            this.backend.destroyTexture(`feedback_${name}_read`)
            this.backend.destroyTexture(`feedback_${name}_write`)
        }
        this.feedbackSurfaces.clear()

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
        const device = await adapter.requestDevice()
        let context = null
        if (options.canvas) {
            context = options.canvas.getContext('webgpu')
            if (context) {
                context.configure({
                    device: device,
                    format: navigator.gpu.getPreferredCanvasFormat(),
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
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
