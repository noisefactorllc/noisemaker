.. _shader-pipeline:

Pipeline Spec
=============

This document outlines the specification for the Noisemaker Rendering Pipeline and effect definition format. It is designed to support complex, multi-pass effects defined declaratively, executed on a unified GPU pipeline supporting either WebGL 2 or WebGPU backends.

1. Core Philosophy
------------------


#. **Declarative Effects:** Effects are defined as data (JSON graphs), not imperative code.
#. **Graph-Based Execution:** The pipeline treats the entire frame as a Directed Acyclic Graph (DAG) of passes.
#. **Multi-Pass By Design:** Effect definitions expand into explicit multi-pass schedules; layering and feedback are first-class.
#. **Backend Agnostic:** The definition format is abstract; the runtime handles the specifics of WebGL 2 vs. WebGPU.
#. **GPU-Resident Pipeline:** The entire render loop runs on the GPU with zero CPU copies; the CPU only orchestrates dispatch.
#. **Compute First:** First-class support for compute shaders (native in WebGPU, emulated via GPGPU in WebGL 2).

----

2. Pipeline Architecture
------------------------

The pipeline consists of three main phases:

Phase 1: Graph Compilation (Logical Graph & Render Graph)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Occurs when the DSL code changes. See :ref:`Compiler Specification <shader-compiler>` for the detailed specification of this phase.


#. **Parse DSL:** Generate AST.
#. **Analyze:** Generate Logical Graph (Effect Chain).
#. **Expand Effects:** Replace high-level nodes with their constituent passes defined in the JSON schema (Render Graph).
#. **Scope State Textures:** Effects that maintain simulation state use ``global_*`` textures (e.g., ``global_rd_state``, ``global_ca_state``, ``global_accum``). During expansion, these are scoped per-chain (e.g., ``global_rd_state_chain_0``) so that multiple instances of the same stateful effect in separate chains get independent state. Particle textures (``global_xyz``, ``global_vel``, etc.) are further scoped per-pipeline to the node that creates them. Effects within the same chain share state, which is required for patterns like ``loopBegin``/``loopEnd`` that share ``global_accum``.
#. **Topological Sort:** Order the passes based on texture dependencies to ensure inputs are ready before they are read.
#. **Resource Analysis:** Determine the lifetime of each intermediate texture to enable memory pooling.

Phase 2: Resource Allocation (Execution Plan Assembly)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Occurs before execution (or when screen size changes).


#. **Texture Pool:** A shared pool of textures of various sizes/formats.
#. **Allocation:** Assign physical textures from the pool to the logical texture requirements of the graph.

   * *Optimization*: Reuse textures. If ``tex_B`` is only used by Node 3, and Node 3 writes to ``tex_C``, ``tex_B``'s physical texture can be released back to the pool after Node 3 executes (or reused for ``tex_C`` if dimensions match and no read/write conflict exists).

Phase 3: Execution (GPU Driver)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Occurs every frame.


#. **Update Globals:** Refresh runtime uniforms sourced from the implementation: ``time`` (seconds since start), ``deltaTime`` (frame-to-frame delta), ``frame`` (integer tick), ``resolution`` (``vec2`` pixels), and ``aspect`` (width ÷ height).
#. **Iterate Passes:** Walk the sorted list of passes in the Execution Plan.
#. **Dispatch:**

   * **WebGL 2:**

     * Activate the compiled ``WebGLProgram`` for the pass and resolve the target framebuffer (global surfaces map to the current write buffer).
     * Derive the viewport from the target texture dimensions (or the pass override) and bind it before issuing work.
     * Bind each declared input texture to successive texture units and upload merged uniforms from ``globalUniforms`` + pass uniforms via ``gl.uniform*``.
     * Configure blending if the pass requests it, then issue either ``gl.drawArrays(gl.TRIANGLES, 0, 3)`` for the default full-screen triangle or ``gl.drawArrays(gl.POINTS, ...)`` when ``drawMode == 'points'``.

   * **WebGPU:**

     * Create a command encoder at frame start, then for each pass resolve the output texture view (respecting double-buffer swaps).
     * Build a bind group that packs sampled textures, the default sampler, and a freshly uploaded uniform buffer containing ``globalUniforms`` merged with pass uniforms.
     * Render passes begin a render pass that clears the target, set the pipeline, bind group, and emit ``passEncoder.draw(3, 1, 0, 0)`` for the full-screen triangle.
     * Compute passes begin a compute pass, set the compute pipeline/bind group, and dispatch ``passEncoder.dispatchWorkgroups(...)`` using explicit ``workgroups`` or dimensions derived from the output texture.

