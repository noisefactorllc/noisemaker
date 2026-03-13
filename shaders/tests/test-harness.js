#!/usr/bin/env node
/**
 * Shader Effect Test Harness
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  CRITICAL: DO NOT WEAKEN THESE TESTS                                         ║
 * ║                                                                              ║
 * ║  It is STRICTLY PROHIBITED to:                                               ║
 * ║    - Return 'ok' or count as 'passed' when ANY problem exists                ║
 * ║    - Change ❌ to ⚠ (warnings are for informational messages ONLY)           ║
 * ║    - Skip failure checks to make numbers look better                         ║
 * ║    - Add exceptions that mask real problems                                  ║
 * ║    - Disable or hobble tests                                                 ║
 * ║                                                                              ║
 * ║  A test PASSES if and ONLY if it is PRISTINE - zero issues of any kind.      ║
 * ║  Monochrome output, console errors, naming issues, unused files - ALL FAIL.  ║
 * ║                                                                              ║
 * ║  If a shader doesn't work, FIX THE SHADER, not the test.                     ║
 * ║  Always fix forward. Never mask problems.                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node test-harness.js [flags]
 *
 * Required flags:
 *   --backend <backend>       "webgl2" or "webgpu" (REQUIRED)
 *
 * Alternative backend flags:
 *   --webgl2, --glsl          Use WebGL2/GLSL backend
 *   --webgpu, --wgsl          Use WebGPU/WGSL backend
 *
 * Effect selection:
 *   --effects <patterns>      CSV of effect IDs or glob patterns (default: "synth/noise")
 *
 * Test selection:
 *   --all                     Run ALL optional tests
 *   --benchmark               Run FPS test (~500ms per effect)
 *   --uniforms                Test that uniform controls affect output
 *   --structure               Test for unused files, naming conventions, leaked uniforms
 *   --structure-only          Run ONLY structure tests (no browser, filesystem-based)
 *   --alg-equiv               Test GLSL/WGSL algorithmic equivalence (requires --with-ai)
 *   --branching               Analyze shaders for unnecessary branching (requires --with-ai)
 *   --passthrough             Test that filter effects do NOT pass through input unchanged
 *   --pixel-parity            Test GLSL/WGSL pixel-for-pixel output parity at frame 0
 *   --with-ai                 Enable AI-based tests (alg-equiv, branching, vision)
 *   --no-vision               Skip AI vision validation (even with --with-ai)
 *
 * Other flags:
 *   --verbose                 Show additional diagnostic info
 *
 * Examples:
 *   node test-harness.js --effects synth/noise --backend webgl2
 *   node test-harness.js --effects "synth/*" --webgl2 --benchmark
 *   node test-harness.js --effects "classicNoisemaker/*" --webgpu --all
 *   node test-harness.js --effects "synth/noise,nm/worms" --glsl --uniforms
 *   node test-harness.js --structure-only --effects "classicNoisedeck/*" --webgl2
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')

// Configure shade-mcp to find effects (must be set before importing shade-mcp)
process.env.SHADE_EFFECTS_DIR = path.join(PROJECT_ROOT, 'shaders', 'effects')
process.env.SHADE_PROJECT_ROOT = PROJECT_ROOT

import {
    BrowserSession,
    compileEffect, renderEffectFrame, benchmarkEffectFPS,
    testNoPassthrough, testPixelParity, testUniformResponsiveness,
    checkEffectStructure,
    matchEffects,
} from '../../vendor/shade-mcp/harness/index.js'
// AI-dependent imports are loaded dynamically to avoid requiring @anthropic-ai/sdk at module level
let getAIProvider, checkAlgEquiv, analyzeBranching
async function loadAIDeps() {
    if (!getAIProvider) {
        const ai = await import('../../vendor/shade-mcp/ai/provider.js')
        const analysis = await import('../../vendor/shade-mcp/analysis/index.js')
        getAIProvider = ai.getAIProvider
        checkAlgEquiv = analysis.checkAlgEquiv
        analyzeBranching = analysis.analyzeBranching
    }
}

// Noisemaker-specific window globals (different from shade-mcp defaults)
const NOISEMAKER_GLOBALS = {
    canvasRenderer: '__noisemakerCanvasRenderer',
    renderingPipeline: '__noisemakerRenderingPipeline',
    currentBackend: '__noisemakerCurrentBackend',
    currentEffect: '__noisemakerCurrentEffect',
    setPaused: '__noisemakerSetPaused',
    setPausedTime: '__noisemakerSetPausedTime',
    frameCount: '__noisemakerFrameCount',
}

function gracePeriod(ms = 125) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// =========================================================================
// EXEMPTION SETS - STRICT: No more exemptions are permitted
// =========================================================================

/**
 * Effects exempt from monochrome output check.
 * These effects are DESIGNED to output a single color by their nature.
 */
