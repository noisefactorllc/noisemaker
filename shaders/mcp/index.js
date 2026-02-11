/**
 * Noisemaker Shader MCP Tools - Public API
 *
 * Export the core operations and browser harness for use by tests
 * and other consumers.
 */

export {
    compileEffect,
    renderEffectFrame,
    benchmarkEffectFps,
    describeEffectFrame,
    checkEffectStructure,
    checkShaderParity,
    analyzeBranching,
    computeImageMetrics,
    waitForCompileStatus,
    getOpenAIApiKey,
    getAnthropicApiKey,
    getAIProvider,
    callAI,
    STATUS_TIMEOUT
} from './core-operations.js'

export {
    BrowserHarness,
    createBrowserHarness
} from './browser-harness.js'