----

3. Backend Specifics
--------------------

3.1 WebGL 2 Implementation
^^^^^^^^^^^^^^^^^^^^^^^^^^


* **Render Passes:** Standard ``drawArrays`` into Framebuffer Objects (FBOs).
* **Compute Passes:** Emulated via GPGPU.

  * **Vertex Shader:** Renders a full-screen quad.
  * **Fragment Shader:** Performs the "compute" logic per pixel.
  * **Output:** Writes to a texture via FBO.
  * *Limitation*: No shared memory or arbitrary scatter writes. Compute logic must be mapped to 1:1 pixel outputs where possible.

3.2 WebGPU Implementation
^^^^^^^^^^^^^^^^^^^^^^^^^


* **Render Passes:** Native ``RenderPipeline``.
* **Compute Passes:** Native ``ComputePipeline``.

  * Supports storage textures and buffers.
  * Supports arbitrary read/write (scatter/gather).

----

4. Constraints & Requirements
-----------------------------


#. **Vanilla JS:** No build steps or transpilers required for the runtime logic.
#. **Context Awareness:** The pipeline must detect ``gl`` vs ``gpu`` context and switch strategies transparently.
#. **Hot Reloading:** Changing the DSL or an Effect Definition must instantly rebuild the graph without reloading the page.
#. **Error Handling:** Missing textures or cyclic dependencies must be caught during the Graph Compilation phase.

5. Compute Shader Support (Unified Spec)
----------------------------------------

Compute passes are first-class. The ``type: "compute"`` pass specification MUST supply any non‑default dispatch shape. The runtime produces equivalent behavior on WebGL (emulation) and WebGPU (native).

5.1 WebGPU (Native)
^^^^^^^^^^^^^^^^^^^


* Each compute pass compiles into a ``GPUComputePipeline`` keyed by ``program`` + static ``defines``.
* Dispatch shape derives from ``workgroups: [x,y,z]`` (all integers ≥ 1). If omitted: ``[ceil(width/8), ceil(height/8), 1]`` for 2D textures.
* Bindings:

  * Sampled inputs (``inputs``) become ``@group(0)`` sampled textures or storage textures depending on usage declaration.
  * Uniform buffer pack consolidates scalars/vec/mat into a single std140 layout (see Section 10).
  * Storage outputs allowed if declared with texture spec ``usage`` containing ``storage``.

5.2 WebGL 2 (Emulated)
^^^^^^^^^^^^^^^^^^^^^^


* A full‑screen triangle/quad fragment shader substitutes invocation IDs. Emulation contract:

  * ``gl_FragCoord.xy`` maps to ``GlobalInvocationID.xy``.
  * Emulated local size fixed at 1; ``workgroups`` only influences virtual coordinate scaling.
  * Formula: ``GlobalInvocationID.xy = floor(gl_FragCoord.xy)``

* Scatter writes are **FORBIDDEN**; only 1:1 mapping output textures.

  * **Detection:** Static analysis of the shader source checks for ``imageStore`` or equivalent random-access write operations. If detected, ``ERR_COMPUTE_UNSUPPORTED_FEATURE`` is raised.

* Multiple outputs require MRT; if backend lacks format support, validation fails (``ERR_COMPUTE_MRT_UNSUPPORTED``).

  * **Detection:** If ``outputs`` has > 1 entry and the backend context does not support ``MAX_DRAW_BUFFERS >= N``, this error is raised during validation.

5.3 Cross‑Backend Restrictions
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


* Shared memory, subgroup ops, atomics: disallowed in spec until extended in a future version (``effect.version >= 2.x``).
* A compute pass MAY precede or follow render passes; ordering resolved by dependency edges (Section 9).
* Ping‑pong iteration semantics identical to render passes: after each iteration, textures listed in ``pingpong`` swap logical roles.

----

6. Validation Rules
--------------------

Validation occurs in deterministic phases; failing any phase aborts compilation with error codes.