const MONOCHROME_EXEMPT_EFFECTS = new Set([
    'filter/a',       // Extracts alpha channel as grayscale - input noise has alpha=1.0
    'filter/shape',       // Outputs a shape on solid background - "solid" tag is valid
    'filter/solid',       // Outputs a solid fill color by design
])

/**
 * Effects exempt from "essentially blank" output check.
 */
const BLANK_EXEMPT_EFFECTS = new Set([
    // STRICT: No more exemptions are permitted
])

/**
 * Effects exempt from transparent output check.
 */
const TRANSPARENT_EXEMPT_EFFECTS = new Set([
    // Media input effects now load a default test image, so they produce visible output
])

/**
 * Effects exempt from passthrough check.
 */
const PASSTHROUGH_EXEMPT_EFFECTS = new Set([
    'filter/fxaa',        // FXAA anti-aliasing only modifies edge pixels - subtle effect on smooth noise input
    'filter/pixelate',    // Pixelate groups colors into blocks - preserves average but changes structure
    'classicNoisemaker/aberration',      // Chromatic aberration uses edge mask (pow(dist, 3)) - center unchanged, edges shifted
    'classicNoisemaker/onScreenDisplay', // OSD overlays text/UI elements - mostly passes through underlying image
    'classicNoisemaker/strayHair',       // Hair overlay effect - sparse thin lines over image preserve most pixels
])

// =========================================================================
// CLI ARGUMENT PARSING
// =========================================================================

function parseArgs() {
    const args = process.argv.slice(2)
    const parsed = {
        effects: [],
        backend: null,
        runAll: false,
        runBenchmark: false,
        runUniforms: false,
        runStructure: false,
        runStructureOnly: false,
        runAlgEquiv: false,
        runBranching: false,
        runPassthrough: false,
        runPixelParity: false,
        withAi: false,
        skipVision: false,
        useBundles: false,
        verbose: false
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        if (arg === '--effects' && i + 1 < args.length) {
            parsed.effects = args[++i].split(',').map(e => e.trim()).filter(e => e)
        } else if (arg === '--backend' && i + 1 < args.length) {
            parsed.backend = args[++i]
        } else if (arg === '--webgl2' || arg === '--glsl') {
            parsed.backend = 'webgl2'
        } else if (arg === '--webgpu' || arg === '--wgsl') {
            parsed.backend = 'webgpu'
        } else if (arg === '--all') {
            parsed.runAll = true
        } else if (arg === '--benchmark') {
            parsed.runBenchmark = true
        } else if (arg === '--uniforms') {
            parsed.runUniforms = true
        } else if (arg === '--structure') {
            parsed.runStructure = true
        } else if (arg === '--structure-only') {
            parsed.runStructureOnly = true
            parsed.runStructure = true
        } else if (arg === '--alg-equiv') {
            parsed.runAlgEquiv = true
        } else if (arg === '--branching') {
            parsed.runBranching = true
        } else if (arg === '--passthrough') {
            parsed.runPassthrough = true
        } else if (arg === '--pixel-parity') {
            parsed.runPixelParity = true
        } else if (arg === '--with-ai') {
            parsed.withAi = true
        } else if (arg === '--no-vision') {
            parsed.skipVision = true
        } else if (arg === '--bundles') {
            parsed.useBundles = true
        } else if (arg === '--verbose') {
            parsed.verbose = true
        } else if (!arg.startsWith('--')) {
            // Legacy support: positional argument is a pattern
            parsed.effects.push(arg)
        }
    }

    // Apply --all
    if (parsed.runAll) {
        parsed.runBenchmark = true
        parsed.runUniforms = true
        parsed.runStructure = true
        parsed.runAlgEquiv = true
        parsed.runBranching = true
        parsed.runPassthrough = true
        parsed.runPixelParity = true
    }

    // Default effects
    if (parsed.effects.length === 0) {
        // In structure-only mode, default to all effects
        if (parsed.runStructureOnly) {
            parsed.effects = ['*/*']
        } else {
            parsed.effects = ['synth/noise']
        }
    }

    return parsed
}

// =========================================================================
// STRUCTURE-ONLY MODE (no browser)
// =========================================================================

