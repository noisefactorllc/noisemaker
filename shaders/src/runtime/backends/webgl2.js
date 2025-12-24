/**
 * WebGL 2 Backend Implementation
 */

import { Backend } from '../backend.js'
import {
    DEFAULT_VERTEX_SHADER,
    FULLSCREEN_TRIANGLE_POSITIONS,
    FULLSCREEN_TRIANGLE_VERTEX_COUNT
} from '../default-shaders.js'

export class WebGL2Backend extends Backend {
    constructor(context) {
        super(context)
        this.gl = context
        this.fbos = new Map() // texture_id -> framebuffer
        this.fullscreenVAO = null
        this.presentProgram = null
        this.maxTextureUnits = 16
    }

    /**
     * Parse a texture ID to extract the global surface name.
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
                // Convert to surface name: "FlowState" → "flowState"
                return suffix.charAt(0).toLowerCase() + suffix.slice(1)
            }
        }

        return null
    }

    async init() {
        const gl = this.gl

        // Enable extensions for floating point textures
        if (!gl.getExtension('EXT_color_buffer_float')) {
            console.warn('EXT_color_buffer_float not supported')
        }
        if (!gl.getExtension('OES_texture_float_linear')) {
            console.warn('OES_texture_float_linear not supported')
        }

        // Get capabilities
        this.maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)

        // Create full-screen quad VAO
        this.fullscreenVAO = this.createFullscreenVAO()
        this.emptyVAO = gl.createVertexArray()
        this.presentProgram = this.createPresentProgram()
        this.defaultTexture = this.createDefaultTexture()

        return Promise.resolve()
    }

    createDefaultTexture() {
        const gl = this.gl
        const texture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, texture)
        // 1x1 transparent black texture
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        return texture
    }

    createPresentProgram() {
        const gl = this.gl
        const vs = DEFAULT_VERTEX_SHADER
        const fs = `#version 300 es
        precision highp float;
        in vec2 v_texCoord;
        uniform sampler2D u_texture;
        out vec4 fragColor;
        void main() {
            fragColor = texture(u_texture, v_texCoord);
        }`

        const vertShader = this.compileShader(gl.VERTEX_SHADER, vs)
        const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fs)

        const program = gl.createProgram()
        gl.attachShader(program, vertShader)
        gl.attachShader(program, fragShader)

        // Ensure a_position is at location 0 to match VAO
        gl.bindAttribLocation(program, 0, 'a_position')

        gl.linkProgram(program)

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Failed to link present program')
            return null
        }

        gl.deleteShader(vertShader)
        gl.deleteShader(fragShader)

        return {
            handle: program,
            uniforms: {
                texture: gl.getUniformLocation(program, 'u_texture')
            }
        }
    }

    createFullscreenVAO() {
        const gl = this.gl

        // Create vertex buffer with full-screen triangle
        const positions = FULLSCREEN_TRIANGLE_POSITIONS

        const buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

        // Create VAO
        const vao = gl.createVertexArray()
        gl.bindVertexArray(vao)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
        gl.bindVertexArray(null)
        gl.bindBuffer(gl.ARRAY_BUFFER, null)

        return vao
    }

    createTexture(id, spec) {
        const gl = this.gl
        const texture = gl.createTexture()

        gl.bindTexture(gl.TEXTURE_2D, texture)

        // Resolve format
        const glFormat = this.resolveFormat(spec.format)

        // Allocate texture storage
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            glFormat.internalFormat,
            spec.width,
            spec.height,
            0,
            glFormat.format,
            glFormat.type,
            null
        )

        // Set texture parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

        gl.bindTexture(gl.TEXTURE_2D, null)

        this.textures.set(id, {
            handle: texture,
            width: spec.width,
            height: spec.height,
            format: spec.format,
            glFormat
        })

        // Create FBO if this will be a render target
        if (spec.usage && spec.usage.includes('render')) {
            this.createFBO(id, texture)
        }

        return texture
    }

    createFBO(id, texture) {
        const gl = this.gl
        const fbo = gl.createFramebuffer()

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0
        )

        // Check FBO status
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error(`FBO incomplete for texture ${id}: ${status}`)
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        this.fbos.set(id, fbo)
    }

    /**
     * Create or retrieve an MRT FBO for multiple render targets
     * @param {string} id - Unique identifier for this MRT configuration
     * @param {Array<WebGLTexture>} textures - Array of texture handles to attach
     * @returns {WebGLFramebuffer}
     */
    createMRTFBO(id, textures) {
        const gl = this.gl

        // Check if already cached
        if (this.fbos.has(id)) {
            return this.fbos.get(id)
        }

        const fbo = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)