#. **Structure:** JSON schema compliance (``ERR_SCHEMA``).
#. **Name Uniqueness:** No duplicate ``passes[].name`` (``ERR_DUP_PASS_NAME``).
#. **Texture References:** Every ``inputs`` / ``outputs`` value refers to either a declared texture or a global surface alias (``oN``) (``ERR_BAD_TEX_REF``).
#. **Ping-Pong Integrity:** ``pingpong`` pair MUST both exist in ``textures`` (``ERR_PINGPONG_UNDECL``).
#. **Iterations:** If ``iterations > 1`` and no ``pingpong``, pass MUST be purely functional (no reading from its own output) or error (``ERR_ITER_NO_PINGPONG``).
#. **Dependency Graph:** Cycles forbidden unless ALL edges cross a ``persistent`` texture flagged ``feedback`` (future extension) (``ERR_CYCLE``).
#. **Compute Limitations (WebGL):** Any compute pass requesting storage usage or scatter writes invalid (``ERR_COMPUTE_UNSUPPORTED_FEATURE``).
#. **Viewport Bounds:** Viewport must not exceed target texture size (``ERR_VIEWPORT_BOUNDS``).
#. **Workgroup Shape (WebGPU):** Product must not exceed device limits (``ERR_WORKGROUP_LIMIT``).
#. **Uniform Type Coercion:** Values must coerce without precision loss beyond IEEE 754 single for floats (``ERR_UNIFORM_COERCE``).

Error objects MUST include: ``{ code, message, pass?: name, texture?: name, detail?: any }``.

6.1 Shader Compilation Lifecycle
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

**Compilation Triggers:**


#. First use of a ``program`` name.
#. Change to shader source text (hot reload).
#. Change to static ``defines`` for same program.

**Cache Key:** ``hash(programName, backend, sortedDefines, version)``

**WebGL Pipeline Creation:**

.. code-block:: js

   function compileWebGLProgram(programName, defines, glslSource) {
     const vertexShader = compileShader(gl.VERTEX_SHADER, FULLSCREEN_QUAD_VERT)
     const fragmentShader = compileShader(gl.FRAGMENT_SHADER, injectDefines(glslSource, defines))
     const program = gl.createProgram()
     gl.attachShader(program, vertexShader)
     gl.attachShader(program, fragmentShader)
     gl.linkProgram(program)
     if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
       throw { code: 'ERR_SHADER_LINK', detail: gl.getProgramInfoLog(program) }
     }
     return { program, uniforms: extractUniforms(program), samplers: extractSamplers(program) }
   }

**WebGPU Pipeline Creation:**

.. code-block:: js

   async function compileWebGPUPipeline(programName, defines, wgslSource, pipelineType) {
     const module = device.createShaderModule({ code: injectDefines(wgslSource, defines) })
     const compilationInfo = await module.getCompilationInfo()
     if (compilationInfo.messages.some(m => m.type === 'error')) {
       throw { code: 'ERR_SHADER_COMPILE', detail: compilationInfo.messages }
     }

     if (pipelineType === 'render') {
       return device.createRenderPipeline({ /* layout derived from pass spec */ })
     } else {
       return device.createComputePipeline({ /* layout derived */ })
     }
   }

**Invalidation:** Changing shader source invalidates cache entry; next frame recompiles. During recompilation, previous version remains active (no visual glitch). Compilation errors block new graph but preserve old.

----

7. Resource Lifetime & Pooling Algorithm
-----------------------------------------


#. Scan passes sequentially assigning ``firstUse`` / ``lastUse`` per texture.

   * ``firstUse``: Index of the first pass that *writes* to the texture (or reads it, if it's an input-only texture like a uniform). For feedback loops, synthetic nodes set ``firstUse = 0``.
   * ``lastUse``: Index of the last pass that *reads* from the texture.
   * Persistent surfaces (``oN``) have ``firstUse = 0``, ``lastUse = Infinity``.

#. Group textures by ``(format,widthPx,heightPx,usageSignature)``.

   * **Fallback Format Algorithm:** If a requested format is unsupported, the runtime selects the "highest precision supported with same channel count".

     * Example candidates for ``rgba16f``: ``['rgba16f', 'rgba32f', 'rgba8']``.
     * Example candidates for ``r16f``: ``['r16f', 'r32f', 'r8']``.

#. Maintain a freelist per group; when allocating, search freelist for a texture whose ``releaseFrame <= currentFrameCompilationId``.
#. After a pass executes, if texture's index equals its ``lastUse`` and it is not a global surface or ``persistent``, mark it reusable.
#. Pool compaction runs every N compilations (``N=60`` default, configurable via ``config.poolCompactionInterval``) to delete unused physical textures.
   Deterministic allocation ensures identical graphs yield stable resource binding order for reproducibility.

7.1 Binding Slot Assignment
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

**WebGL Texture Units:**


* Slots 0..N assigned sequentially in pass input declaration order.
* Maximum validated against ``gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)`` (minimum 16 guaranteed).
* Exceed limit triggers ``ERR_TOO_MANY_TEXTURES``.