/**
 * Discover all effects from the filesystem.
 * Returns array of effect IDs like "synth/noise", "classicNoisemaker/worms", etc.
 */
function discoverEffectsFromDisk() {
    const effectsDir = path.join(PROJECT_ROOT, 'shaders', 'effects')
    const effects = []

    // List namespace directories
    const namespaces = fs.readdirSync(effectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => d.name)

    for (const namespace of namespaces) {
        const namespaceDir = path.join(effectsDir, namespace)
        const effectNames = fs.readdirSync(namespaceDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.'))
            .map(d => d.name)

        for (const effectName of effectNames) {
            // Verify it has a definition.js
            const defPath = path.join(namespaceDir, effectName, 'definition.js')
            if (fs.existsSync(defPath)) {
                effects.push(`${namespace}/${effectName}`)
            }
        }
    }

    return effects.sort()
}

/**
 * Run structure-only tests without launching a browser.
 * Uses filesystem to discover effects and runs on-disk checks.
 */
async function runStructureOnlyMode(args) {
    console.log(`\n[STRUCTURE-ONLY MODE] No browser will be launched.`)
    console.log(`Backend: ${args.backend}\n`)

    // Discover effects from filesystem
    const allEffects = discoverEffectsFromDisk()
    console.log(`Found ${allEffects.length} effects on disk.`)

    // Match patterns
    const matchedEffectsSet = new Set()
    for (const pattern of args.effects) {
        const matches = matchEffects(allEffects, pattern)
        if (matches.length === 0) {
            console.log(`No effects matched pattern: ${pattern}`)
        }
        for (const m of matches) {
            matchedEffectsSet.add(m)
        }
    }

    const matchedEffects = Array.from(matchedEffectsSet).sort()

    if (matchedEffects.length === 0) {
        console.log('No effects matched. Exiting.')
        return
    }

    console.log(`Testing ${matchedEffects.length} effect(s):\n`)

    const results = []
    const startTime = Date.now()
    let passedCount = 0
    let failedCount = 0

    // Main loop: Test each effect
    for (const effectId of matchedEffects) {
        const t0 = Date.now()
        const structureResult = await checkEffectStructure(effectId)
        const elapsed = Date.now() - t0

        // Determine pass/fail
        const issues = []
        if (structureResult.missingDescription) {
            issues.push('missing description')
        }
        if (structureResult.namingIssues?.length > 0) {
            issues.push(`${structureResult.namingIssues.length} naming issue(s)`)
        }
        if (structureResult.unusedFiles?.length > 0) {
            issues.push(`${structureResult.unusedFiles.length} unused file(s)`)
        }
        if (structureResult.leakedInternalUniforms?.length > 0) {
            issues.push(`${structureResult.leakedInternalUniforms.length} leaked uniform(s)`)
        }
        if (structureResult.structuralParityIssues?.length > 0) {
            issues.push(`${structureResult.structuralParityIssues.length} parity issue(s)`)
        }
        if (structureResult.nameCollisions?.length > 0) {
            issues.push(`${structureResult.nameCollisions.length} name collision(s)`)
        }

        const passed = issues.length === 0
        if (passed) {
            passedCount++
            console.log(`✓ ${effectId} [${elapsed}ms]`)
        } else {
            failedCount++
            console.log(`❌ ${effectId}: ${issues.join(', ')} [${elapsed}ms]`)

            // Print details in verbose mode or if naming/collision issues
            if (args.verbose || structureResult.namingIssues?.length > 0) {
                for (const issue of (structureResult.namingIssues || [])) {
                    if (issue.expected) {
                        console.log(`   ${issue.type}: "${issue.name}" → "${issue.expected}"`)
                    } else {
                        console.log(`   ${issue.type}: "${issue.name}" - ${issue.reason}`)
                    }
                }
            }
            for (const collision of (structureResult.nameCollisions || [])) {
                console.log(`   ${collision.message}`)
            }
        }

        results.push({ effectId, structure: structureResult, passed })
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    // Summary
    console.log(`\n=== Summary ===`)
    if (failedCount > 0) {
        console.log(`\n❌ FAILED: ${failedCount}/${results.length} effects`)
    } else {
        console.log(`\n✅ ALL ${results.length} EFFECTS PASSED`)
    }
    console.log(`${passedCount}/${results.length} passed in ${elapsed}s`)

    if (failedCount > 0) {
        process.exit(1)
    }
    process.exit(0)
}

// =========================================================================
// INDIVIDUAL EFFECT TEST
// =========================================================================

async function testEffect(session, effectId, options) {
    const results = {
        effectId,
        compile: null,
        render: null,
        isMonochrome: false,
        uniforms: null,
        uniformsFailed: false,
        structure: null,
        algEquiv: null,
        algEquivDivergent: false,
        branching: null,
        branchingWarning: false,
        passthrough: null,
        passthroughFailed: false,
        pixelParity: null,
        pixelParityFailed: false,
        benchmark: null,
        benchmarkFailed: false,
        vision: null,
        visionFailed: false,
        consoleErrors: []
    }
    const timings = []
    const backend = options.backend
    let t0 = Date.now()

    // Clear console messages
    session.clearConsoleMessages()

    // Structure test (runs before compilation, uses filesystem)
    if (options.runStructure) {
        t0 = Date.now()
        const structureResult = await checkEffectStructure(effectId)
        timings.push(`structure:${Date.now() - t0}ms`)
        results.structure = structureResult

        // Check for missing description
        if (structureResult.missingDescription) {
            console.log(`  ❌ missing description field in definition.js`)
        } else {
            console.log(`  ✓ has description`)
        }

        // Report naming convention issues
        if (structureResult.namingIssues?.length > 0) {
            console.log(`  ❌ naming issues (${structureResult.namingIssues.length}):`)
            for (const issue of structureResult.namingIssues) {
                if (issue.expected) {
                    console.log(`     ${issue.type}: "${issue.name}" → expected "${issue.expected}"`)
                } else {
                    console.log(`     ${issue.type}: "${issue.name}" - ${issue.reason}`)
                }
            }
        } else {
            console.log(`  ✓ naming conventions (camelCase)`)
        }

        // Report unused files
        if (structureResult.unusedFiles?.length > 0) {
            console.log(`  ❌ unused files: ${structureResult.unusedFiles.join(', ')}`)
        } else if (structureResult.unusedFiles) {
            console.log(`  ✓ no unused shader files`)
        }

        // Report leaked internal uniforms
        if (structureResult.leakedInternalUniforms?.length > 0) {
            console.log(`  ❌ leaked internal uniforms: ${structureResult.leakedInternalUniforms.join(', ')}`)
        } else {
            console.log(`  ✓ no leaked internal uniforms`)
        }

        // Report structural parity issues
        if (structureResult.structuralParityIssues?.length > 0) {
            console.log(`  ❌ structural parity issues (${structureResult.structuralParityIssues.length}):`)
            for (const issue of structureResult.structuralParityIssues) {
                console.log(`     ${issue.message}`)
            }
        } else {
            console.log(`  ✓ GLSL ↔ WGSL structural parity`)
        }

        // Report GLSL name collisions
        if (structureResult.nameCollisions?.length > 0) {
            console.log(`  ❌ GLSL name collisions (${structureResult.nameCollisions.length}):`)
            for (const collision of structureResult.nameCollisions) {
                console.log(`     ${collision.message}`)
            }
        } else {
            console.log(`  ✓ no GLSL name collisions`)
        }

        t0 = Date.now()
    }

    // Algorithmic equivalence test (uses filesystem + AI)
    if (options.runAlgEquiv) {
        await loadAIDeps()
        if (!options.withAi) {
            console.log(`  ⊘ alg-equiv: skipped (--with-ai not specified)`)
        } else if (!getAIProvider({ projectRoot: PROJECT_ROOT })) {
            console.log(`  ⊘ alg-equiv: skipped (no AI API key)`)
        } else {
            t0 = Date.now()
            const algEquivResult = await checkAlgEquiv(effectId)
            timings.push(`alg-equiv:${Date.now() - t0}ms`)
            results.algEquiv = algEquivResult

            if (algEquivResult.status === 'divergent') {
                results.algEquivDivergent = true
                console.log(`  ❌ ALG-EQUIV DIVERGENT`)
                for (const pair of algEquivResult.pairs.filter(p => p.parity === 'divergent')) {
                    console.log(`    ${pair.program}: ${pair.notes}`)
                    if (pair.concerns?.length > 0) {
                        for (const concern of pair.concerns) {
                            console.log(`      - ${concern}`)
                        }
                    }
                }
            } else if (algEquivResult.status === 'error') {
                results.algEquivDivergent = true
                console.log(`  ❌ alg-equiv: ${algEquivResult.summary}`)
            } else if (algEquivResult.status === 'ok' && algEquivResult.pairs.length > 0) {
                console.log(`  ✓ alg-equiv: ${algEquivResult.pairs.length} pairs equivalent`)
            } else {
                results.algEquivDivergent = true
                console.log(`  ❌ alg-equiv: ${algEquivResult.summary || 'Unknown error'}`)
            }

            t0 = Date.now()
        }
    }

    // Branching analysis (uses filesystem + AI)
    if (options.runBranching) {
        await loadAIDeps()
        if (!options.withAi) {
            console.log(`  ⊘ branching: skipped (--with-ai not specified)`)
        } else if (!getAIProvider({ projectRoot: PROJECT_ROOT })) {
            console.log(`  ⊘ branching: skipped (no AI API key)`)
        } else {
            t0 = Date.now()
            const branchingResult = await analyzeBranching(effectId, backend)
            timings.push(`branching:${Date.now() - t0}ms`)
            results.branching = branchingResult

            // Count total opportunities
            let totalOpportunities = 0
            for (const shader of branchingResult.shaders || []) {
                totalOpportunities += (shader.opportunities || []).length
            }

            if (branchingResult.status === 'error') {
                results.branchingWarning = true
                console.log(`  ❌ branching: ${branchingResult.summary}`)
            } else if (branchingResult.status === 'warning' || totalOpportunities > 0) {
                if (branchingResult.status === 'warning') {
                    results.branchingWarning = true
                }
                console.log(`  ${branchingResult.status === 'warning' ? '⚠' : 'ℹ'} branching: ${totalOpportunities} opportunity/ies found`)
                for (const shader of branchingResult.shaders || []) {
                    if (shader.opportunities?.length > 0) {
                        console.log(`    ${shader.file}:`)
                        for (const opp of shader.opportunities) {
                            const sev = opp.severity === 'high' ? '❗' : opp.severity === 'medium' ? '⚠' : 'ℹ'
                            console.log(`      ${sev} ${opp.location}: ${opp.description}`)
                        }
                    }
                    if (shader.notes) {
                        console.log(`    Note: ${shader.notes}`)
                    }
                }
            } else {
                console.log(`  ✓ branching: ${branchingResult.summary}`)
            }

            t0 = Date.now()
        }
    }

    // Compile
    const compileResult = await compileEffect(session, effectId)
    timings.push(`compile:${Date.now() - t0}ms`)
    t0 = Date.now()
    results.compile = compileResult.status

    if (compileResult.status === 'error') {
        console.log(`  ❌ compile: ${compileResult.message}`)
        return results
    }
    console.log(`  ✓ compile`)

    // Render
    const renderResult = await renderEffectFrame(session, effectId, { warmupFrames: 10 })
    timings.push(`render:${Date.now() - t0}ms`)
    t0 = Date.now()
    results.render = renderResult.status

    const isMonochromeExempt = MONOCHROME_EXEMPT_EFFECTS.has(effectId)
    const isTransparentExempt = TRANSPARENT_EXEMPT_EFFECTS.has(effectId)
    const isBlankExempt = BLANK_EXEMPT_EFFECTS.has(effectId)

    results.isMonochrome = (renderResult.metrics?.is_monochrome || false) && !isMonochromeExempt && !isTransparentExempt
    results.isMonochromeExempt = isMonochromeExempt && (renderResult.metrics?.is_monochrome || false)
    results.isEssentiallyBlank = (renderResult.metrics?.is_essentially_blank || false) && !isTransparentExempt && !isBlankExempt
    results.isBlankExempt = isBlankExempt && (renderResult.metrics?.is_essentially_blank || false)
    results.isAllTransparent = (renderResult.metrics?.is_all_transparent || false) && !isTransparentExempt
    results.isTransparentExempt = isTransparentExempt && (renderResult.metrics?.is_all_transparent || false)

    if (renderResult.status === 'error') {
        console.log(`  ❌ render: ${renderResult.error}`)
        const consoleErrors = session.getConsoleMessages()
        if (consoleErrors.length > 0) {
            console.log(`  Console errors:`)
            for (const msg of consoleErrors.slice(0, 10)) {
                console.log(`    ${msg.type}: ${msg.text.slice(0, 500)}`)
            }
        }
    } else if (renderResult.metrics?.is_all_transparent && !isTransparentExempt) {
        console.log(`  ❌ render: FULLY TRANSPARENT (alpha=0 everywhere, mean_alpha=${renderResult.metrics.mean_alpha?.toFixed(4)})`)
    } else if (isTransparentExempt && renderResult.metrics?.is_all_transparent) {
        console.log(`  ⊘ render: transparent (exempt - expected for ${effectId})`)
    } else if (isBlankExempt && renderResult.metrics?.is_essentially_blank) {
        console.log(`  ⊘ render: essentially blank (exempt - edge detection on smooth noise)`)
    } else if (renderResult.metrics?.is_essentially_blank) {
        const m = renderResult.metrics
        console.log(`  ❌ render: ESSENTIALLY BLANK (mean_rgb=[${m.mean_rgb.map(v => v.toFixed(4)).join(', ')}], ${m.unique_sampled_colors} colors)`)
    } else if (renderResult.metrics?.is_monochrome && !isMonochromeExempt) {
        console.log(`  ❌ render: monochrome output (${renderResult.metrics.unique_sampled_colors} colors)`)
    } else if (results.isMonochromeExempt) {
        console.log(`  ⊘ render: monochrome (exempt - expected for ${effectId})`)
    } else {
        console.log(`  ✓ render (${renderResult.metrics?.unique_sampled_colors} colors)`)
    }

    // Uniform responsiveness test
    if (options.runUniforms) {
        t0 = Date.now()
        const uniformResult = await testUniformResponsiveness(session, effectId)
        timings.push(`uniforms:${Date.now() - t0}ms`)
        results.uniforms = uniformResult.status

        if (uniformResult.status === 'skipped') {
            console.log(`  ⊘ uniforms: ${uniformResult.details}`)
        } else if (uniformResult.status === 'ok') {
            console.log(`  ✓ uniforms: ${uniformResult.tested_uniforms.join(', ')}`)
        } else {
            results.uniformsFailed = true
            console.log(`  ❌ uniforms: ${uniformResult.details} [${uniformResult.tested_uniforms.join(', ')}]`)
        }
    }

    // Passthrough test
    if (options.runPassthrough) {
        t0 = Date.now()
        const isPassthroughExempt = PASSTHROUGH_EXEMPT_EFFECTS.has(effectId)

        if (isPassthroughExempt) {
            results.passthrough = 'skipped'
            console.log(`  ⊘ passthrough: exempt (effect preserves average colors by design)`)
        } else {
            const passthroughResult = await testNoPassthrough(session, effectId)
            timings.push(`passthrough:${Date.now() - t0}ms`)
            results.passthrough = passthroughResult.status

            if (passthroughResult.status === 'skipped') {
                console.log(`  ⊘ passthrough: ${passthroughResult.details}`)
            } else if (passthroughResult.status === 'ok') {
                console.log(`  ✓ passthrough: ${passthroughResult.details}`)
            } else if (passthroughResult.status === 'passthrough') {
                results.passthroughFailed = true
                console.log(`  ❌ PASSTHROUGH DETECTED: ${passthroughResult.details}`)
            } else {
                results.passthroughFailed = true
                console.log(`  ❌ passthrough: ${passthroughResult.details}`)
            }
        }
    }

    // Pixel parity test (GLSL ↔ WGSL)
    if (options.runPixelParity) {
        t0 = Date.now()
        const pixelParityResult = await testPixelParity(session, effectId, { epsilon: 1 })
        timings.push(`pixel-parity:${Date.now() - t0}ms`)
        results.pixelParity = pixelParityResult.status

        if (pixelParityResult.status === 'skipped') {
            console.log(`  ⊘ pixel-parity: ${pixelParityResult.details}`)
        } else if (pixelParityResult.status === 'ok') {
            console.log(`  ✓ pixel-parity: ${pixelParityResult.details}`)
        } else if (pixelParityResult.status === 'mismatch') {
            results.pixelParityFailed = true
            console.log(`  ❌ PIXEL MISMATCH: ${pixelParityResult.details}`)
        } else {
            results.pixelParityFailed = true
            console.log(`  ❌ pixel-parity: ${pixelParityResult.details}`)
        }
    }

    // Benchmark
    if (options.runBenchmark) {
        t0 = Date.now()
        const benchResult = await benchmarkEffectFPS(session, effectId, {
            targetFps: 30,
            durationSeconds: 0.5,
        })
        timings.push(`benchmark:${Date.now() - t0}ms`)
        results.benchmark = benchResult.achieved_fps
        results.benchmarkStats = benchResult.stats
        if (benchResult.achieved_fps < 30) {
            results.benchmarkFailed = true
            console.log(`  ❌ benchmark: ${benchResult.achieved_fps} fps (below 30 fps target)`)
        } else {
            // Include jitter in output if available
            const jitterInfo = benchResult.stats?.jitter_ms !== undefined
                ? `, jitter: ${benchResult.stats.jitter_ms}ms`
                : ''
            console.log(`  ✓ benchmark: ${benchResult.achieved_fps} fps${jitterInfo}`)
        }
    }

    // Reset uniforms before vision test
    await session.resetUniformsToDefaults()

    // TODO: re-enable vision test when describeEffectFrame is exported from shade-mcp

    // Capture console errors
    const allConsoleMessages = session.getConsoleMessages()

    // Filter out known benign warnings that are unavoidable in CI:
    // - GPU driver ReadPixels stall warnings (expected when capturing frames)
    // Only skip these in CI - locally we want to see everything
    const isKnownBenignCI = (msg) => {
        if (!process.env.CI) return false
        if (msg.text.includes('GPU stall due to ReadPixels')) return true
        if (msg.text.includes('GL Driver Message') && msg.text.includes('Performance')) return true
        return false
    }

    results.consoleErrors = allConsoleMessages.filter(m =>
        (m.type === 'error' || m.type === 'warning' || m.type === 'pageerror') &&
        !isKnownBenignCI(m)
    )

    if (results.consoleErrors.length > 0) {
        console.log(`  ❌ console errors: ${results.consoleErrors.length} error(s)/warning(s)`)
        // Always show console errors. Any spam is bad
        for (const msg of results.consoleErrors.slice(0, 10)) {
            console.log(`    ${msg.type}: ${msg.text.slice(0, 300)}`)
        }
    }

    // Reset uniforms at end
    await session.resetUniformsToDefaults()

    console.log(`  [${timings.join(', ')}]`)
    return results
}

// =========================================================================
// MAIN
// =========================================================================

async function main() {
    const nag = "⚠️ This is a long-running, expensive test suite. Don't run it multiple times unless you really need to. Capture the results in a log and review the log."
    console.log(nag)

    const args = parseArgs()

    // Validate backend
    if (!args.backend) {
        console.error('ERROR: Backend flag is REQUIRED.')
        console.error('  Use --backend webgl2 or --webgl2 or --glsl for WebGL2/GLSL')
        console.error('  Use --backend webgpu or --webgpu or --wgsl for WebGPU/WGSL')
        console.error('\nExample: node test-harness.js --effects synth/noise --backend webgl2')
        process.exit(1)
    }

    // Structure-only mode: skip browser, run on-disk checks
    if (args.runStructureOnly) {
        await runStructureOnlyMode(args)
        return
    }

    console.log(`\nStarting browser session (backend: ${args.backend})...`)

    // Pixel parity tests require headed mode for WebGPU support
    const needsHeaded = args.runPixelParity
    if (needsHeaded) {
        console.log('  (headed mode for WebGPU pixel parity testing)')
    }

    // Setup: Create browser session
    const session = new BrowserSession({
        backend: args.backend,
        headless: !needsHeaded,  // Headed for pixel parity, headless otherwise
        globals: NOISEMAKER_GLOBALS,
        viewerRoot: PROJECT_ROOT,
        viewerPath: '/demo/shaders/?effect=synth/noise',
        effectsDir: path.join(PROJECT_ROOT, 'shaders', 'effects'),
    })

    try {
        await session.setup()

        // Resolve effect patterns from disk
        const allEffects = discoverEffectsFromDisk()
        const matchedEffectsSet = new Set()

        for (const pattern of args.effects) {
            const matches = matchEffects(allEffects, pattern)
            if (matches.length === 0) {
                console.log(`No effects matched pattern: ${pattern}`)
                console.log(`Available: ${allEffects.slice(0, 10).join(', ')}...`)
            }
            for (const m of matches) {
                matchedEffectsSet.add(m)
            }
        }

        const matchedEffects = Array.from(matchedEffectsSet).sort()

        if (matchedEffects.length === 0) {
            console.log('No effects matched. Exiting.')
            await session.teardown()
            return
        }

        console.log(`\nTesting ${matchedEffects.length} effect(s):\n`)

        const results = []
        const startTime = Date.now()

        // Main loop: Test each effect
        for (const effectId of matchedEffects) {
            console.log(`\n────────────────────────────────────────────────────────────────────────────────`)
            console.log(`[${effectId}] (${args.backend})`)

            const result = await testEffect(session, effectId, args)
            results.push(result)

            // Grace period between effects
            await gracePeriod()
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

        // =====================================================================
        // STRICT PASS/FAIL DETERMINATION
        // =====================================================================
        const passed = results.filter(r => {
            if (r.compile !== 'ok') return false
            if (r.render !== 'ok') return false
            if (r.isMonochrome) return false
            if (r.isEssentiallyBlank) return false
            if (r.isAllTransparent) return false
            if (r.consoleErrors?.length > 0) return false
            if (r.uniformsFailed) return false
            if (r.passthroughFailed) return false
            if (r.pixelParityFailed) return false
            if (r.benchmarkFailed) return false
            if (r.visionFailed) return false
            if (r.algEquivDivergent) return false
            if (args.runStructure && r.structure?.namingIssues?.length > 0) return false
            if (args.runStructure && r.structure?.unusedFiles?.length > 0) return false
            if (args.runStructure && r.structure?.leakedInternalUniforms?.length > 0) return false
            if (args.runStructure && r.structure?.structuralParityIssues?.length > 0) return false
            if (args.runStructure && r.structure?.nameCollisions?.length > 0) return false
            return true
        }).length

        const failed = results.filter(r => {
            if (r.compile !== 'ok') return true
            if (r.render !== 'ok') return true
            if (r.isMonochrome) return true
            if (r.isEssentiallyBlank) return true
            if (r.isAllTransparent) return true
            if (r.consoleErrors?.length > 0) return true
            if (r.uniformsFailed) return true
            if (r.passthroughFailed) return true
            if (r.pixelParityFailed) return true
            if (r.benchmarkFailed) return true
            if (r.visionFailed) return true
            if (r.algEquivDivergent) return true
            if (args.runStructure && r.structure?.namingIssues?.length > 0) return true
            if (args.runStructure && r.structure?.unusedFiles?.length > 0) return true
            if (args.runStructure && r.structure?.leakedInternalUniforms?.length > 0) return true
            if (args.runStructure && r.structure?.structuralParityIssues?.length > 0) return true
            return false
        })

        // Summary
        console.log(`\n=== Summary ===`)
        if (failed.length > 0) {
            console.log(`\n${'❌'.repeat(3)} FAILED: ${failed.length}/${results.length} effects ${'❌'.repeat(3)}`)
            console.log(``)
            for (const r of failed) {
                const reasons = []
                if (r.compile !== 'ok') reasons.push(`compile: ${r.compile}`)
                if (r.render !== 'ok') reasons.push(`render: ${r.render}`)
                if (r.isMonochrome) reasons.push('monochrome output')
                if (r.isEssentiallyBlank) reasons.push('blank output')
                if (r.isAllTransparent) reasons.push('transparent output')
                if (r.consoleErrors?.length > 0) reasons.push(`${r.consoleErrors.length} console error(s)`)
                if (r.uniformsFailed) reasons.push('uniforms unresponsive')
                if (r.passthroughFailed) reasons.push('passthrough (no-op)')
                if (r.pixelParityFailed) reasons.push('GLSL/WGSL pixel mismatch')
                if (r.benchmarkFailed) reasons.push('below target FPS')
                if (r.visionFailed) reasons.push('vision check failed')
                if (r.algEquivDivergent) reasons.push('GLSL/WGSL divergent')
                if (args.runStructure && r.structure?.namingIssues?.length > 0) reasons.push(`${r.structure.namingIssues.length} naming issue(s)`)
                if (args.runStructure && r.structure?.unusedFiles?.length > 0) reasons.push(`${r.structure.unusedFiles.length} unused file(s)`)
                if (args.runStructure && r.structure?.leakedInternalUniforms?.length > 0) reasons.push(`${r.structure.leakedInternalUniforms.length} leaked uniform(s)`)
                if (args.runStructure && r.structure?.structuralParityIssues?.length > 0) reasons.push(`${r.structure.structuralParityIssues.length} parity issue(s)`)
                if (args.runStructure && r.structure?.nameCollisions?.length > 0) reasons.push(`${r.structure.nameCollisions.length} name collision(s)`)
                console.log(`  ❌ ${r.effectId}: ${reasons.join(', ')}`)
            }
            console.log(``)
        } else {
            console.log(`\n✅ ALL ${results.length} EFFECTS PASSED ✅`)
        }
        console.log(`${passed}/${results.length} passed in ${elapsed}s`)
        console.log(`${(elapsed / results.length).toFixed(2)}s per effect (excluding browser startup)`)

        // Teardown
        await session.teardown()

        console.log(nag)

        if (failed.length > 0) {
            console.log(`\n❌ TEST RUN FAILED - fix the issues above`)
            process.exit(1)
        }

        process.exit(0)

    } catch (error) {
        console.error('Test failed:', error)
        await session.teardown()
        process.exit(1)
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
