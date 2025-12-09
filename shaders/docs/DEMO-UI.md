# Demo UI Refactoring Guide

**STATUS: Task 0 Complete - Analysis and Planning**

This document guides the refactoring of `/demo/shaders/index.html` to separate rendering logic from UI concerns, making the shader rendering pipeline easy to vendor and embed.

## Goal

Create a reusable `CanvasRenderer` class that can be used independently of the demo UI. The demo page will be updated in-place to use this new architecture while maintaining full test harness compatibility.

---

## Current Architecture Analysis

The demo HTML file (`/demo/shaders/index.html`) is a ~2650 line monolithic file containing:

### Rendering Logic (to extract → `CanvasRenderer`)
- Canvas element management
- Pipeline creation and disposal (`disposePipeline`, `createRuntime`, `recompile`)
- Render loop with FPS throttling (`renderLoop`, `scheduleNextFrame`)
- Backend switching (glsl/wgsl)
- Frame counting and FPS measurement
- Uniform binding and parameter application (`buildUniformBindings`, `applyParameterValues`)
- DSL compilation and pipeline rebuild (`rebuildPipeline`, `rebuildPipelineFromDsl`)
- Lazy effect loading infrastructure (`loadEffectOnDemand`, `loadEffectsOnDemand`)
- Effect shader loading (`loadEffectDefinition`, `loadEffectShaders`)

### UI Logic (to extract → `demo-ui.js`)
- Effect selector dropdown population and handling
- Parameter controls generation (`createEffectControlsFromDsl`)
- DSL editor and run button
- Loading dialog management
- Status message display
- Backend radio buttons
- FPS selector
- Duration input
- Module collapse/expand behavior
- URL parameter handling

### Shared/Bridge Logic
- DSL parsing and effect extraction (`extractEffectNamesFromDsl`, `extractEffectsFromDsl`)
- Value formatting (`formatValue`, `formatEnumName`)
- Effect categorization (`isStarterEffect`, `hasTexSurfaceParam`, etc.)
- Enum registration and lookup

---

## Test Harness Globals (MUST MAINTAIN)

The MCP test harness depends on these window globals:

```javascript
window.__noisemakerCurrentBackend    // function returning 'glsl' or 'wgsl'
window.__noisemakerRenderingPipeline // the Pipeline object
window.__noisemakerCurrentEffect     // the current effect object
window.__noisemakerFrameCount        // integer frame counter
window.__noisemakerGetEffectParams   // function returning effectParameterValues
window.__noisemakerRegenerateDsl     // function to regenerate DSL from params
window.__noisemakerCurrentDsl        // string of current DSL
window.__noisemakerGetLoopDuration   // function returning loop duration
window.__noisemakerGetFPS            // function returning target FPS
window.__noisemakerRegistry          // { getEffect } for effect lookups
```

---

## Target Architecture

### File Structure

```
/shaders/src/renderer/
    canvas.js         # CanvasRenderer class (NEW)

/demo/shaders/lib/
    demo-ui.js        # Demo-specific UI logic (NEW)

/demo/shaders/
    index.html        # Wires up CanvasRenderer + demo-ui.js (UPDATED)
```

### CanvasRenderer Class (`/shaders/src/renderer/canvas.js`)

```javascript
export class CanvasRenderer {
    constructor(options) {
        // options: { canvas, width, height, preferWebGPU, onFrame, onError }
    }
    
    // Pipeline lifecycle
    async compile(dsl, options)     // Compile DSL to pipeline
    async switchBackend(backend)    // Switch between glsl/wgsl
    dispose(options)                // Clean up resources
    
    // Render loop
    start()                         // Start animation loop
    stop()                          // Stop animation loop
    render(time)                    // Single frame render
    
    // Configuration
    setTargetFPS(fps)
    setLoopDuration(duration)
    setUniform(name, value)
    resize(width, height, zoom)
    
    // Lazy loading support
    async loadEffect(effectId)
    async loadEffects(effectIds)
    getManifest()
    
    // Read-only state
    get backend()
    get pipeline()
    get frameCount()
    get currentFPS()
    get isRunning()
}
```

### Demo UI Module (`/demo/shaders/lib/demo-ui.js`)