.. code-block:: js

   function bindWebGLTextures(pass, textureMap) {
     let unit = 0
     for (const [samplerName, textureName] of Object.entries(pass.inputs)) {
       if (unit >= maxTextureUnits) throw { code: 'ERR_TOO_MANY_TEXTURES', pass: pass.name }
       const texture = textureMap[textureName]
       gl.activeTexture(gl.TEXTURE0 + unit)
       gl.bindTexture(gl.TEXTURE_2D, texture.handle)
       gl.uniform1i(pass.uniformLocations[samplerName], unit)
       unit++
     }
   }

**WebGPU Bind Groups:**


* Group 0: Textures (sampled or storage) in declaration order.
* Group 1: Uniform buffer (single consolidated UBO).
* Group 2: Reserved for future storage buffers.

.. code-block:: js

   function createWebGPUBindGroup(pass, textureMap, uniformBuffer) {
     const entries = []
     let binding = 0

     for (const [samplerName, textureName] of Object.entries(pass.inputs)) {
       const texture = textureMap[textureName]
       entries.push({
         binding: binding++,
         resource: texture.usage.includes('storage') 
           ? texture.view // storage texture
           : texture.sampler // sampled texture
       })
     }

     return device.createBindGroup({
       layout: pass.pipeline.getBindGroupLayout(0),
       entries
     })
   }

7.2 Uniform Buffer Layout (std140)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

All uniforms packed into single buffer per pass. Alignment rules:


* ``float``, ``int``, ``uint``, ``bool``: 4-byte align, 4-byte stride.
* ``vec2``: 8-byte align, 8-byte stride.
* ``vec3``: 16-byte align, 12-byte data (pad to 16).
* ``vec4``: 16-byte align, 16-byte stride.
* ``mat3``: Array of 3 ``vec3`` (16-byte aligned each) = 48 bytes.
* ``mat4``: Array of 4 ``vec4`` = 64 bytes.

**Packing Strategy:**
The buffer is allocated with a fixed initial size (e.g., 256 bytes). If the required size exceeds the capacity, the buffer is reallocated to the next power of two that fits the data (e.g., 512, 1024).

.. code-block:: js

   function packUniforms(uniformSpecs, values) {
     // Calculate required size first
     let requiredSize = 0;
     // ... (calculation logic) ...

     // Reallocate if needed (power of two growth)
     if (requiredSize > currentBufferSize) {
         currentBufferSize = Math.pow(2, Math.ceil(Math.log2(requiredSize)));
         buffer = new ArrayBuffer(currentBufferSize);
     }

     const view = new DataView(buffer)
     let offset = 0

     for (const [name, spec] of Object.entries(uniformSpecs)) {
       const value = values[name] ?? spec.default
       switch (spec.type) {
         case 'float': view.setFloat32(offset, value, true); offset += 4; break
         case 'int': view.setInt32(offset, value, true); offset += 4; break
         case 'bool': view.setInt32(offset, value ? 1 : 0, true); offset += 4; break
         case 'vec2': 
           offset = alignTo(offset, 8)
           view.setFloat32(offset, value[0], true)
           view.setFloat32(offset + 4, value[1], true)
           offset += 8
           break
         case 'vec3':
           offset = alignTo(offset, 16)
           view.setFloat32(offset, value[0], true)
           view.setFloat32(offset + 4, value[1], true)
           view.setFloat32(offset + 8, value[2], true)
           offset += 16 // Padded
           break
         case 'vec4':
           offset = alignTo(offset, 16)
           for (let i = 0; i < 4; i++) view.setFloat32(offset + i * 4, value[i], true)
           offset += 16
           break
         case 'mat3':
           offset = alignTo(offset, 16)
           for (let col = 0; col < 3; col++) {
             for (let row = 0; row < 3; row++) {
               view.setFloat32(offset + row * 4, value[col * 3 + row], true)
             }
             offset += 16
           }
           break
         case 'mat4':
           offset = alignTo(offset, 16)
           for (let i = 0; i < 16; i++) {
             view.setFloat32(offset + i * 4, value[i], true)
           }
           offset += 64
           break
       }
     }

     return { buffer: buffer.slice(0, offset), size: offset }
   }

   function alignTo(offset, alignment) {
     return Math.ceil(offset / alignment) * alignment
   }

----

8. Surface Management & Frame Buffering
----------------------------------------

8.0 Surface Types
^^^^^^^^^^^^^^^^^

The pipeline provides several types of global surfaces:

**2D Surfaces** (``o0``..``o7``): Standard double-buffered surfaces where reading within a frame sees any writes made earlier in that same frame.

**3D Volume Surfaces** (``vol0``..``vol7``): Persistent 3D texture volumes for volumetric effects. Default size is 64×64×64.

