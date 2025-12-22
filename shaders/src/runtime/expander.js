import { getEffect } from './registry.js'
import { stdEnums } from '../lang/std_enums.js'

/**
 * Expands the Logical Graph (plans) into a Render Graph (passes).
 *
 * ## Texture Pipeline
 *
 * Effects can use standard 2D textures or 3D volumetric textures:
 *
 * ### 2D Textures (standard pipeline)
 * - `inputTex` - 2D input from previous effect in chain
 * - `outputTex` - 2D output to next effect in chain
 *
 * ### 3D Textures (volumetric pipeline)
 * - `inputTex3d` - 3D volume input from previous effect
 * - `outputTex3d` - 3D volume output to next effect
 *
 * 3D textures can be defined in effect `textures3d` property for true 3D storage:
 * ```javascript
 * textures3d = {
 *   myVolume: { width: 64, height: 64, depth: 64, format: 'rgba16f' }
 * }
 * ```
 *
 * Alternatively, effects can expose an existing internal texture (like a 2D atlas
 * representing 3D volume data) as the 3D output using the `outputTex3d` property:
 * ```javascript
 * // Declare the internal texture that holds 3D volume data
 * outputTex3d = "volumeCache";
 * ```
 *
 * ### Geometry Buffer (geoBuffer pipeline)
 * - `inputGeo` - Geometry buffer input from previous effect (normals + depth)
 * - `outputGeo` - Geometry buffer output to next effect
 *
 * The geometry buffer contains precomputed surface normals and depth from
 * 3D raymarched effects, enabling downstream post-processing without re-raymarching:
 * ```javascript
 * // Expose geoBuffer as the geometry output
 * outputGeo = "geoBuffer";
 * ```
 *
 * Note: WebGL2 can sample 3D textures but cannot render directly to them.
 * For compute-style writes to 3D textures, use WebGPU backend.
 *
 * @param {object} compilationResult { plans, diagnostics, render }
 * @param {object} [options] - Expansion options
 * @param {object} [options.shaderOverrides] - Per-step shader overrides, keyed by step index
 *   Example: { 0: { main: { glsl: '...', wgsl: '...' } } }
 * @returns {object} { passes, errors, programs, textureSpecs, renderSurface }
 */
