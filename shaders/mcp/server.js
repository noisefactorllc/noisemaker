#!/usr/bin/env node
/**
 * MCP Server for Shader Effect Testing
 *
 * This MCP server exposes shader testing capabilities as tools that can be
 * used by VS Code Copilot coding agent. It provides:
 *
 * BROWSER-BASED TOOLS (require browser session):
 * - compileEffect: Compile a shader and verify it compiles cleanly
 * - renderEffectFrame: Render a frame and check for monochrome/blank output
 * - describeEffectFrame: Use AI vision to describe rendered output
 * - benchmarkEffectFPS: Verify shader can sustain target framerate
 * - testUniformResponsiveness: Verify uniform controls affect output
 * - testNoPassthrough: Verify filter effects modify their input
 *
 * ON-DISK TOOLS (no browser required):
 * - checkEffectStructure: Detect unused files, naming issues, leaked uniforms
 * - checkAlgEquiv: Compare GLSL/WGSL algorithmic equivalence
 * - generateShaderManifest: Rebuild shader manifest
 *
 * Each browser-based tool invocation:
 * 1. Creates a fresh browser session
 * 2. Loads the demo UI and configures the backend
 * 3. Runs the test for each specified effect
 * 4. Tears down the browser session
 * 5. Returns structured results
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

import {
    BrowserSession,
    checkEffectStructureOnDisk,
    checkAlgEquivOnDisk,
    analyzeBranchingOnDisk,
    matchEffects,
    gracePeriod
} from './browser-harness.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')

const server = new Server(
    {
        name: 'noisemaker-shader-tools',
        version: '2.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
)

/**
 * Tool definitions with new camelCase naming convention.
 *
 * Browser-based tools accept:
 * - effect_id or effects: Single effect ID or CSV of effect IDs/glob patterns
 * - backend: "webgl2" or "webgpu" (required)
 *
 * On-disk tools accept:
 * - effect_id or effects: Single effect ID or CSV of effect IDs/glob patterns
 * - backend: May be required for some tools
 */