**Geometry Buffers** (``geo0``..``geo7``): Screen-sized 2D textures storing precomputed raymarching results (xyz=surface normal, w=depth). These enable downstream post-processing without re-raymarching.

Global 2D surfaces (``o0``.. ``o7``) defined implicitly:

.. code-block:: js

   surfaceTable = {
     o0: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true },
     o1: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true },
     o2: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true },
     o3: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true },
     o4: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true },
     o5: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true },
     o6: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true },
     o7: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true }
   }

Global 3D volume surfaces (``vol0``.. ``vol7``) defined implicitly:

.. code-block:: js

   volumeTable = {
     vol0: { format: 'rgba16f', width: 64, height: 64, depth: 64, is3D: true },
     vol1: { format: 'rgba16f', width: 64, height: 64, depth: 64, is3D: true },
     // ... vol2 through vol7
   }

Global geometry buffers (``geo0``.. ``geo7``) defined implicitly:

.. code-block:: js

   geoBufferTable = {
     geo0: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true },
     geo1: { format: 'rgba16f', width: 'screen', height: 'screen', doubleBuffered: true },
     // ... geo2 through geo7
   }

**CRITICAL: User-Only Surfaces**

Surfaces ``o0``..``o7``, ``vol0``..``vol7``, and ``geo0``..``geo7`` are **reserved exclusively for user composition** and **MUST NOT** be hardwired within effect definitions. Effects requiring internal feedback or temporary storage must allocate their own internal surfaces (e.g., ``_feedbackBuffer``, ``_temp0``) in their ``textures`` property. Hardwiring these surfaces within an effect definition will corrupt the user's composition graph.

**Terminology:**


* ``doubleBuffered``: The surface has two physical textures (read/write) swapped every frame. This allows reading the previous frame's content while writing the current frame.
* ``persistent``: The surface's content is preserved across frames (and resizes). All global surfaces are effectively persistent. Internal textures can be marked ``persistent: true`` to enable feedback effects.