```javascript
export class UIController {
    constructor(renderer, options) {
        // options: { effectSelect, dslEditor, controlsContainer, ... }
    }
    
    // Effect management
    async selectEffect(effectPath)
    populateEffectSelector(effects)
    
    // Control generation
    createControlsFromDsl(dsl)
    updateControlValues(params)
    
    // DSL handling
    buildDslSource(effect, params)
    regenerateDsl()
    
    // UI helpers
    showStatus(message, type)
    showLoadingDialog(title)
    hideLoadingDialog()
}
```

---

## Implementation Plan

### Task 1: Extract CanvasRenderer (`/shaders/src/renderer/canvas.js`)

Extract these functions/logic from index.html:

1. **Canvas management**
   - `resetCanvasElement()`
   
2. **Pipeline lifecycle**
   - `disposePipeline()`
   - Pipeline creation via `createRuntime`
   - `recompile` integration
   
3. **Render loop**
   - `scheduleNextFrame()`
   - `renderLoop()`
   - FPS tracking variables
   
4. **Effect loading**
   - `loadEffectDefinition()`
   - `loadEffectShaders()`
   - `loadEffectOnDemand()`
   - `loadEffectsOnDemand()`
   - `registerEffectWithRuntime()`
   - `globalManifest` and `loadedEffects` caches
   
5. **Uniform/parameter handling**
   - `buildUniformBindings()`
   - `applyParameterValues()`
   - `convertParameterForUniform()`
   
6. **Helper utilities** (shared with UI)
   - `cloneParamValue()`
   - `resolveEnumValue()`
   - `isStarterEffect()`
   - `hasTexSurfaceParam()`
   - `is3dGenerator()`
   - `is3dProcessor()`
   - `needsInputTex3d()`

7. **Test harness globals**
   - Expose via getters/setters or direct property access

### Task 2: Extract Demo UI (`/demo/shaders/lib/demo-ui.js`)

Extract these functions/logic:

1. **Effect selector**
   - `populateEffectSelector()`
   - Effect selection handling
   
2. **Control generation**
   - `createEffectControlsFromDsl()`
   - Control event handlers
   
3. **DSL handling**
   - `buildDslSource()`
   - `extractEffectNamesFromDsl()`
   - `extractEffectsFromDsl()`
   - `formatValue()`
   - `formatEnumName()`
   - `regenerateDslFromEffectParams()`
   - `updateDslFromEffectParams()`
   
4. **Loading dialog**
   - `showLoadingDialog()`
   - `hideLoadingDialog()`
   - `updateLoadingStatus()`
   - Loading queue management
   
5. **Status display**
   - `showStatus()`
   
6. **URL parameter handling**
   - `getBackendFromURL()`
   - `getEffectFromURL()`

### Task 3: Wire Up index.html

1. Import `CanvasRenderer` from `/shaders/src/renderer/canvas.js`
2. Import `UIController` from `./lib/demo-ui.js`
3. Initialize renderer with canvas and options
4. Initialize UI with renderer reference and DOM elements
5. Wire up event handlers to call renderer/UI methods
6. Maintain all test harness globals via renderer accessors

---

## Key Constraints

1. **NO NEW DEMO PAGE** - Update `index.html` in-place
2. **Test harness compatibility** - All globals must work identically
3. **Lazy loading preserved** - Effect loading on-demand must work
4. **Backend switching** - glsl/wgsl switching must be seamless
5. **Module format** - Use ES modules, no build step required
6. **No external dependencies** - Vanilla JS only

---

## Testing Strategy

After each task, verify:

1. Demo loads without console errors
2. Effect selector works
3. DSL editor compiles and runs
4. Parameter controls update visuals
5. Backend switching works
6. MCP test harness tools pass:
   - `compileEffect`
   - `renderEffectFrame`
   - `testUniformResponsiveness`

---

## Progress Tracking

- [x] **Task 0**: Analysis and planning (this document)
- [x] **Task 1**: Extract CanvasRenderer class → `/shaders/src/renderer/canvas.js`
- [x] **Task 2**: Extract Demo UI module → `/demo/shaders/lib/demo-ui.js`
- [ ] **Task 3**: Wire up index.html with new architecture

---

*This document will be deleted after refactoring is complete.*