const TOOLS = [
    // =========================================================================
    // BROWSER-BASED TOOLS
    // =========================================================================
    {
        name: 'compileEffect',
        description: 'Compile shader effect(s) and verify they compile cleanly. Returns detailed pass-level diagnostics for each effect.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier (e.g., "synth/noise"). Use "effects" for multiple.'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns (e.g., "synth/noise,nm/*"). Overrides effect_id.'
                },
                backend: {
                    type: 'string',
                    enum: ['webgl2', 'webgpu'],
                    description: 'Rendering backend to use (required)'
                },
                use_bundles: {
                    type: 'boolean',
                    description: 'Use pre-built effect bundles instead of loading from source'
                }
            },
            required: ['backend']
        }
    },
    {
        name: 'renderEffectFrame',
        description: 'Render a single frame of shader effect(s) and analyze if the output is monochrome/blank. Returns image metrics for each effect.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns'
                },
                backend: {
                    type: 'string',
                    enum: ['webgl2', 'webgpu'],
                    description: 'Rendering backend to use (required)'
                },
                test_case: {
                    type: 'object',
                    description: 'Optional test configuration',
                    properties: {
                        time: { type: 'number', description: 'Time value to render at' },
                        resolution: {
                            type: 'array',
                            items: { type: 'number' },
                            minItems: 2,
                            maxItems: 2,
                            description: 'Resolution [width, height]'
                        },
                        seed: { type: 'number', description: 'Random seed' },
                        uniforms: {
                            type: 'object',
                            additionalProperties: true,
                            description: 'Uniform overrides'
                        }
                    }
                },
                use_bundles: {
                    type: 'boolean',
                    description: 'Use pre-built effect bundles instead of loading from source'
                }
            },
            required: ['backend']
        }
    },
    {
        name: 'describeEffectFrame',
        description: 'Render a frame and get an AI vision description. Uses OpenAI GPT-4 Vision to analyze the rendered output.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns'
                },
                prompt: {
                    type: 'string',
                    description: 'Vision prompt - what to analyze or look for in the image'
                },
                backend: {
                    type: 'string',
                    enum: ['webgl2', 'webgpu'],
                    description: 'Rendering backend to use (required)'
                },
                test_case: {
                    type: 'object',
                    description: 'Optional test configuration',
                    properties: {
                        time: { type: 'number' },
                        resolution: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                        seed: { type: 'number' },
                        uniforms: { type: 'object', additionalProperties: true }
                    }
                },
                use_bundles: {
                    type: 'boolean',
                    description: 'Use pre-built effect bundles instead of loading from source'
                }
            },
            required: ['prompt', 'backend']
        }
    },
    {
        name: 'benchmarkEffectFPS',
        description: 'Benchmark shader effect(s) to verify they can sustain a target framerate. Runs each effect for a specified duration and measures frame times.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns'
                },
                target_fps: {
                    type: 'number',
                    default: 60,
                    description: 'Target FPS to achieve'
                },
                duration_seconds: {
                    type: 'number',
                    default: 5,
                    description: 'Duration of benchmark in seconds'
                },
                resolution: {
                    type: 'array',
                    items: { type: 'number' },
                    minItems: 2,
                    maxItems: 2,
                    description: 'Resolution [width, height]'
                },
                backend: {
                    type: 'string',
                    enum: ['webgl2', 'webgpu'],
                    description: 'Rendering backend (required)'
                },
                use_bundles: {
                    type: 'boolean',
                    description: 'Use pre-built effect bundles instead of loading from source'
                }
            },
            required: ['target_fps', 'backend']
        }
    },
    {
        name: 'testUniformResponsiveness',
        description: 'Test that uniform controls affect shader output. Renders with default values, then with modified values, and checks if output differs.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns'
                },
                backend: {
                    type: 'string',
                    enum: ['webgl2', 'webgpu'],
                    description: 'Rendering backend (required)'
                },
                use_bundles: {
                    type: 'boolean',
                    description: 'Use pre-built effect bundles instead of loading from source'
                }
            },
            required: ['backend']
        }
    },
    {
        name: 'testNoPassthrough',
        description: 'Test that filter effect(s) do NOT pass through input unchanged. Passthrough/no-op/placeholder shaders are STRICTLY FORBIDDEN. Compares input and output textures on the same frame. Fails if textures are >99% similar.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns'
                },
                backend: {
                    type: 'string',
                    enum: ['webgl2', 'webgpu'],
                    description: 'Rendering backend (required)'
                },
                use_bundles: {
                    type: 'boolean',
                    description: 'Use pre-built effect bundles instead of loading from source'
                }
            },
            required: ['backend']
        }
    },
    {
        name: 'testPixelParity',
        description: 'Test pixel-for-pixel parity between GLSL (WebGL2) and WGSL (WebGPU) shader outputs. Renders effect at frame 0 with both backends and compares pixels. Skips sim effects. Fails if pixel values differ beyond epsilon tolerance.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns'
                },
                epsilon: {
                    type: 'number',
                    default: 1,
                    description: 'Maximum per-channel pixel difference allowed (0-255 scale). Default: 1'
                },
                seed: {
                    type: 'number',
                    default: 42,
                    description: 'Random seed for reproducible noise generation'
                },
                use_bundles: {
                    type: 'boolean',
                    description: 'Use pre-built effect bundles instead of loading from source'
                }
            },
            required: []
        }
    },
    {
        name: 'runDslProgram',
        description: 'Compile and run a DSL program, rendering a single frame and returning image metrics. Use this to test arbitrary DSL compositions without pre-defined effects.',
        inputSchema: {
            type: 'object',
            properties: {
                dsl: {
                    type: 'string',
                    description: 'DSL source code to compile and run (e.g., "noise().write(o0)")'
                },
                backend: {
                    type: 'string',
                    enum: ['webgl2', 'webgpu'],
                    description: 'Rendering backend (required)'
                },
                prompt: {
                    type: 'string',
                    description: 'Vision prompt - what to analyze or look for in the rendered image. If provided, uses OpenAI Vision to analyze the output.'
                },
                test_case: {
                    type: 'object',
                    description: 'Optional test configuration',
                    properties: {
                        time: { type: 'number', description: 'Time value to render at' },
                        resolution: {
                            type: 'array',
                            items: { type: 'number' },
                            minItems: 2,
                            maxItems: 2,
                            description: 'Resolution [width, height]'
                        },
                        seed: { type: 'number', description: 'Random seed' },
                        uniforms: {
                            type: 'object',
                            additionalProperties: true,
                            description: 'Uniform overrides'
                        }
                    }
                },
                use_bundles: {
                    type: 'boolean',
                    description: 'Use pre-built effect bundles instead of loading from source'
                }
            },
            required: ['dsl', 'backend']
        }
    },

    // =========================================================================
    // ON-DISK TOOLS (no browser required)
    // =========================================================================
    {
        name: 'checkEffectStructure',
        description: 'Check effect structure on disk for unused files, broken references, naming issues, and leaked/unbound uniforms. Does NOT require a browser.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns'
                },
                backend: {
                    type: 'string',
                    enum: ['webgl2', 'webgpu'],
                    description: 'Backend to check (affects which shader directory is scanned)'
                }
            },
            required: ['backend']
        }
    },
    {
        name: 'checkAlgEquiv',
        description: 'Check algorithmic equivalence between GLSL and WGSL shader implementations using AI. Only flags truly divergent algorithms, not language-specific syntax differences. Does NOT require a browser.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns'
                }
            },
            required: []
        }
    },
    {
        name: 'analyzeBranching',
        description: 'Analyze shader code for unnecessary branching that could be flattened. Uses AI to identify opportunities to reduce conditional branching by applying uniform values directly. Understands that some branching is necessary for complex effects. Does NOT require a browser.',
        inputSchema: {
            type: 'object',
            properties: {
                effect_id: {
                    type: 'string',
                    description: 'Single effect identifier'
                },
                effects: {
                    type: 'string',
                    description: 'CSV of effect IDs or glob patterns'
                },
                backend: {
                    type: 'string',
                    enum: ['webgl2', 'webgpu'],
                    description: 'Which shader language to analyze (required)'
                }
            },
            required: ['backend']
        }
    },
    {
        name: 'generateShaderManifest',
        description: 'Regenerate the shader manifest by running the manifest generation script. Does NOT require a browser.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    }
]