8.0.1 Global Surface Behavior
"""""""""""""""""""""""""""""

Frame index ``F`` selects read buffer = ``(F-1) mod 2``, write buffer = ``F mod 2``. A chain writing ``.write(o0)`` targets write buffer; chains reading ``o0`` before its write in frame use read buffer. After a write to ``oN``, subsequent reads in the same frame see the freshly written content. Validation forbids multiple writes to same surface in a frame unless explicitly marked ``compositeAllowed`` (future extension) (``ERR_SURFACE_MULTIWRITE``).

8.1 Resize Behavior
^^^^^^^^^^^^^^^^^^^^

When screen dimensions change:


#. **Detection:** Compare ``(currentWidth, currentHeight)`` to cached ``(lastWidth, lastHeight)`` before frame execution.
#. **Invalidation:** If changed, mark all ``dimension='screen'`` or ``dimension='%'`` textures for reallocation.
#. **Preserve Persistent:** Global surfaces (``oN``) preserve content if ``persistent=true`` via blit to temporary, resize, blit back.

   * **Fallback:** If the new format is incompatible with the old format (e.g., channel count change), the blit is skipped and the surface is cleared to transparent black.

#. **Rebuild Pool:** Recompute all texture dimensions; existing pool entries with mismatched sizes released.
#. **Recompile:** If any viewport or workgroup depends on texture size, recompute those values.

.. code-block:: js

   function handleResize(newWidth, newHeight, graph) {
     if (newWidth === graph.lastWidth && newHeight === graph.lastHeight) return

     const resizedTextures = []
     for (const [name, spec] of Object.entries(graph.textures)) {
       const oldW = spec.resolvedWidth
       const oldH = spec.resolvedHeight
       spec.resolvedWidth = resolveDimension(spec.width, 'w', { w: newWidth, h: newHeight })
       spec.resolvedHeight = resolveDimension(spec.height, 'h', { w: newWidth, h: newHeight })

       if (oldW !== spec.resolvedWidth || oldH !== spec.resolvedHeight) {
         resizedTextures.push({ name, spec, oldW, oldH })
       }
     }

     for (const { name, spec, oldW, oldH } of resizedTextures) {
       const oldTexture = graph.textureMap[name]
       if (spec.persistent && oldTexture) {
         const temp = createTexture(oldW, oldH, spec.format)
         blitTexture(oldTexture, temp)
         destroyTexture(oldTexture)
         const newTexture = createTexture(spec.resolvedWidth, spec.resolvedHeight, spec.format)
         blitTexture(temp, newTexture, { preserveAspect: false })
         destroyTexture(temp)
         graph.textureMap[name] = newTexture
       } else {
         if (oldTexture) destroyTexture(oldTexture)
         graph.textureMap[name] = createTexture(spec.resolvedWidth, spec.resolvedHeight, spec.format)
       }
     }

     graph.lastWidth = newWidth
     graph.lastHeight = newHeight
   }

----

9. Execution Order Determination
---------------------------------

Algorithm (Kahn):


#. Build nodes for each pass; edge from A->B if B reads a texture written by A and not yet overwritten.
#. For surfaces, if pass P reads ``oX`` and no pass writes ``oX`` earlier in frame, add edge from synthetic node ``SURFACE_PREV_oX`` to P.
#. Initialize queue with zero in-degree nodes; pop, append to execution list; decrement successors; continue.
#. If nodes remain with in-degree > 0 -> cycle error (``ERR_CYCLE``).

   * **Feedback Loops:** Cycles are strictly forbidden within a single frame's dependency graph. Feedback effects MUST use ``persistent`` textures or global surfaces to read data from the *previous* frame, which does not create a dependency cycle in the current frame.

#. Expand iteration passes by duplicating node logically N times during schedule emission while preserving resource indices.

**Dynamic Pass Skipping:**
Passes may define ``conditions`` (e.g., ``skipIf``). The runtime evaluates these conditions against the current uniform values *before* dispatching the pass. If the condition is met, the pass is skipped, and its output textures retain their previous content (or are cleared if not persistent). This is a runtime check and does not alter the compiled graph structure.

9.1 Pass Expansion (Iterations & Ping-Pong)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

For a pass with ``iterations > 1`` and optional ``pingpong``:

.. code-block:: js

   function expandPass(pass, textureMap) {
     const steps = []

     if (pass.iterations === 1) {
       steps.push({
         name: pass.name,
         // ...
       })
       return steps
     }

     // Multi-iteration
     if (!pass.pingpong || pass.pingpong.length !== 2) {
       throw { code: 'ERR_ITER_NO_PINGPONG', pass: pass.name }
     }

     const [texA, texB] = pass.pingpong

     for (let i = 0; i < pass.iterations; i++) {
       const isEven = i % 2 === 0
       const readTex = i === 0 ? pass.inputs : { [Object.keys(pass.inputs)[0]]: isEven ? texA : texB }
       const writeTex = isEven ? texB : texA

       // Deterministic Naming: passName#iteration
       steps.push({
         name: `${pass.name}#${i}`,
         inputs: readTex,
         outputs: { [Object.keys(pass.outputs)[0]]: writeTex },
         uniforms: { ...pass.uniforms, _iteration: i },
         program: pass.program
       })
     }

     return steps
   }

Final output of iterated pass is the last-written ping-pong texture. Subsequent passes reading the logical output name receive a remapped reference to the correct buffer.

----

10. Uniform & Binding Conventions
---------------------------------


* Naming: Shader side may use ``u_*``; adapter strips prefix for effect/global key mapping.
* Packing: All scalar/vec/mat uniforms grouped in a single buffer per pass; layout: std140 for WebGPU & WebGL aligning to 16‑byte boundaries.
* Boolean: Represented as ``int`` (0/1) in GLSL ES; WGSL uses native ``bool`` but numeric mirror provided for deterministic hashing.
* Matrices: Row-major in effect spec; adapter transposes if backend requires column-major.
* Enumeration: Always numeric ``int``.
* Samplers vs Storage: Storage only if texture ``usage`` includes ``storage`` and backend supports; fallback error otherwise.

10.1 Implicit Texture Creation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

``inputTex``: Canonical reference to the upstream chain output.


* Created automatically for non-generator effects.
* Dimensions and format inherited from previous pass output or default to screen-sized ``rgba16f``.
* If first pass in chain reads ``inputTex`` but no upstream exists, error ``ERR_NO_INPUT``.
* Legacy name ``inputColor`` is still recognized for backwards compatibility.

``outputColor``: Synthetic texture representing the effect's final output.


* Created automatically; dimensions match largest output texture or ``inputTex`` if no explicit textures.
* Format matches pass output format declaration or defaults to ``rgba16f``.
* Becomes the ``inputTex`` for the next chained effect.

.. code-block:: js

   function createImplicitTextures(effect, upstreamOutput) {
     const textures = { ...effect.textures }

     if (!effect.meta?.generator) {
       if (!upstreamOutput) throw { code: 'ERR_NO_INPUT', effect: effect.name }
       textures.inputTex = {
         handle: upstreamOutput.handle,
         width: upstreamOutput.width,
         height: upstreamOutput.height,
         format: upstreamOutput.format,
         synthetic: true
       }
     }

     // outputColor created after final pass executes; spec determined by output declaration
     const lastPass = effect.passes[effect.passes.length - 1]
     const outputTexName = lastPass.outputs.color || lastPass.outputs[Object.keys(lastPass.outputs)[0]]

     if (outputTexName === 'outputColor') {
       textures.outputColor = {
         width: textures.inputTex?.width || 'screen',
         height: textures.inputTex?.height || 'screen',
         format: 'rgba16f',
         synthetic: true
       }
     }

     return textures
   }

----

11. Error Codes (Summary)
-------------------------

.. list-table::
   :header-rows: 1

   * - Code
     - Meaning
   * - ERR_SCHEMA
     - Schema validation failed
   * - ERR_DUP_PASS_NAME
     - Duplicate pass name
   * - ERR_BAD_TEX_REF
     - Input/output references unknown texture/surface
   * - ERR_PINGPONG_UNDECL
     - Ping-pong texture undeclared
   * - ERR_ITER_NO_PINGPONG
     - Iterative pass missing pingpong or self-read unsafe
   * - ERR_CYCLE
     - Cyclic dependency detected
   * - ERR_COMPUTE_UNSUPPORTED_FEATURE
     - Compute feature not emulatable on WebGL
   * - ERR_VIEWPORT_BOUNDS
     - Viewport out of target bounds
   * - ERR_WORKGROUP_LIMIT
     - Workgroup size exceeds device limits
   * - ERR_UNIFORM_COERCE
     - Uniform value invalid/coercion failed
   * - ERR_SURFACE_MULTIWRITE
     - Multiple writes to same surface without extension
   * - ERR_COMPUTE_MRT_UNSUPPORTED
     - Multi-render-target compute emulation unsupported
   * - ERR_READBACK_FORBIDDEN
     - Attempted GPU-to-CPU readback within frame
   * - ERR_TOO_MANY_TEXTURES
     - Exceeded maximum texture units for backend
   * - ERR_DIMENSION_INVALID
     - Texture dimension spec invalid
   * - ERR_FORMAT_UNSUPPORTED
     - Texture format not supported by backend
   * - ERR_SHADER_COMPILE
     - Shader compilation failed
   * - ERR_SHADER_LINK
     - Shader program linking failed
   * - ERR_NO_INPUT
     - Non-generator effect missing input
   * - ERR_ENUM_INVALID
     - Unknown enum string provided
   * - ERR_CONDITION_SYNTAX
     - Invalid pass condition entry


Errors MUST be stable across versions for tooling.

----

12. Performance Requirements
----------------------------


* Graph compilation target < 5ms for 200 passes on mid-tier hardware (baseline reference; not enforced at runtime, used for regression).
* Texture reuse rate >= 70% for identical dimension/format groups over steady frame after warmup.
* No pass may trigger synchronous GPU readback; validation MUST block code paths attempting ``gl.readPixels`` or WebGPU mapAsync on resources derived from effect outputs within frame (``ERR_READBACK_FORBIDDEN``).
* Optional metrics emitter: ``{ compileTimeMs, passCount, textureAllocCount, poolHitRate }`` for diagnostics.

----

13. Versioning & Extensibility
------------------------------


* ``version`` field governs opt-in features; minor increments add backward-compatible fields, major increments may introduce reserved keywords.
* Reserved future fields: ``buffers``, ``feedback``, ``async``, ``subgraphs``.
* Tooling MUST ignore unknown top-level keys starting with ``_`` (private extensions).
* Versioning strategy: introducing v2 features requires explicit ``effect.version = "2.0.0"``.

----

14. Runtime Data Structures (Normative)
---------------------------------------

14.1 Compiled Graph
^^^^^^^^^^^^^^^^^^^

.. code-block:: typescript

   interface CompiledGraph {
     id: string                    // Hash of source effects + configuration
     version: string               // Effect version
     passes: CompiledPass[]        // Topologically sorted execution order
     textures: Map<string, GPUTexture>
     surfaces: Map<string, DoublBufferedSurface>
     uniformBuffers: Map<string, UniformBuffer>
     pipelines: Map<string, Pipeline>
     metrics: GraphMetrics
     lastWidth: number
     lastHeight: number
     compiledAt: number            // Timestamp
   }

   interface CompiledPass {
     id: string                    // Unique within graph (name + iteration index)
     effectName: string
     program: string
     type: 'render' | 'compute' | 'transfer'
     inputs: Map<string, TextureBinding>
     outputs: Map<string, TextureBinding>
     uniforms: Map<string, UniformValue>
     viewport?: { x: number, y: number, w: number, h: number }
     workgroups?: [number, number, number]
     pipeline: Pipeline            // Cached compiled pipeline
   }

   interface TextureBinding {
     name: string                  // Logical name
     physical: GPUTexture          // Actual GPU resource
     slot: number                  // Binding slot index
     sampler?: GPUSampler
   }

   interface DoublBufferedSurface {
     name: string
     buffers: [GPUTexture, GPUTexture]
     currentFrame: number
     format: string
     width: number
     height: number
   }

   interface GraphMetrics {
     compileTimeMs: number
     passCount: number
     textureAllocCount: number
     poolHitRate: number
     lastFrameTimeMs: number
   }

14.2 Effect Lifecycle State Machine
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block::

   STATES:
     UNLOADED → definition not yet parsed
     VALIDATING → schema validation in progress
     VALIDATED → passed validation, ready for compilation
     COMPILING → shader compilation in progress
     READY → executable, cached
     ERROR → validation or compilation failed
     STALE → source changed, needs recompilation

   TRANSITIONS:
     UNLOADED --[load]--> VALIDATING
     VALIDATING --[pass]--> VALIDATED --[compile]--> COMPILING --[success]--> READY
     VALIDATING --[fail]--> ERROR
     COMPILING --[fail]--> ERROR
     READY --[execute]--> READY
     READY --[sourceChange]--> STALE --[recompile]--> COMPILING
     ERROR --[fix]--> UNLOADED

14.3 Frame Execution State
^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: typescript

   interface FrameState {
     frameIndex: number
     graph: CompiledGraph
     globalUniforms: Map<string, any>  // time, mouse, resolution, etc.
     surfaces: Map<string, DoublBufferedSurface>
     activePass: number                // Current pass index (for debugging)
     errors: FrameError[]
   }

   interface FrameError {
     code: string
     pass?: string
     timestamp: number
     recovered: boolean                // True if execution continued
   }

----

15. Determinism Guarantees
--------------------------


* Hash of sorted pass list + resource allocation signature MUST remain stable given identical effect + screen size.
* Shaders compiled with identical ``program`` + ``defines`` produce identical pipeline keys.
* Ping-pong iteration ordering deterministic: iteration index appended to diagnostics path ``<passName>#<i>``.

----

16. State Transition Specification
----------------------------------

16.1 Hot Reload Protocol
^^^^^^^^^^^^^^^^^^^^^^^^

When shader source or effect definition changes:


#. **Detect Change:** File watch or manual reload triggers.
#. **Parse:** Parse new definition; if parse fails, retain old graph and emit diagnostic.
#. **Validate:** Run validation (Section 6); if fails, retain old graph.
#. **Compile Shaders:** Compile new programs; compilation is async (WebGPU) or sync (WebGL).
#. **Atomic Swap:** On next frame boundary, swap ``graph.current`` pointer to new compiled graph.
#. **Cleanup:** Release old pipelines and unused textures after 2-frame delay (ensure no in-flight commands).

**Frame Consistency:** A frame MUST execute entirely with one graph version; no mid-frame swaps.

16.2 Error Recovery
^^^^^^^^^^^^^^^^^^^

On runtime error during execution:


#. **Catch:** Wrap each pass dispatch in try-catch (JS) or error callback (GPU).
#. **Log:** Record error in ``FrameState.errors`` with pass context.
#. **Skip Pass:** Mark pass as failed; do not execute dependent passes this frame.
#. **Fallback Texture:** Substitute error texture (magenta checkerboard) for failed pass outputs.
#. **Continue:** Attempt remaining independent passes.
#. **Diagnostics:** Emit structured error event to console/UI with pass name, error code, and shader line if applicable.

Validation errors MUST prevent graph execution entirely. Runtime errors (GPU out of memory, device lost) allow partial frame with degraded output.

----

17. Glossary
-------------


* **AST (Abstract Syntax Tree):** The tree representation of the user's DSL code produced by the Parser.
* **Logical Graph (Effect Chain):** A high-level graph where nodes are Effect instances and edges represent data flow between Effects. Produced by the Semantic Analyzer.
* **Render Graph (Passes):** A lower-level graph where Effects have been expanded into their constituent Render/Compute Passes. Produced by the Effect Expander.
* **Execution Plan (Linear Pass Schedule):** A linear list of passes sorted topologically, with resources allocated and barriers inserted. This is what the runtime executes.
* **Compiled Graph:** The final runtime object containing the Execution Plan, allocated resources, and compiled pipelines.

