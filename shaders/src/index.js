/**
 * Noisemaker Rendering Pipeline - Main Export
 *
 * This is the main entry point for the Noisemaker Rendering Pipeline.
 * It exports all the key APIs for compilation, execution, and effect management.
 */

// Language & Compiler
export { lex, parse, compile } from './lang/index.js'
export { registerOp } from './lang/ops.js'
export { registerStarterOps, registerValidatorHook } from './lang/validator.js'

// Runtime Core
import { Effect } from './runtime/effect.js'
export { Effect }
export { registerEffect, getEffect, getAllEffects } from './runtime/registry.js'
export { expand } from './runtime/expander.js'
export { analyzeLiveness, allocateResources } from './runtime/resources.js'

// Backend & Pipeline
export { Backend } from './runtime/backend.js'
export { WebGL2Backend } from './runtime/backends/webgl2.js'
export { WebGPUBackend } from './runtime/backends/webgpu.js'
import { Pipeline, createPipeline } from './runtime/pipeline.js'
export { Pipeline, createPipeline }

// Integration
import { compileGraph, createRuntime, recompile } from './runtime/compiler.js'
export { compileGraph, createRuntime, recompile }

// Renderer
export { CanvasRenderer } from './renderer/canvas.js'

/**
 * Convenience function to create a complete rendering environment
 * @param {HTMLCanvasElement} canvas - Canvas element to render to
 * @param {string} source - DSL source code
 * @param {object} options - Options { preferWebGPU: boolean }
 * @returns {Promise<Pipeline>} Initialized pipeline
 */
export async function createNoisemakerPipeline(canvas, source, options = {}) {
    const width = canvas.width || 800
    const height = canvas.height || 600
    
    const pipeline = await createRuntime(source, {
        canvas,
        width,
        height,
        preferWebGPU: options.preferWebGPU ?? true
    })
    
    return pipeline
}

/**
 * Version information
 */
export const VERSION = '0.1.0'
export const PHASE = 4

/**
 * Default export for convenience
 */
export default {
    VERSION,
    PHASE,
    createNoisemakerPipeline,
    createRuntime,
    createPipeline,
    compileGraph,
    Pipeline,
    Effect
}