export function expand(compilationResult, options = {}) {
    const shaderOverrides = options.shaderOverrides || {}
    const passes = []
    const errors = []
    const programs = {}
    const textureSpecs = {} // nodeId_texName -> { width, height, format, is3D?, depth? }
    const textureMap = new Map() // logical_id -> virtual_texture_id
    let lastWrittenSurface = null // Track the last surface written to

    // Helper to resolve enum paths
    const resolveEnum = (path) => {
        const parts = path.split('.')
        let node = stdEnums
        for (const part of parts) {
            if (node && node[part]) {
                node = node[part]
            } else {
                return null
            }
        }
        return node && node.value !== undefined ? node.value : null
    }

    // 1. Expand each plan into passes
    for (const plan of compilationResult.plans) {
        // Each plan is a chain of effects
        // We need to track the "current" output texture as we traverse the chain
        let currentInput = null      // 2D pipeline texture
        let currentInput3d = null    // 3D pipeline texture (for volumetric effects)
        let currentInputGeo = null   // Geometry buffer texture (normals + depth)
        let currentInputXyz = null   // Agent position texture (for particle effects)
        let currentInputVel = null   // Agent velocity texture (for particle effects)
        let currentInputRgba = null  // Agent color texture (for particle effects)
        let lastInlineWriteTarget = null  // Track the last inline write target to avoid redundant final blit

        // Pipeline uniforms accumulate from upstream effects for downstream consumption
        // Example: noise3d sets volumeSize, ca3d uses it without declaring it
        const pipelineUniforms = {}

        for (const step of plan.chain) {
            // Handle builtin read operations - these just set the current input
            if (step.builtin && step.op === '_read') {
                const tex = step.args?.tex
                if (tex && tex.kind === 'output') {
                    currentInput = `global_${tex.name}`  // e.g., 'global_o0'
                }
                // Register the read output so subsequent steps can find it via step.from
                const nodeId = `node_${step.temp}`
                textureMap.set(`${nodeId}_out`, currentInput)
                continue
            }
            if (step.builtin && step.op === '_read3d') {
                const tex3d = step.args?.tex3d
                const geo = step.args?.geo
                if (tex3d) {
                    // Handle VolRef (vol0-vol7) or plain name
                    if (tex3d.kind === 'vol' || tex3d.type === 'VolRef') {
                        currentInput3d = `global_${tex3d.name}`  // e.g., 'global_vol0'
                    } else {
                        currentInput3d = tex3d.name || tex3d
                    }
                }
                if (geo) {
                    // Handle GeoRef (geo0-geo7) or plain name
                    if (geo.kind === 'geo' || geo.type === 'GeoRef') {
                        currentInputGeo = `global_${geo.name}`  // e.g., 'global_geo0'
                    } else {
                        currentInputGeo = geo.name || geo
                    }
                }
                // Register the read3d output so subsequent steps can find it via step.from
                const nodeId = `node_${step.temp}`
                if (currentInput3d) textureMap.set(`${nodeId}_out3d`, currentInput3d)
                if (currentInputGeo) textureMap.set(`${nodeId}_outGeo`, currentInputGeo)
                continue
            }

            // Handle builtin write operations - these output to a surface AND pass through
            // This makes write() chainable: noise().write(o0).blur() works
            if (step.builtin && step.op === '_write') {
                const tex = step.args?.tex
                if (tex && currentInput) {
                    // Skip blit if target is "none" - just pass through
                    if (tex.name !== 'none') {
                        const targetSurface = `global_${tex.name}`

                        // Only add blit if the current input is not already the target surface
                        if (currentInput !== targetSurface) {
                            const nodeId = `node_${step.temp}`
                            const blitPass = {
                                id: `${nodeId}_write_blit`,
                                program: 'blit',
                                type: 'render',
                                inputs: { src: currentInput },
                                outputs: { color: targetSurface },
                                uniforms: {},
                                nodeId: nodeId,
                                stepIndex: step.temp
                            }
                            passes.push(blitPass)

                            // Ensure blit program exists
                            if (!programs['blit']) {
                                programs['blit'] = {
                                    fragment: `#version 300 es
                                        precision highp float;
                                        in vec2 v_texCoord;
                                        uniform sampler2D src;
                                        out vec4 fragColor;
                                        void main() {
                                            fragColor = texture(src, v_texCoord);
                                        }`,
                                    wgsl: `
                                        struct FragmentInput {
                                            @builtin(position) position: vec4<f32>,
                                            @location(0) uv: vec2<f32>,
                                        }

                                        @group(0) @binding(0) var src: texture_2d<f32>;
                                        @group(0) @binding(1) var srcSampler: sampler;

                                        @fragment
                                        fn main(in: FragmentInput) -> @location(0) vec4<f32> {
                                            // Flip Y to match WebGPU texture coordinate convention
                                            let uv = vec2<f32>(in.uv.x, 1.0 - in.uv.y);
                                            return textureSample(src, srcSampler, uv);
                                        }
                                    `,
                                    fragmentEntryPoint: 'main'
                                }
                            }

                            // Track last written surface for render directive
                            lastWrittenSurface = tex.name

                            // Track this inline write target so we can skip redundant final blit
                            lastInlineWriteTarget = { kind: tex.kind, name: tex.name }
                        }
                    }

                    // Pass through: the output of write() is the same texture that was written
                    // This allows chaining: noise().write(o0).blur() - blur receives the texture
                    const nodeId = `node_${step.temp}`
                    textureMap.set(`${nodeId}_out`, currentInput)
                    // currentInput stays the same - we pass through the input texture
                }
                continue
            }

            // Handle builtin write3d operations - write 3D volume and geometry to global surfaces
            // This makes write3d() chainable: noise3d().write3d(vol0, geo0).render3d() works
            if (step.builtin && step.op === '_write3d') {
                const tex3d = step.args?.tex3d
                const geo = step.args?.geo
                const nodeId = `node_${step.temp}`

                // Blit 3D volume to target global surface (skip if "none")
                if (tex3d && tex3d.name !== 'none' && currentInput3d) {
                    const targetVol = `global_${tex3d.name}`

                    // Only add blit if the current input is not already the target
                    if (currentInput3d !== targetVol) {
                        const blitPass = {
                            id: `${nodeId}_write3d_vol_blit`,
                            program: 'blit',
                            type: 'render',
                            inputs: { src: currentInput3d },
                            outputs: { color: targetVol },
                            uniforms: {},
                            nodeId: nodeId,
                            stepIndex: step.temp
                        }
                        passes.push(blitPass)

                        // Ensure blit program exists
                        if (!programs['blit']) {
                            programs['blit'] = {
                                fragment: `#version 300 es
                                    precision highp float;
                                    in vec2 v_texCoord;
                                    uniform sampler2D src;
                                    out vec4 fragColor;
                                    void main() {
                                        fragColor = texture(src, v_texCoord);
                                    }`,
                                wgsl: `
                                    struct FragmentInput {
                                        @builtin(position) position: vec4<f32>,
                                        @location(0) uv: vec2<f32>,
                                    }

                                    @group(0) @binding(0) var src: texture_2d<f32>;
                                    @group(0) @binding(1) var srcSampler: sampler;

                                    @fragment
                                    fn main(in: FragmentInput) -> @location(0) vec4<f32> {
                                        // Flip Y to match WebGPU texture coordinate convention
                                        let uv = vec2<f32>(in.uv.x, 1.0 - in.uv.y);
                                        return textureSample(src, srcSampler, uv);
                                    }
                                `,
                                fragmentEntryPoint: 'main'
                            }
                        }
                    }
                }

                // Blit geometry buffer to target global surface (skip if "none")
                if (geo && geo.name !== 'none' && currentInputGeo) {
                    const targetGeo = `global_${geo.name}`

                    // Only add blit if the current input is not already the target
                    if (currentInputGeo !== targetGeo) {
                        const geoBlitPass = {
                            id: `${nodeId}_write3d_geo_blit`,
                            program: 'blit',
                            type: 'render',
                            inputs: { src: currentInputGeo },
                            outputs: { color: targetGeo },
                            uniforms: {},
                            nodeId: nodeId,
                            stepIndex: step.temp
                        }
                        passes.push(geoBlitPass)
                    }
                }

                // Pass through: the outputs of write3d() are the same textures that were written
                textureMap.set(`${nodeId}_out`, currentInput)
                textureMap.set(`${nodeId}_out3d`, currentInput3d)
                textureMap.set(`${nodeId}_outGeo`, currentInputGeo)
                // currentInput3d and currentInputGeo stay the same - we pass through
                continue
            }

            // Clear lastInlineWriteTarget if we process any non-write step
            // (since the chain continued after the write, we need the final blit)
            lastInlineWriteTarget = null

            // Handle _skip flag - skip this effect in the pipeline
            // When an effect is skipped, we pass through the current input unchanged
            // The step still gets a nodeId for tracking, but no passes are generated
            if (step.args?._skip === true) {
                // Register a passthrough so downstream steps can find the input
                const nodeId = `node_${step.temp}`
                if (currentInput) {
                    textureMap.set(`${nodeId}_out`, currentInput)
                }
                if (currentInput3d) {
                    textureMap.set(`${nodeId}_out3d`, currentInput3d)
                }
                if (currentInputGeo) {
                    textureMap.set(`${nodeId}_outGeo`, currentInputGeo)
                }
                continue
            }

            const effectName = step.op
            const effectDef = getEffect(effectName)

            if (!effectDef) {
                errors.push({ message: `Effect '${effectName}' not found`, step })
                continue
            }

            // Generate a unique ID for this effect instance
            const nodeId = `node_${step.temp}`

            // Collect programs - check for per-step shader overrides first
            // Overrides are keyed by step.temp (the unique step index)
            const stepOverrides = shaderOverrides[step.temp]
            const shadersSource = stepOverrides || effectDef.shaders

            if (shadersSource) {
                for (const [progName, shaders] of Object.entries(shadersSource)) {
                    // Use nodeId prefix for ALL programs to prevent collisions between effects
                    // (e.g., both physarum and flow have an "agent" program with different outputs)
                    const uniqueProgName = `${nodeId}_${progName}`

                    if (!programs[uniqueProgName]) {
                        // Support both per-program layouts (uniformLayouts) and legacy single layout (uniformLayout)
                        // Per-program layouts take precedence
                        const programLayout = effectDef.uniformLayouts?.[progName] || effectDef.uniformLayout
                        programs[uniqueProgName] = {
                            ...shaders,
                            uniformLayout: programLayout
                        }
                    }
                }
            }

            // Helper to check if a texture name indicates a global/double-buffered texture
            // Textures starting with 'global' in effect definitions need ping-pong buffering
            const isGlobalTexture = (texName) => texName.startsWith('global')

            // Collect texture specs from effect definition
            // Textures starting with 'global_' (underscore) are SHARED and don't get node prefix
            // Textures starting with 'global' (camelCase) are per-node and get prefixed
            if (effectDef.textures) {
                for (const [texName, spec] of Object.entries(effectDef.textures)) {
                    let virtualTexId
                    if (texName.startsWith('global_')) {
                        // Shared global texture - use as-is, no node prefix
                        virtualTexId = texName
                    } else if (isGlobalTexture(texName)) {
                        // Per-node global texture - add node prefix for double-buffering
                        virtualTexId = `global_${nodeId}_${texName}`
                    } else {
                        virtualTexId = `${nodeId}_${texName}`
                    }
                    textureSpecs[virtualTexId] = { ...spec }
                }
            }

            // Collect 3D texture specs from effect definition
            // 3D textures are used for volumetric data and caching
            // Same naming convention: global_ prefix = shared, globalCamelCase = per-node
            if (effectDef.textures3d) {
                for (const [texName, spec] of Object.entries(effectDef.textures3d)) {
                    let virtualTexId
                    if (texName.startsWith('global_')) {
                        virtualTexId = texName
                    } else if (isGlobalTexture(texName)) {
                        virtualTexId = `global_${nodeId}_${texName}`
                    } else {
                        virtualTexId = `${nodeId}_${texName}`
                    }
                    textureSpecs[virtualTexId] = { ...spec, is3D: true }
                }
            }

            // Resolve inputs
            // If step.from is null, it's a generator (no input).
            // If step.from is a number, it refers to a previous temp output.
            if (step.from !== null) {
                // Find the output texture of the previous node
                const prevNodeId = `node_${step.from}`
                // The output of the previous node is usually its 'outputTex'
                // We need to track what the "main" output of a node is.
                // For now, assume 'outputTex' is the main output.
                currentInput = textureMap.get(`${prevNodeId}_out`)
            }

            // Process globals BEFORE passes loop to ensure downstream effects can use
            // uniforms like volumeSize that are set by upstream 3D generators.
            // Only set defaults if the uniform isn't already set from upstream.
            if (effectDef.globals) {
                for (const [globalName, def] of Object.entries(effectDef.globals)) {
                    if (def.uniform && def.default !== undefined) {
                        // Skip if already set from upstream (preserve pipeline inheritance)
                        if (pipelineUniforms[def.uniform] !== undefined) {
                            continue
                        }
                        let val = def.default
                        if (def.type === 'member' && typeof val === 'string') {
                            const resolved = resolveEnum(val)
                            if (resolved !== null) val = resolved
                        }
                        // Accumulate for downstream effects
                        pipelineUniforms[def.uniform] = val
                    }

                    // For surface-type globals with colorModeUniform, set colorMode based on default
                    // This handles the case where the surface param is not explicitly provided
                    if (def.type === 'surface' && def.colorModeUniform) {
                        // Only set if not already determined by step.args
                        if (!step.args || !Object.prototype.hasOwnProperty.call(step.args, globalName)) {
                            // Use default: 'none' means colorMode=0, anything else means colorMode=1
                            const isNone = def.default === 'none'
                            pipelineUniforms[def.colorModeUniform] = isNone ? 0 : 1
                        }
                    }
                }
            }

            // Also process step.args to capture user-specified parameter values
            // (e.g., noise3d(volumeSize: x32) should set volumeSize=32 in the pipeline)
            // Track uniforms controlled by colorModeUniform so we don't overwrite them
            const colorModeControlledUniforms = new Set()

            // FIRST PASS: Process surface args to populate colorModeControlledUniforms
            // This must happen before other args are processed to prevent colorMode from
            // being set to its default before we know if a surface is provided
            if (step.args) {
                for (const [argName, arg] of Object.entries(step.args)) {
                    const isObjectArg = arg !== null && typeof arg === 'object'

                    // Handle surface arguments that may resolve to 'none'
                    // If the global has a colorModeUniform, set it based on whether surface is 'none'
                    if (isObjectArg && (arg.kind === 'temp' || arg.kind === 'output' || arg.kind === 'source' || arg.kind === 'feedback' || arg.kind === 'xyz' || arg.kind === 'vel' || arg.kind === 'rgba')) {
                        // Check if this global has a colorModeUniform property
                        const globalDef = effectDef.globals?.[argName]
                        if (globalDef?.colorModeUniform) {
                            // Set colorMode: 0 if surface is 'none', 1 otherwise
                            const isNone = arg.name === 'none'
                            pipelineUniforms[globalDef.colorModeUniform] = isNone ? 0 : 1
                            colorModeControlledUniforms.add(globalDef.colorModeUniform)
                        }
                    }
                }
            }

            // SECOND PASS: Process non-surface args
            if (step.args) {
                for (const [argName, arg] of Object.entries(step.args)) {
                    const isObjectArg = arg !== null && typeof arg === 'object'

                    // Skip surface arguments (already processed in first pass)
                    if (isObjectArg && (arg.kind === 'temp' || arg.kind === 'output' || arg.kind === 'source' || arg.kind === 'feedback' || arg.kind === 'xyz' || arg.kind === 'vel' || arg.kind === 'rgba')) {
                        continue
                    }

                    // Resolve uniform name from globals
                    let uniformName = argName
                    if (effectDef.globals && effectDef.globals[argName] && effectDef.globals[argName].uniform) {
                        uniformName = effectDef.globals[argName].uniform
                    }

                    // Skip if this uniform is controlled by a surface's colorModeUniform
                    if (colorModeControlledUniforms.has(uniformName)) {
                        continue
                    }

                    // If this effect has a 3D input from upstream, inherit volumeSize
                    // rather than using the local arg value
                    if (uniformName === 'volumeSize' && currentInput3d && pipelineUniforms['volumeSize'] !== undefined) {
                        continue
                    }

                    // Extract value
                    let resolvedValue
                    if (isObjectArg && arg.value !== undefined) {
                        resolvedValue = arg.value
                    } else {
                        resolvedValue = arg
                    }
                    pipelineUniforms[uniformName] = resolvedValue
                }
            }

            // Expand passes
            const effectPasses = effectDef.passes || []
            for (let i = 0; i < effectPasses.length; i++) {
                const passDef = effectPasses[i]
                const passId = `${nodeId}_pass_${i}`

                // Use nodeId prefix for program name to match program collection above
                const programName = `${nodeId}_${passDef.program}`

                const pass = {
                    id: passId,
                    program: programName,
                    entryPoint: passDef.entryPoint,  // For multi-entry-point compute shaders
                    drawMode: passDef.drawMode,
                    drawBuffers: passDef.drawBuffers,  // For MRT (Multiple Render Targets)
                    count: passDef.count,
                    repeat: passDef.repeat,  // Number of iterations per frame
                    blend: passDef.blend,
                    workgroups: passDef.workgroups,
                    storageBuffers: passDef.storageBuffers,
                    storageTextures: passDef.storageTextures,
                    inputs: {},
                    outputs: {},
                    uniforms: {}
                }

                // Attach metadata so downstream consumers can map passes back to their effect definitions
                pass.effectKey = effectName
                pass.effectFunc = effectDef.func || effectName
                pass.effectNamespace = effectDef.namespace || null
                pass.nodeId = nodeId
                pass.stepIndex = step.temp  // Track which step this pass belongs to

                // Start with pipeline uniforms inherited from upstream effects
                // This allows downstream effects to use uniforms like volumeSize without redeclaring them
                pass.uniforms = { ...pipelineUniforms }

                // Initialize uniforms with defaults only if not already set from upstream
                // This preserves pipeline inheritance (e.g., volumeSize from noise3d to ca3d)
                if (effectDef.globals) {
                    for (const def of Object.values(effectDef.globals)) {
                        if (def.uniform && def.default !== undefined) {
                            // Skip if already set from upstream (preserve pipeline inheritance)
                            if (pass.uniforms[def.uniform] !== undefined) {
                                continue
                            }
                            let val = def.default
                            if (def.type === 'member' && typeof val === 'string') {
                                const resolved = resolveEnum(val)
                                if (resolved !== null) val = resolved
                            }
                            pass.uniforms[def.uniform] = val
                            // Accumulate for downstream effects
                            pipelineUniforms[def.uniform] = val
                        }
                    }
                }

                // Map Uniforms
                if (step.args) {
                    for (const [argName, arg] of Object.entries(step.args)) {
                        const isObjectArg = arg !== null && typeof arg === 'object'

                        // Skip texture arguments (handled in inputs)
                        if (isObjectArg && (arg.kind === 'temp' || arg.kind === 'output' || arg.kind === 'source' || arg.kind === 'feedback' || arg.kind === 'xyz' || arg.kind === 'vel' || arg.kind === 'rgba')) {
                            continue
                        }

                        // Resolve uniform name from globals
                        let uniformName = argName
                        if (effectDef.globals && effectDef.globals[argName] && effectDef.globals[argName].uniform) {
                            uniformName = effectDef.globals[argName].uniform
                        }

                        // Skip colorMode uniforms that are controlled by a surface's colorModeUniform
                        // These are set earlier based on whether the surface resolves to 'none'
                        if (effectDef.globals) {
                            let isControlled = false
                            for (const globalDef of Object.values(effectDef.globals)) {
                                if (globalDef.colorModeUniform === uniformName) {
                                    isControlled = true
                                    break
                                }
                            }
                            if (isControlled) {
                                continue
                            }
                        }

                        // If this effect has a 3D input from upstream, inherit volumeSize
                        // rather than using the local arg value
                        if (uniformName === 'volumeSize' && currentInput3d && pipelineUniforms['volumeSize'] !== undefined) {
                            continue
                        }

                        // Extract value
                        let resolvedValue
                        if (isObjectArg && arg.value !== undefined) {
                            resolvedValue = arg.value
                        } else {
                            resolvedValue = arg
                        }
                        pass.uniforms[uniformName] = resolvedValue
                        // Accumulate for downstream effects
                        pipelineUniforms[uniformName] = resolvedValue
                    }
                }

                // Map pass-level uniforms from effect definition
                // Pattern: uniforms: { uniformName: "globalParamName" }
                // This ensures specific passes get the uniforms they need from globals
                if (passDef.uniforms) {
                    for (const [uniformName, globalRef] of Object.entries(passDef.uniforms)) {
                        // globalRef is the name of the global parameter
                        // Look up the value from pipelineUniforms (includes defaults and DSL args)
                        if (pipelineUniforms[uniformName] !== undefined) {
                            pass.uniforms[uniformName] = pipelineUniforms[uniformName]
                        } else if (effectDef.globals && effectDef.globals[globalRef]) {
                            // Try looking up by the global param name and use its default
                            const globalDef = effectDef.globals[globalRef]
                            if (globalDef.default !== undefined) {
                                let val = globalDef.default
                                if (globalDef.type === 'member' && typeof val === 'string') {
                                    const resolved = resolveEnum(val)
                                    if (resolved !== null) val = resolved
                                }
                                pass.uniforms[uniformName] = val
                            }
                        }
                    }
                }

                // Map Inputs
                if (passDef.inputs) {
                    for (const [uniformName, texRef] of Object.entries(passDef.inputs)) {
                        // Handle standard and legacy pipeline inputs (2D)
                        const isPipelineInput =
                            texRef === 'inputTex' ||
                            (texRef.startsWith('o') && !isNaN(parseInt(texRef.slice(1))))

                        // Handle 3D pipeline input
                        const isPipelineInput3d = texRef === 'inputTex3d'

                        // Handle geometry buffer pipeline input
                        const isPipelineInputGeo = texRef === 'inputGeo'

                        // Handle agent state pipeline inputs
                        const isPipelineInputXyz = texRef === 'inputXyz'
                        const isPipelineInputVel = texRef === 'inputVel'
                        const isPipelineInputRgba = texRef === 'inputRgba'

                        if (isPipelineInput) {
                            pass.inputs[uniformName] = currentInput || texRef
                        } else if (isPipelineInput3d) {
                            // 3D pipeline input - look for 3D output from previous node
                            pass.inputs[uniformName] = currentInput3d || texRef
                        } else if (isPipelineInputGeo) {
                            // Geometry buffer pipeline input - look for geo output from previous node
                            pass.inputs[uniformName] = currentInputGeo || texRef
                        } else if (isPipelineInputXyz) {
                            // Agent position pipeline input
                            pass.inputs[uniformName] = currentInputXyz || texRef
                        } else if (isPipelineInputVel) {
                            // Agent velocity pipeline input
                            pass.inputs[uniformName] = currentInputVel || texRef
                        } else if (isPipelineInputRgba) {
                            // Agent color pipeline input
                            pass.inputs[uniformName] = currentInputRgba || texRef
                        } else if (texRef === 'noise') {
                            pass.inputs[uniformName] = 'global_noise'
                        } else if (texRef === 'feedback' || texRef === 'selfTex') {
                            // Handle feedback texture (selfTex is an alias for feedback)
                            // Read from the surface we're writing to for this chain
                            if (plan.write) {
                                const outName = typeof plan.write === 'object' ? plan.write.name : plan.write
                                const outKind = plan.write.kind || 'output'
                                const prefix = outKind === 'feedback' ? 'feedback' : 'global'
                                pass.inputs[uniformName] = `${prefix}_${outName}`
                            } else {
                                // No explicit write target
                                pass.inputs[uniformName] = currentInput || 'global_inputTex'
                            }
                        } else if (effectDef.externalTexture && texRef === effectDef.externalTexture) {
                            // External texture input (e.g., camera/video) - use per-step texture ID
                            // Each media effect instance gets its own texture (imageTex_step_0, imageTex_step_1, etc.)
                            // The texture will be created/updated via updateTextureFromSource()
                            pass.inputs[uniformName] = `${texRef}_step_${step.temp}`
                        } else if (step.args && Object.prototype.hasOwnProperty.call(step.args, texRef)) {
                            // Reference to an argument (e.g. blend(tex: ...))
                            const arg = step.args[texRef]

                            // Null/undefined arguments indicate intentionally unbound inputs
                            if (arg == null) {
                                continue
                            }

                            if (arg.kind === 'temp') {
                                pass.inputs[uniformName] = textureMap.get(`node_${arg.index}_out`)
                            } else if (arg.kind === 'output') {
                                // "none" binds to blank/default texture
                                if (arg.name === 'none') {
                                    pass.inputs[uniformName] = 'none'
                                } else {
                                    pass.inputs[uniformName] = `global_${arg.name}` // e.g. global_o0
                                }
                            } else if (arg.kind === 'source') {
                                // "none" binds to blank/default texture
                                if (arg.name === 'none') {
                                    pass.inputs[uniformName] = 'none'
                                } else {
                                    pass.inputs[uniformName] = `global_${arg.name}` // e.g. global_o0
                                }
                            } else if (arg.kind === 'vol') {
                                // "none" binds to blank/default texture
                                if (arg.name === 'none') {
                                    pass.inputs[uniformName] = 'none'
                                } else {
                                    pass.inputs[uniformName] = `global_${arg.name}` // e.g. global_vol0
                                }
                            } else if (arg.kind === 'geo') {
                                // "none" binds to blank/default texture
                                if (arg.name === 'none') {
                                    pass.inputs[uniformName] = 'none'
                                } else {
                                    pass.inputs[uniformName] = `global_${arg.name}` // e.g. global_geo0
                                }
                            } else if (arg.kind === 'xyz') {
                                // Agent position surfaces (xyz0-xyz7)
                                if (arg.name === 'none') {
                                    pass.inputs[uniformName] = 'none'
                                } else {
                                    pass.inputs[uniformName] = `global_${arg.name}` // e.g. global_xyz0
                                }
                            } else if (arg.kind === 'vel') {
                                // Agent velocity surfaces (vel0-vel7)
                                if (arg.name === 'none') {
                                    pass.inputs[uniformName] = 'none'
                                } else {
                                    pass.inputs[uniformName] = `global_${arg.name}` // e.g. global_vel0
                                }
                            } else if (arg.kind === 'rgba') {
                                // Agent color surfaces (rgba0-rgba7)
                                if (arg.name === 'none') {
                                    pass.inputs[uniformName] = 'none'
                                } else {
                                    pass.inputs[uniformName] = `global_${arg.name}` // e.g. global_rgba0
                                }
                            } else if (typeof arg === 'string') {
                                // "none" binds to blank/default texture
                                if (arg === 'none') {
                                    pass.inputs[uniformName] = 'none'
                                } else if (arg.startsWith('global_')) {
                                    pass.inputs[uniformName] = arg
                                } else if (/^o[0-7]$/.test(arg)) {
                                    pass.inputs[uniformName] = `global_${arg}`
                                } else if (/^vol[0-7]$/.test(arg)) {
                                    pass.inputs[uniformName] = `global_${arg}`
                                } else if (/^geo[0-7]$/.test(arg)) {
                                    pass.inputs[uniformName] = `global_${arg}`
                                } else if (/^xyz[0-7]$/.test(arg)) {
                                    pass.inputs[uniformName] = `global_${arg}`
                                } else if (/^vel[0-7]$/.test(arg)) {
                                    pass.inputs[uniformName] = `global_${arg}`
                                } else if (/^rgba[0-7]$/.test(arg)) {
                                    pass.inputs[uniformName] = `global_${arg}`
                                } else {
                                    pass.inputs[uniformName] = arg
                                }
                            }
                        } else if (effectDef.globals && effectDef.globals[texRef] && effectDef.globals[texRef].default !== undefined) {
                            // Parameter with default value - resolve the default
                            const defaultVal = effectDef.globals[texRef].default
                            // "none" binds to blank/default texture
                            if (defaultVal === 'none') {
                                pass.inputs[uniformName] = 'none'
                            } else if (defaultVal === 'inputTex' || defaultVal === 'inputColor') {
                                pass.inputs[uniformName] = currentInput || defaultVal
                            } else if (/^o[0-7]$/.test(defaultVal)) {
                                pass.inputs[uniformName] = `global_${defaultVal}`
                            } else if (/^vol[0-7]$/.test(defaultVal)) {
                                pass.inputs[uniformName] = `global_${defaultVal}`
                            } else if (/^geo[0-7]$/.test(defaultVal)) {
                                pass.inputs[uniformName] = `global_${defaultVal}`
                            } else if (/^xyz[0-7]$/.test(defaultVal)) {
                                pass.inputs[uniformName] = `global_${defaultVal}`
                            } else if (/^vel[0-7]$/.test(defaultVal)) {
                                pass.inputs[uniformName] = `global_${defaultVal}`
                            } else if (/^rgba[0-7]$/.test(defaultVal)) {
                                pass.inputs[uniformName] = `global_${defaultVal}`
                            } else if (defaultVal.startsWith('global_')) {
                                pass.inputs[uniformName] = defaultVal
                            } else {
                                pass.inputs[uniformName] = defaultVal
                            }
                        } else if (texRef.startsWith('global_')) {
                            // Explicit global reference
                            pass.inputs[uniformName] = texRef
                        } else if (isGlobalTexture(texRef)) {
                            // Effect texture starting with 'global' - use global_ prefix for double-buffering
                            pass.inputs[uniformName] = `global_${nodeId}_${texRef}`
                        } else if (texRef === 'outputTex') {
                            // Reference to this node's main output (e.g., in feedback passes)
                            pass.inputs[uniformName] = `${nodeId}_out`
                        } else {
                            // Internal texture or explicit reference
                            pass.inputs[uniformName] = `${nodeId}_${texRef}`
                        }
                    }
                }

                // Map Outputs
                if (passDef.outputs) {
                    for (const [attachment, texRef] of Object.entries(passDef.outputs)) {
                        let virtualTex
                        if (texRef === 'outputTex') {
                            // This is the main 2D output of this node
                            // OPTIMIZATION: If this is the last step and last pass, write directly to global output
                            const isLastStep = step === plan.chain[plan.chain.length - 1]
                            const isLastPass = i === effectPasses.length - 1

                            if (isLastStep && isLastPass && plan.write) {
                                const outName = typeof plan.write === 'object' ? plan.write.name : plan.write
                                const outKind = plan.write.kind || 'output'
                                const prefix = outKind === 'feedback' ? 'feedback' : 'global'
                                virtualTex = `${prefix}_${outName}`

                                // Track this as the last written surface (for render surface determination)
                                lastWrittenSurface = outName
                            } else {
                                virtualTex = `${nodeId}_out`
                            }
                            textureMap.set(virtualTex, virtualTex) // Register
                            textureMap.set(`${nodeId}_out`, virtualTex) // Also register as node output
                        } else if (texRef === 'outputTex3d') {
                            // This is the main 3D output of this node (for volumetric effects)
                            virtualTex = `${nodeId}_out3d`
                            textureMap.set(`${nodeId}_out3d`, virtualTex) // Register 3D output
                        } else if (texRef === 'outputXyz') {
                            // Agent position output for this node
                            virtualTex = `${nodeId}_outXyz`
                            textureMap.set(`${nodeId}_outXyz`, virtualTex)
                        } else if (texRef === 'outputVel') {
                            // Agent velocity output for this node
                            virtualTex = `${nodeId}_outVel`
                            textureMap.set(`${nodeId}_outVel`, virtualTex)
                        } else if (texRef === 'outputRgba') {
                            // Agent color output for this node
                            virtualTex = `${nodeId}_outRgba`
                            textureMap.set(`${nodeId}_outRgba`, virtualTex)
                        } else if (texRef === 'inputTex3d') {
                            // Pipeline reference - write back to the 3D texture we received
                            virtualTex = currentInput3d || `${nodeId}_inputTex3d`
                        } else if (texRef === 'inputGeo') {
                            // Pipeline reference - write back to the geo texture we received
                            virtualTex = currentInputGeo || `${nodeId}_inputGeo`
                        } else if (texRef === 'inputXyz') {
                            // Pipeline reference - write back to the agent position texture we received
                            virtualTex = currentInputXyz || `${nodeId}_inputXyz`
                        } else if (texRef === 'inputVel') {
                            // Pipeline reference - write back to the agent velocity texture we received
                            virtualTex = currentInputVel || `${nodeId}_inputVel`
                        } else if (texRef === 'inputRgba') {
                            // Pipeline reference - write back to the agent color texture we received
                            virtualTex = currentInputRgba || `${nodeId}_inputRgba`
                        } else if (texRef.startsWith('global_')) {
                            virtualTex = texRef
                        } else if (texRef.startsWith('feedback_')) {
                            virtualTex = texRef
                        } else if (isGlobalTexture(texRef)) {
                            // Effect texture starting with 'global' - use global_ prefix for double-buffering
                            virtualTex = `global_${nodeId}_${texRef}`
                        } else {
                            virtualTex = `${nodeId}_${texRef}`
                        }
                        pass.outputs[attachment] = virtualTex
                    }
                }

                passes.push(pass)
            }

            // Update currentInput for the next step in the chain
            currentInput = textureMap.get(`${nodeId}_out`)

            // Check if the effect definition declares an explicit outputTex property.
            // This allows effects to pass through the 2D chain without producing new output.
            // Same pattern as outputTex3d: "inputTex3d" for 3D passthrough.
            if (effectDef.outputTex && !currentInput) {
                const internalTexName = effectDef.outputTex
                // If outputTex is "inputTex", pass through the 2D texture from previous node
                if (internalTexName === 'inputTex') {
                    // currentInput from step.from already points to the input texture
                    // Restore it from the previous node's output
                    if (step.from !== null) {
                        const prevNodeId = `node_${step.from}`
                        const prevOutput = textureMap.get(`${prevNodeId}_out`)
                        if (prevOutput) {
                            textureMap.set(`${nodeId}_out`, prevOutput)
                            currentInput = prevOutput
                        }
                    }
                } else {
                    // Map an internal texture to the 2D pipeline
                    const isGlobalTex = internalTexName.startsWith('global')
                    const virtualTexId = isGlobalTex
                        ? `global_${nodeId}_${internalTexName}`
                        : `${nodeId}_${internalTexName}`
                    textureMap.set(`${nodeId}_out`, virtualTexId)
                    currentInput = virtualTexId
                }
            }

            // Update currentInput3d if this node produced a 3D output
            const out3d = textureMap.get(`${nodeId}_out3d`)
            if (out3d) {
                currentInput3d = out3d
            }
            // Update agent state pipeline textures if this node produced them
            const outXyz = textureMap.get(`${nodeId}_outXyz`)
            if (outXyz) {
                currentInputXyz = outXyz
            }
            const outVel = textureMap.get(`${nodeId}_outVel`)
            if (outVel) {
                currentInputVel = outVel
            }
            const outRgba = textureMap.get(`${nodeId}_outRgba`)
            if (outRgba) {
                currentInputRgba = outRgba
            }

            // Check if the effect definition declares an explicit outputTex3d property.
            // This allows effects to expose an internal texture (like a volume cache) as
            // the 3D output without requiring a separate render pass.
            if (effectDef.outputTex3d && !out3d) {
                const internalTexName = effectDef.outputTex3d
                // If outputTex3d is "inputTex3d", it means this effect passes through the input 3D texture
                // (possibly after modifying it in-place). Don't create a new texture name.
                if (internalTexName === 'inputTex3d') {
                    // currentInput3d already points to the 3D texture from the previous node
                    // Just ensure downstream effects can find it
                    if (currentInput3d) {
                        textureMap.set(`${nodeId}_out3d`, currentInput3d)
                    }
                } else {
                    // Map the internal texture to the 3D pipeline
                    // Use same naming convention as texture spec registration (line 145-148):
                    // Textures starting with 'global' use the global_ prefix for double-buffering
                    const isGlobalTex = internalTexName.startsWith('global')
                    const virtualTexId = isGlobalTex
                        ? `global_${nodeId}_${internalTexName}`  // Match texture spec registration
                        : `${nodeId}_${internalTexName}`
                    textureMap.set(`${nodeId}_out3d`, virtualTexId)
                    currentInput3d = virtualTexId
                }
            }

            // Check if the effect definition declares an explicit outputGeo property.
            // This allows effects to expose a geometry buffer (normals + depth) as
            // a pipeline output for downstream post-processing effects.
            if (effectDef.outputGeo) {
                const geoTexName = effectDef.outputGeo
                // If outputGeo is "inputGeo", it means this effect passes through the input geo texture
                if (geoTexName === 'inputGeo') {
                    if (currentInputGeo) {
                        textureMap.set(`${nodeId}_outGeo`, currentInputGeo)
                    }
                } else {
                    const virtualGeoId = `${nodeId}_${geoTexName}`
                    textureMap.set(`${nodeId}_outGeo`, virtualGeoId)
                    currentInputGeo = virtualGeoId
                }
            }

            // Check if the effect definition declares explicit agent state output properties.
            // This allows effects to expose internal textures as agent state outputs.
            if (effectDef.outputXyz && !outXyz) {
                const texName = effectDef.outputXyz
                if (texName === 'inputXyz') {
                    if (currentInputXyz) {
                        textureMap.set(`${nodeId}_outXyz`, currentInputXyz)
                    }
                } else {
                    const isGlobalTex = texName.startsWith('global')
                    const virtualId = isGlobalTex ? `global_${nodeId}_${texName}` : `${nodeId}_${texName}`
                    textureMap.set(`${nodeId}_outXyz`, virtualId)
                    currentInputXyz = virtualId
                }
            }
            if (effectDef.outputVel && !outVel) {
                const texName = effectDef.outputVel
                if (texName === 'inputVel') {
                    if (currentInputVel) {
                        textureMap.set(`${nodeId}_outVel`, currentInputVel)
                    }
                } else {
                    const isGlobalTex = texName.startsWith('global')
                    const virtualId = isGlobalTex ? `global_${nodeId}_${texName}` : `${nodeId}_${texName}`
                    textureMap.set(`${nodeId}_outVel`, virtualId)
                    currentInputVel = virtualId
                }
            }
            if (effectDef.outputRgba && !outRgba) {
                const texName = effectDef.outputRgba
                if (texName === 'inputRgba') {
                    if (currentInputRgba) {
                        textureMap.set(`${nodeId}_outRgba`, currentInputRgba)
                    }
                } else {
                    const isGlobalTex = texName.startsWith('global')
                    const virtualId = isGlobalTex ? `global_${nodeId}_${texName}` : `${nodeId}_${texName}`
                    textureMap.set(`${nodeId}_outRgba`, virtualId)
                    currentInputRgba = virtualId
                }
            }
        }

        // Handle the final output of the chain (.write(o0))
        if (plan.write && currentInput) {
            const outName = typeof plan.write === 'object' ? plan.write.name : plan.write

            // Track the last written surface
            lastWrittenSurface = outName

            // Skip the final blit if the last step was an inline write to the same surface
            // This avoids redundant blits when write() is at the end of the chain
            const alreadyWritten = lastInlineWriteTarget &&
                lastInlineWriteTarget.kind === 'output' &&
                lastInlineWriteTarget.name === outName
            if (alreadyWritten) {
                continue
            }

            const targetSurface = `global_${outName}`

            // Only add blit if the current input is not already the target surface
            if (currentInput !== targetSurface) {
                const blitPass = {
                    id: `final_blit_${outName}`,
                    program: 'blit',
                    type: 'render',
                    inputs: { src: currentInput },
                    outputs: { color: targetSurface },
                    uniforms: {}
                }
                passes.push(blitPass)
            }
        }
    }

    // Determine the render surface:
    // 1. Explicit render() directive takes precedence
    // 2. Fall back to the last surface written to in the program
    // 3. Error if no surface was written
    let renderSurface
    if (compilationResult.render) {
        renderSurface = compilationResult.render
    } else if (lastWrittenSurface) {
        renderSurface = lastWrittenSurface
    } else {
        errors.push({ message: 'No render surface specified and no write() found - add render(oN) or write(oN)' })
        renderSurface = null
    }

    return { passes, errors, programs, textureSpecs, renderSurface }
}