/**
 * Parse effects from arguments.
 * Returns array of effect patterns from either effect_id or effects parameter.
 */
function parseEffects(args) {
    if (args.effects) {
        return args.effects.split(',').map(e => e.trim()).filter(e => e)
    }
    if (args.effect_id) {
        return [args.effect_id]
    }
    return []
}

/**
 * Resolve effect patterns to actual effect IDs using browser session.
 */
async function resolveEffects(session, patterns) {
    if (patterns.length === 0) {
        throw new Error('No effects specified. Provide effect_id or effects parameter.')
    }

    const allEffects = await session.listEffects()
    const resolved = new Set()

    for (const pattern of patterns) {
        const matches = matchEffects(allEffects, pattern)
        if (matches.length === 0) {
            throw new Error(`No effects matched pattern: ${pattern}`)
        }
        for (const m of matches) {
            resolved.add(m)
        }
    }

    return Array.from(resolved).sort()
}

/**
 * Run a browser-based test on multiple effects.
 * Follows the common main loop pattern.
 */
async function runBrowserTest(args, testFn) {
    const patterns = parseEffects(args)
    const backend = args.backend
    const useBundles = args.use_bundles || false

    if (!backend) {
        throw new Error('backend parameter is required')
    }

    // Setup: Create fresh browser session
    const session = new BrowserSession({ backend, headless: true, useBundles })

    try {
        await session.setup()

        // Resolve effect patterns
        const effectIds = await resolveEffects(session, patterns)

        // Main loop: Test each effect
        const results = {}
        for (const effectId of effectIds) {
            try {
                results[effectId] = await testFn(session, effectId, args)
            } catch (err) {
                results[effectId] = { status: 'error', error: err.message }
            }

            // Grace period between effects
            await gracePeriod()
        }

        return {
            backend,
            effects_tested: effectIds.length,
            results
        }

    } finally {
        // Teardown: Close browser session
        await session.teardown()
    }
}