        const drawBuffers = []
        for (let i = 0; i < textures.length; i++) {
            const attachment = gl.COLOR_ATTACHMENT0 + i
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                attachment,
                gl.TEXTURE_2D,
                textures[i],
                0
            )
            drawBuffers.push(attachment)
        }

        // Enable all color attachments for writing
        gl.drawBuffers(drawBuffers)

        // Check FBO status
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error(`MRT FBO incomplete for ${id}: ${status}`)
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        this.fbos.set(id, fbo)
        return fbo
    }

    /**
     * Create a 3D texture for volume data.
     * Note: WebGL2 supports sampling from 3D textures but cannot render to them directly.
     * 3D textures are used for volumetric caching and lookup.
     */
    createTexture3D(id, spec) {
        const gl = this.gl
        const texture = gl.createTexture()

        gl.bindTexture(gl.TEXTURE_3D, texture)

        // Resolve format
        const glFormat = this.resolveFormat(spec.format)

        // Allocate 3D texture storage
        gl.texImage3D(
            gl.TEXTURE_3D,
            0,
            glFormat.internalFormat,
            spec.width,
            spec.height,
            spec.depth,
            0,
            glFormat.format,
            glFormat.type,
            null
        )

        // Set texture parameters - use LINEAR for trilinear filtering support
        const filterMode = spec.filter === 'nearest' ? gl.NEAREST : gl.LINEAR
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filterMode)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filterMode)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)

        gl.bindTexture(gl.TEXTURE_3D, null)

        this.textures.set(id, {
            handle: texture,
            width: spec.width,
            height: spec.height,
            depth: spec.depth,
            format: spec.format,
            glFormat,
            is3D: true
        })

        return texture
    }

    /**
     * Update a texture from an external source (video, image, canvas).
     * This is used for media input effects that need to display camera/video content.
     * @param {string} id - Texture ID
     * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement|ImageBitmap} source - Media source
     * @param {object} [options] - Update options
     * @param {boolean} [options.flipY=true] - Whether to flip the Y axis
     */
    updateTextureFromSource(id, source, options = {}) {
        const gl = this.gl
        let tex = this.textures.get(id)

        const flipY = options.flipY !== false

        // Get source dimensions
        let width, height
        if (source instanceof HTMLVideoElement) {
            width = source.videoWidth
            height = source.videoHeight
        } else if (source instanceof HTMLImageElement) {
            width = source.naturalWidth || source.width
            height = source.naturalHeight || source.height
        } else if (source instanceof HTMLCanvasElement || source instanceof ImageBitmap) {
            width = source.width
            height = source.height
        } else {
            console.warn(`[updateTextureFromSource] Unknown source type for ${id}`)
            return { width: 0, height: 0 }
        }

        if (width === 0 || height === 0) {
            return { width: 0, height: 0 }
        }

        // Create texture if it doesn't exist or if dimensions changed
        if (!tex || tex.width !== width || tex.height !== height) {
            if (tex) {
                gl.deleteTexture(tex.handle)
            }

            const texture = gl.createTexture()
            gl.bindTexture(gl.TEXTURE_2D, texture)

            // Set texture parameters for video/image sampling
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

            tex = {
                handle: texture,
                width,
                height,
                format: 'rgba8',
                glFormat: this.resolveFormat('rgba8'),
                isExternal: true
            }
            this.textures.set(id, tex)
        }

        gl.bindTexture(gl.TEXTURE_2D, tex.handle)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY)

        // Upload the source to the texture
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            source
        )

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        gl.bindTexture(gl.TEXTURE_2D, null)

        return { width, height }
    }

    destroyTexture(id) {
        const gl = this.gl
        const tex = this.textures.get(id)

        if (tex) {
            gl.deleteTexture(tex.handle)
            this.textures.delete(id)
        }

        // Delete single-texture FBO for this texture
        const fbo = this.fbos.get(id)
        if (fbo) {
            gl.deleteFramebuffer(fbo)
            this.fbos.delete(id)
        }

        // Also invalidate any MRT FBOs that reference this texture
        // MRT FBO IDs contain the texture IDs in their name (e.g., "mrt_node_0_pass_0_texA_texB")
        const mrtToDelete = []
        for (const fboId of this.fbos.keys()) {
            if (fboId.startsWith('mrt_') && fboId.includes(id)) {
                mrtToDelete.push(fboId)
            }
        }
        for (const mrtId of mrtToDelete) {
            gl.deleteFramebuffer(this.fbos.get(mrtId))
            this.fbos.delete(mrtId)
        }
    }

    /**
     * Clear a texture to transparent black.
     * Used to clear surfaces when chains are deleted.
     * @param {string} id - Texture ID
     */
    clearTexture(id) {
        const gl = this.gl
        const tex = this.textures.get(id)

        if (!tex) {
            return
        }

        // Get or create FBO for this texture
        let fbo = this.fbos.get(id)
        if (!fbo) {
            fbo = gl.createFramebuffer()
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.handle, 0)
            this.fbos.set(id, fbo)
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
        }

        // Clear to transparent black
        gl.viewport(0, 0, tex.width, tex.height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    /**
     * Copy one texture to another (blit operation).
     * Used for surface copy operations.
     * @param {string} srcId - Source texture ID
     * @param {string} dstId - Destination texture ID
     */
    copyTexture(srcId, dstId) {
        const gl = this.gl
        const srcTex = this.textures.get(srcId)
        const dstTex = this.textures.get(dstId)

        if (!srcTex || !dstTex) {
            console.warn(`[copyTexture] Missing texture: src=${srcId} (${!!srcTex}), dst=${dstId} (${!!dstTex})`)
            return
        }

        // Use blitFramebuffer for efficient texture copy
        // Create temporary FBOs if needed
        let readFbo = this.fbos.get(srcId)
        if (!readFbo) {
            readFbo = gl.createFramebuffer()
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFbo)
            gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, srcTex.handle, 0)
        } else {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFbo)
        }

        let drawFbo = this.fbos.get(dstId)
        if (!drawFbo) {
            drawFbo = gl.createFramebuffer()
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawFbo)
            gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dstTex.handle, 0)
            // Store for future use
            this.fbos.set(dstId, drawFbo)
        } else {
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawFbo)
        }

        // Blit the texture
        gl.blitFramebuffer(
            0, 0, srcTex.width, srcTex.height,
            0, 0, dstTex.width, dstTex.height,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST
        )

        // Unbind
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
    }

    async compileProgram(id, spec) {
        const gl = this.gl

        // Check for missing shader source
        const rawSource = spec.source || spec.glsl || spec.fragment
        if (!rawSource) {
            throw new Error(`Shader source missing for program '${id}'. You may need to regenerate the shader manifest.`)
        }

        // Inject defines
        const source = this.injectDefines(rawSource, spec.defines || {})

        // Compile vertex shader
        const vsSource = spec.vertex || DEFAULT_VERTEX_SHADER
        const usingDefaultVertex = !spec.vertex
        const vertShader = this.compileShader(gl.VERTEX_SHADER, vsSource)

        // Compile fragment shader
        const fragShader = this.compileShader(gl.FRAGMENT_SHADER, source)

        // Link program
        const program = gl.createProgram()
        gl.attachShader(program, vertShader)
        gl.attachShader(program, fragShader)

        if (usingDefaultVertex) {
            gl.bindAttribLocation(program, 0, 'a_position')
        }

        gl.linkProgram(program)

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program)
            throw {
                code: 'ERR_SHADER_LINK',
                detail: log,
                program: id
            }
        }

        // Clean up shaders
        gl.deleteShader(vertShader)
        gl.deleteShader(fragShader)

        // Extract uniforms and attribute locations
        const uniforms = this.extractUniforms(program)
        const attributes = {
            a_position: gl.getAttribLocation(program, 'a_position'),
            aPosition: gl.getAttribLocation(program, 'aPosition')
        }

        const compiledProgram = {
            handle: program,
            uniforms,
            attributes
        }

        this.programs.set(id, compiledProgram)
        return compiledProgram
    }

    compileShader(type, source) {
        const gl = this.gl
        const shader = gl.createShader(type)

        gl.shaderSource(shader, source)
        gl.compileShader(shader)

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader)
            gl.deleteShader(shader)
            throw {
                code: 'ERR_SHADER_COMPILE',
                detail: log,
                source
            }
        }

        return shader
    }

    injectDefines(source, defines) {
        if (!source) {
            throw new Error('Shader source is missing. You may need to regenerate the shader manifest.')
        }

        let injected = '#version 300 es\nprecision highp float;\n'

        for (const [key, value] of Object.entries(defines)) {
            injected += `#define ${key} ${value}\n`
        }

        // Remove any existing version directive from source
        const cleaned = source.replace(/^\s*#version.*$/m, '')

        return injected + cleaned
    }

    extractUniforms(program) {
        const gl = this.gl
        const uniforms = {}
        const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)

        for (let i = 0; i < count; i++) {
            const info = gl.getActiveUniform(program, i)
            const location = gl.getUniformLocation(program, info.name)

            uniforms[info.name] = {
                location,
                type: info.type,
                size: info.size
            }
        }

        return uniforms
    }

    executePass(pass, state) {
        const gl = this.gl

        // WebGL2 GPGPU: Convert passes with compute-style conventions to render passes
        // Compute shaders don't exist in WebGL2, so we use fragment shaders
        // with fullscreen triangles as a GPGPU fallback
        const needsConversion = pass.storageTextures || (pass.outputs && pass.outputs.outputBuffer)
        const effectivePass = needsConversion ? this.convertComputeToRender(pass) : pass

        const program = this.programs.get(effectivePass.program)

        if (!program) {
            console.error(`Program ${effectivePass.program} not found for pass ${effectivePass.id}`)
            throw {
                code: 'ERR_PROGRAM_NOT_FOUND',
                pass: effectivePass.id,
                program: effectivePass.program
            }
        }

        // Use program
        gl.useProgram(program.handle)

        // Check for MRT (Multiple Render Targets)
        const outputKeys = Object.keys(effectivePass.outputs || {})
        const isMRT = effectivePass.drawBuffers > 1 || outputKeys.length > 1

        let fbo = null
        let viewportTex = null
        let outputId = null  // Track primary output for reference (used by points draw mode)

        // Track actual number of MRT attachments for drawBuffers call
        let mrtAttachmentCount = 0

        if (isMRT) {
            // MRT pass - bind multiple outputs
            const textures = []
            const resolvedOutputIds = []

            for (const outputKey of outputKeys) {
                let currentOutputId = effectivePass.outputs[outputKey]

                // Resolve global surface to current write buffer
                const globalName = this.parseGlobalName(currentOutputId)
                if (globalName) {
                    if (state.writeSurfaces && state.writeSurfaces[globalName]) {
                        currentOutputId = state.writeSurfaces[globalName]
                    }
                }

                // Track first output as primary reference
                if (!outputId) outputId = currentOutputId

                resolvedOutputIds.push(currentOutputId)
                const tex = this.textures.get(currentOutputId)
                if (tex) {
                    textures.push(tex.handle)
                    if (!viewportTex) viewportTex = tex
                } else {
                    console.warn(`[executePass MRT] Texture not found for ${currentOutputId} in pass ${effectivePass.id}`)
                }
            }

            if (textures.length > 0) {
                // Create unique ID for this MRT configuration
                const mrtId = `mrt_${effectivePass.id}_${resolvedOutputIds.join('_')}`
                fbo = this.createMRTFBO(mrtId, textures)
                mrtAttachmentCount = textures.length
            }
        } else {
            // Single output pass
            outputId = effectivePass.outputs?.color || Object.values(effectivePass.outputs || {})[0]

            // Resolve global surface to current write buffer
            const globalName = this.parseGlobalName(outputId)
            if (globalName) {
                if (state.writeSurfaces && state.writeSurfaces[globalName]) {
                    outputId = state.writeSurfaces[globalName]
                }
            }

            fbo = this.fbos.get(outputId)
            if (!fbo && outputId !== 'screen') {
                console.warn(`[executePass] FBO not found for ${outputId} in pass ${effectivePass.id}`)
            }

            viewportTex = this.textures.get(outputId)
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo || null)

        // For MRT, we need to call drawBuffers again after binding the FBO
        // Use actual attachment count, not outputKeys.length, in case some textures weren't found
        if (isMRT && fbo && mrtAttachmentCount > 0) {
            const drawBuffers = []
            for (let i = 0; i < mrtAttachmentCount; i++) {
                drawBuffers.push(gl.COLOR_ATTACHMENT0 + i)
            }
            gl.drawBuffers(drawBuffers)
        }

        // Set viewport
        if (viewportTex) {
            gl.viewport(0, 0, viewportTex.width, viewportTex.height)
        } else if (effectivePass.viewport) {
            gl.viewport(effectivePass.viewport.x, effectivePass.viewport.y, effectivePass.viewport.w, effectivePass.viewport.h)
        } else {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
        }

        // DEBUG: Clear to random color to verify FBO write
        // gl.clearColor(Math.random(), Math.random(), Math.random(), 1.0)
        // gl.clear(gl.COLOR_BUFFER_BIT)

        // Bind input textures
        this.bindTextures(effectivePass, program, state)

        // Bind uniforms
        this.bindUniforms(effectivePass, program, state)

        // Handle Blending
        if (effectivePass.blend) {
            gl.enable(gl.BLEND)
            if (Array.isArray(effectivePass.blend)) {
                const srcFactor = this.resolveBlendFactor(effectivePass.blend[0])
                const dstFactor = this.resolveBlendFactor(effectivePass.blend[1])
                gl.blendFunc(srcFactor, dstFactor)
            } else {
                // Default to additive
                gl.blendFunc(gl.ONE, gl.ONE)
            }
        } else {
            gl.disable(gl.BLEND)
        }

        // Draw
        if (effectivePass.drawMode === 'points') {
            let count = effectivePass.count || 1000
            if (count === 'auto' || count === 'screen' || count === 'input') {
                // Determine count based on mode
                let refTex = null

                if (count === 'input' && effectivePass.inputs && effectivePass.inputs.inputTex) {
                    // Use input texture dimensions
                    const inputId = effectivePass.inputs.inputTex
                    const inputGlobalName = this.parseGlobalName(inputId)
                    if (inputGlobalName) {
                        const surfaceTex = state.surfaces?.[inputGlobalName]
                        if (surfaceTex) {
                            refTex = surfaceTex
                        }
                    } else {
                        refTex = this.textures.get(inputId)
                    }
                } else {
                    // Use output texture dimensions (auto) or screen
                    const tex = this.textures.get(outputId)
                    refTex = tex
                }

                if (refTex && refTex.width && refTex.height) {
                    count = refTex.width * refTex.height
                } else {
                    count = gl.drawingBufferWidth * gl.drawingBufferHeight
                }
            }

            gl.bindVertexArray(this.emptyVAO)
            gl.drawArrays(gl.POINTS, 0, count)
            gl.bindVertexArray(null)
        } else {
            // Default to fullscreen triangle
            gl.bindVertexArray(this.fullscreenVAO)
            gl.drawArrays(gl.TRIANGLES, 0, FULLSCREEN_TRIANGLE_VERTEX_COUNT)
            gl.bindVertexArray(null)
        }

        // Check for errors - drain all errors from the queue
        let error = gl.getError()
        while (error !== gl.NO_ERROR) {
            // Build detailed error context
            const outputId = effectivePass.outputs?.color || Object.values(effectivePass.outputs || {})[0] || 'unknown'
            const inputIds = effectivePass.inputs ? Object.entries(effectivePass.inputs).map(([k,v]) => `${k}=${v}`).join(', ') : 'none'
            console.error(`WebGL Error ${error} in pass ${effectivePass.id} (effect: ${effectivePass.effectKey || 'unknown'}, program: ${effectivePass.program}, output: ${outputId}, inputs: ${inputIds})`)
            error = gl.getError()
        }

        // Unbind
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.useProgram(null)
        gl.disable(gl.BLEND)
    }

    /**
     * Convert a compute pass to a GPGPU render pass for WebGL2 fallback
     * WebGL2 doesn't support compute shaders, so we use fragment shaders
     * with fullscreen triangles to achieve similar functionality.
     */
    convertComputeToRender(pass) {
        // Create a render-equivalent pass
        const renderPass = {
            ...pass,
            type: 'render',
            _originalType: 'compute'
        }

        // Map compute outputs to render outputs
        // Compute shaders typically write to storage buffers/textures
        // For GPGPU, we write to framebuffer color attachments
        if (pass.storageTextures) {
            renderPass.outputs = {}
            for (const [key, texId] of Object.entries(pass.storageTextures)) {
                // Map storage texture to render output
                renderPass.outputs[key] = texId
            }
        }

        // If outputs exist but use compute conventions (outputBuffer -> fragColor)
        if (pass.outputs) {
            renderPass.outputs = {}
            for (const [key, texId] of Object.entries(pass.outputs)) {
                // Normalize output names
                const normalizedKey = key === 'outputBuffer' ? 'color' : key
                renderPass.outputs[normalizedKey] = texId
            }
        }

        // Ensure we have at least one output
        if (!renderPass.outputs || Object.keys(renderPass.outputs).length === 0) {
            renderPass.outputs = { color: 'outputTex' }
        }

        return renderPass
    }

    bindTextures(pass, program, state) {
        const gl = this.gl
        let unit = 0

        if (!pass.inputs) return

        for (const [samplerName, texId] of Object.entries(pass.inputs)) {
            if (unit >= this.maxTextureUnits) {
                throw {
                    code: 'ERR_TOO_MANY_TEXTURES',
                    pass: pass.id,
                    limit: this.maxTextureUnits
                }
            }

            // Get texture from state or textures map
            let texture
            const globalName = this.parseGlobalName(texId)
            if (globalName) {
                // Global surface - use the current read texture from state
                // The pipeline handles ping-pong via updateFrameSurfaceBindings,
                // which swaps read/write pointers after each pass writes.
                texture = state.surfaces?.[globalName]?.handle
            } else {
                texture = this.textures.get(texId)?.handle
            }

            // If texture is missing, use default texture (transparent black)
            // This handles cases where a pipeline reads from an uninitialized surface
            // (e.g. reading o0 before writing to it) without crashing or warning.
            if (!texture) {
                texture = this.defaultTexture
            }

            // Check if this is a 3D texture
            const texInfo = this.textures.get(texId)
            const is3D = texInfo?.is3D

            gl.activeTexture(gl.TEXTURE0 + unit)
            gl.bindTexture(is3D ? gl.TEXTURE_3D : gl.TEXTURE_2D, texture || null)

            // Bind sampler uniform
            const uniform = program.uniforms[samplerName]
            if (uniform) {
                gl.uniform1i(uniform.location, unit)
            }

            unit++
        }
    }

    bindUniforms(pass, program, state) {
        const gl = this.gl
        const programUniforms = program.uniforms

        // Bind pass uniforms first (from DSL/effect defaults)
        if (pass.uniforms) {
            for (const name in pass.uniforms) {
                const uniform = programUniforms[name]
                if (!uniform) continue
                const value = pass.uniforms[name]
                if (value === undefined || value === null) continue
                this._setUniform(gl, uniform, value)
            }
        }

        // Then bind globalUniforms on top (allows runtime overrides)
        if (state.globalUniforms) {
            for (const name in state.globalUniforms) {
                const uniform = programUniforms[name]
                if (!uniform) continue
                const value = state.globalUniforms[name]
                if (value === undefined || value === null) continue
                this._setUniform(gl, uniform, value)
            }
        }
    }

    /** @private Helper to set a single uniform value */
    _setUniform(gl, uniform, value) {
        const loc = uniform.location
        switch (uniform.type) {
            case gl.FLOAT:
                gl.uniform1f(loc, value)
                break
            case gl.INT:
            case gl.BOOL:
                gl.uniform1i(loc, typeof value === 'boolean' ? (value ? 1 : 0) : value)
                break
            case gl.FLOAT_VEC2:
                gl.uniform2fv(loc, value)
                break
            case gl.FLOAT_VEC3:
                gl.uniform3fv(loc, value)
                break
            case gl.FLOAT_VEC4:
                gl.uniform4fv(loc, value)
                break
            case gl.FLOAT_MAT3:
                gl.uniformMatrix3fv(loc, false, value)
                break
            case gl.FLOAT_MAT4:
                gl.uniformMatrix4fv(loc, false, value)
                break
        }
    }

    beginFrame() {
        const gl = this.gl
        gl.clearColor(0, 0, 0, 0)
    }

    endFrame() {
        const gl = this.gl
        gl.flush()
    }

    present(textureId) {
        const gl = this.gl
        const tex = this.textures.get(textureId)
        if (!tex || !this.presentProgram || !this.fullscreenVAO) {
            console.warn('Present skipped: missing texture or program', { textureId, tex, prog: !!this.presentProgram })
            return
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)

        // Clear the screen first
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.useProgram(this.presentProgram.handle)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tex.handle)
        gl.uniform1i(this.presentProgram.uniforms.texture, 0)

        gl.bindVertexArray(this.fullscreenVAO)
        gl.drawArrays(gl.TRIANGLES, 0, FULLSCREEN_TRIANGLE_VERTEX_COUNT)

        const error = gl.getError()
        if (error !== gl.NO_ERROR) {
            console.error(`WebGL Error in present: ${error}`)
        }

        gl.bindVertexArray(null)

        gl.useProgram(null)
    }

    resize() {
        // Canvas resize is handled externally
        // We'll recreate textures in the pipeline when needed
    }

    destroy(options = {}) {
        const gl = this.gl
        if (!gl) {
            return
        }

        // Delete textures and associated framebuffers
        for (const id of Array.from(this.textures.keys())) {
            this.destroyTexture(id)
        }

        this.textures.clear()

        // Delete compiled programs
        for (const program of this.programs.values()) {
            if (program?.handle) {
                gl.deleteProgram(program.handle)
            }
        }
        this.programs.clear()

        if (this.presentProgram?.handle) {
            gl.deleteProgram(this.presentProgram.handle)
        }
        this.presentProgram = null

        if (this.fullscreenVAO) {
            gl.deleteVertexArray(this.fullscreenVAO)
            this.fullscreenVAO = null
        }

        if (this.emptyVAO) {
            gl.deleteVertexArray(this.emptyVAO)
            this.emptyVAO = null
        }

        this.fbos.clear()

        if (options?.loseContext) {
            const loseCtx = gl.getExtension('WEBGL_lose_context')
            if (loseCtx) {
                loseCtx.loseContext()
            }
        }

        this.gl = null
        this.context = null
    }

    resolveFormat(format) {
        const gl = this.gl

        const formats = {
            'rgba8': {
                internalFormat: gl.RGBA8,
                format: gl.RGBA,
                type: gl.UNSIGNED_BYTE
            },
            'rgba16f': {
                internalFormat: gl.RGBA16F,
                format: gl.RGBA,
                type: gl.HALF_FLOAT
            },
            'rgba32f': {
                internalFormat: gl.RGBA32F,
                format: gl.RGBA,
                type: gl.FLOAT
            },
            'r8': {
                internalFormat: gl.R8,
                format: gl.RED,
                type: gl.UNSIGNED_BYTE
            },
            'r16f': {
                internalFormat: gl.R16F,
                format: gl.RED,
                type: gl.HALF_FLOAT
            },
            'r32f': {
                internalFormat: gl.R32F,
                format: gl.RED,
                type: gl.FLOAT
            }
        }

        return formats[format] || formats['rgba8']
    }

    /**
     * Convert blend factor string to GL constant
     * @param {string|number} factor - Blend factor string (e.g., "ONE", "SRC_ALPHA") or GL constant
     * @returns {number} GL blend factor constant
     */
    resolveBlendFactor(factor) {
        const gl = this.gl
        if (typeof factor === 'number') return factor

        const factors = {
            'ZERO': gl.ZERO,
            'ONE': gl.ONE,
            'SRC_COLOR': gl.SRC_COLOR,
            'ONE_MINUS_SRC_COLOR': gl.ONE_MINUS_SRC_COLOR,
            'DST_COLOR': gl.DST_COLOR,
            'ONE_MINUS_DST_COLOR': gl.ONE_MINUS_DST_COLOR,
            'SRC_ALPHA': gl.SRC_ALPHA,
            'ONE_MINUS_SRC_ALPHA': gl.ONE_MINUS_SRC_ALPHA,
            'DST_ALPHA': gl.DST_ALPHA,
            'ONE_MINUS_DST_ALPHA': gl.ONE_MINUS_DST_ALPHA,
            'CONSTANT_COLOR': gl.CONSTANT_COLOR,
            'ONE_MINUS_CONSTANT_COLOR': gl.ONE_MINUS_CONSTANT_COLOR,
            'CONSTANT_ALPHA': gl.CONSTANT_ALPHA,
            'ONE_MINUS_CONSTANT_ALPHA': gl.ONE_MINUS_CONSTANT_ALPHA,
            'SRC_ALPHA_SATURATE': gl.SRC_ALPHA_SATURATE,
            // WebGPU-style lowercase
            'zero': gl.ZERO,
            'one': gl.ONE,
            'src': gl.SRC_COLOR,
            'one-minus-src': gl.ONE_MINUS_SRC_COLOR,
            'dst': gl.DST_COLOR,
            'one-minus-dst': gl.ONE_MINUS_DST_COLOR,
            'src-alpha': gl.SRC_ALPHA,
            'one-minus-src-alpha': gl.ONE_MINUS_SRC_ALPHA,
            'dst-alpha': gl.DST_ALPHA,
            'one-minus-dst-alpha': gl.ONE_MINUS_DST_ALPHA
        }

        return factors[factor] || gl.ONE
    }

    getName() {
        return 'WebGL2'
    }

    static isAvailable() {
        try {
            const canvas = document.createElement('canvas')
            const gl = canvas.getContext('webgl2')
            return !!gl
        } catch {
            return false
        }
    }
}