/**
 * Handle list tools request
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS }
})

/**
 * Handle tool call request
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
        let result

        switch (name) {
            // =================================================================
            // BROWSER-BASED TOOLS
            // =================================================================

            case 'compileEffect': {
                result = await runBrowserTest(args, async (session, effectId) => {
                    return await session.compileEffect(effectId)
                })
                break
            }

            case 'renderEffectFrame': {
                const testCase = args.test_case || {}
                result = await runBrowserTest(args, async (session, effectId) => {
                    return await session.renderEffectFrame(effectId, {
                        time: testCase.time,
                        resolution: testCase.resolution,
                        seed: testCase.seed,
                        uniforms: testCase.uniforms
                    })
                })
                break
            }

            case 'describeEffectFrame': {
                const testCase = args.test_case || {}
                result = await runBrowserTest(args, async (session, effectId) => {
                    return await session.describeEffectFrame(effectId, args.prompt, {
                        time: testCase.time,
                        resolution: testCase.resolution,
                        seed: testCase.seed,
                        uniforms: testCase.uniforms
                    })
                })
                break
            }

            case 'benchmarkEffectFPS': {
                result = await runBrowserTest(args, async (session, effectId) => {
                    return await session.benchmarkEffectFps(effectId, {
                        targetFps: args.target_fps,
                        durationSeconds: args.duration_seconds,
                        resolution: args.resolution
                    })
                })
                break
            }

            case 'testUniformResponsiveness': {
                result = await runBrowserTest(args, async (session, effectId) => {
                    return await session.testUniformResponsiveness(effectId)
                })
                break
            }

            case 'testNoPassthrough': {
                result = await runBrowserTest(args, async (session, effectId) => {
                    return await session.testNoPassthrough(effectId)
                })
                break
            }

            case 'testPixelParity': {
                // This test needs BOTH backends, so we handle it specially
                // It always uses WebGL2 first, then WebGPU
                const patterns = parseEffects(args)
                const useBundles = args.use_bundles || false
                const epsilon = args.epsilon ?? 1
                const seed = args.seed ?? 42

                // Setup: Create fresh browser session (starts with webgl2)
                const session = new BrowserSession({ backend: 'webgl2', headless: true, useBundles })

                try {
                    await session.setup()

                    // Resolve effect patterns
                    const effectIds = await resolveEffects(session, patterns)

                    // Main loop: Test each effect
                    const results = {}
                    for (const effectId of effectIds) {
                        try {
                            results[effectId] = await session.testPixelParity(effectId, { epsilon, seed })
                        } catch (err) {
                            results[effectId] = { status: 'error', error: err.message }
                        }

                        // Grace period between effects
                        await gracePeriod()
                    }

                    result = {
                        effects_tested: effectIds.length,
                        epsilon,
                        seed,
                        results
                    }

                } finally {
                    await session.teardown()
                }
                break
            }

            case 'runDslProgram': {
                const dsl = args.dsl
                const backend = args.backend
                const useBundles = args.use_bundles || false
                const testCase = args.test_case || {}
                const prompt = args.prompt

                if (!dsl) {
                    throw new Error('dsl parameter is required')
                }
                if (!backend) {
                    throw new Error('backend parameter is required')
                }

                // Setup: Create fresh browser session
                const session = new BrowserSession({ backend, headless: true, useBundles })

                try {
                    await session.setup()

                    // Run DSL program (with optional vision prompt)
                    const dslResult = await session.runDslProgram(dsl, {
                        time: testCase.time,
                        resolution: testCase.resolution,
                        seed: testCase.seed,
                        uniforms: testCase.uniforms,
                        prompt
                    })

                    result = {
                        backend,
                        dsl,
                        ...dslResult
                    }

                } finally {
                    await session.teardown()
                }
                break
            }

            // =================================================================
            // ON-DISK TOOLS (no browser required)
            // =================================================================

            case 'checkEffectStructure': {
                const patterns = parseEffects(args)
                const backend = args.backend

                if (!backend) {
                    throw new Error('backend parameter is required')
                }

                // For on-disk tools, we need to get effect list differently
                // or just pass the patterns through as-is
                const results = {}
                for (const pattern of patterns) {
                    // If it's an exact effect ID, use it directly
                    if (!pattern.includes('*') && !pattern.includes('?') && !pattern.startsWith('/')) {
                        try {
                            results[pattern] = await checkEffectStructureOnDisk(pattern, { backend })
                        } catch (err) {
                            results[pattern] = { status: 'error', error: err.message }
                        }
                    } else {
                        // For glob patterns, we'd need to resolve them
                        // For now, just report that patterns require browser
                        results[pattern] = {
                            status: 'error',
                            error: 'Glob patterns require browser session to resolve. Use exact effect IDs for on-disk tools.'
                        }
                    }
                }

                result = {
                    backend,
                    effects_tested: Object.keys(results).length,
                    results
                }
                break
            }

            case 'checkAlgEquiv': {
                const patterns = parseEffects(args)

                const results = {}
                for (const pattern of patterns) {
                    if (!pattern.includes('*') && !pattern.includes('?') && !pattern.startsWith('/')) {
                        try {
                            results[pattern] = await checkAlgEquivOnDisk(pattern)
                        } catch (err) {
                            results[pattern] = { status: 'error', error: err.message }
                        }
                    } else {
                        results[pattern] = {
                            status: 'error',
                            error: 'Glob patterns require browser session to resolve. Use exact effect IDs for on-disk tools.'
                        }
                    }
                }

                result = {
                    effects_tested: Object.keys(results).length,
                    results
                }
                break
            }

            case 'analyzeBranching': {
                const patterns = parseEffects(args)
                const backend = args.backend

                if (!backend) {
                    throw new Error('backend parameter is required')
                }

                const results = {}
                for (const pattern of patterns) {
                    if (!pattern.includes('*') && !pattern.includes('?') && !pattern.startsWith('/')) {
                        try {
                            results[pattern] = await analyzeBranchingOnDisk(pattern, { backend })
                        } catch (err) {
                            results[pattern] = { status: 'error', error: err.message }
                        }
                    } else {
                        results[pattern] = {
                            status: 'error',
                            error: 'Glob patterns require browser session to resolve. Use exact effect IDs for on-disk tools.'
                        }
                    }
                }

                result = {
                    backend,
                    effects_tested: Object.keys(results).length,
                    results
                }
                break
            }

            case 'generateShaderManifest': {
                result = await new Promise((resolve) => {
                    const scriptPath = path.join(PROJECT_ROOT, 'shaders/scripts/generate_shader_manifest.py')

                    const proc = spawn('python3', [scriptPath], {
                        cwd: PROJECT_ROOT,
                        stdio: ['ignore', 'pipe', 'pipe']
                    })

                    let stdout = ''
                    let stderr = ''

                    proc.stdout.on('data', (data) => {
                        stdout += data.toString()
                    })

                    proc.stderr.on('data', (data) => {
                        stderr += data.toString()
                    })

                    proc.on('close', (code) => {
                        resolve({
                            status: code === 0 ? 'ok' : 'error',
                            exit_code: code,
                            stdout: stdout.trim(),
                            stderr: stderr.trim()
                        })
                    })

                    proc.on('error', (err) => {
                        resolve({
                            status: 'error',
                            error: `Failed to spawn process: ${err.message}`
                        })
                    })

                    // Timeout after 30 seconds
                    setTimeout(() => {
                        proc.kill('SIGTERM')
                        resolve({
                            status: 'error',
                            error: 'Process timed out after 30 seconds'
                        })
                    }, 30000)
                })
                break
            }

            default:
                throw new Error(`Unknown tool: ${name}`)
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
            }]
        }

    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    status: 'error',
                    error: error.message || String(error)
                }, null, 2)
            }],
            isError: true
        }
    }
})

/**
 * Start the server
 */
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('Noisemaker Shader Tools MCP server v2.0.0 running on stdio')
}

main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
})
