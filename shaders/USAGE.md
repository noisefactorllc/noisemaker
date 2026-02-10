# Using Noisemaker as a Backend

This guide explains how to build custom applications using Noisemaker's shader rendering engine while implementing your own UI. Noisemaker is designed with a decoupled architecture that separates rendering, state management, and UI concerns.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Custom Application                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │  Your UI     │───▶│ ProgramState │───▶│CanvasRenderer│      │
│   │  (React,     │◀───│  (state)     │◀───│  (GPU)       │      │
│   │   Vue, etc)  │    │              │    │              │      │
│   └──────────────┘    └──────────────┘    └──────────────┘      │
│                              │                    │             │
│                              ▼                    ▼             │
│                       ┌─────────────────────────────┐           │
│                       │     DSL Compiler            │           │
│                       │  (compile, unparse, etc)    │           │
│                       └─────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| **CanvasRenderer** | GPU rendering pipeline | Always required |
| **ProgramState** | Centralized state management | Recommended for complex UIs |
| **UIController** | Reference UI implementation | Optional — only if you want the default demo UI |
| **DSL Compiler** | Parse/compile effect chains | For DSL text ↔ structured data |

## Setup

Noisemaker is not published on npm. There are three ways to consume it:

### Option A: Download the Shader Bundle (Recommended)

Each tagged release (`v*`) publishes a `noisemaker-shaders.tar.gz` containing the core ESM/IIFE bundles and per-effect mini-bundles.

**1. Download the shader bundle:**

```bash
# Download the latest release
mkdir -p vendor/noisemaker
gh release download --repo noisedeck/noisemaker --pattern 'noisemaker-shaders.tar.gz' --dir .
tar -xzf noisemaker-shaders.tar.gz -C vendor/noisemaker
rm noisemaker-shaders.tar.gz

# Or download a specific version
gh release download v0.7.0 --repo noisedeck/noisemaker --pattern 'noisemaker-shaders.tar.gz' --dir .
```

This gives you:

```
vendor/noisemaker/
  shaders/
    noisemaker-shaders-core.esm.js       # ESM bundle (unminified)
    noisemaker-shaders-core.esm.min.js   # ESM bundle (minified)
    noisemaker-shaders-core.min.js       # IIFE bundle (global: NoisemakerShadersCore)
    effects/
      manifest.json                      # Effect registry with metadata
  effects/
    synth/noise.js                       # Per-effect mini-bundles
    filter/bloom.js
    ...                                  # ~100+ effect bundles
```

**2. Import from the bundle:**

```javascript
// Dynamic import (recommended — lets you choose minified vs unminified)
const { CanvasRenderer, ProgramState, compile, unparse, getEffect } =
    await import('./vendor/noisemaker/shaders/noisemaker-shaders-core.esm.js')
```

Or with a static import if your app uses a bundler:

```javascript
import {
    CanvasRenderer, ProgramState, compile, unparse, getEffect
} from './vendor/noisemaker/shaders/noisemaker-shaders-core.esm.js'
```

The IIFE build exposes everything on `window.NoisemakerShadersCore` for non-module contexts.

### Option B: Source Imports

Best for development within the noisemaker repo itself (e.g., the `demo/shaders/` app) or when noisemaker is a git submodule/subtree.

```javascript
// Core renderer
import { CanvasRenderer, getEffect, isStarterEffect } from '../../shaders/src/renderer/canvas.js'

// DSL compiler
import { compile, unparse } from '../../shaders/src/lang/index.js'

// State management
import { ProgramState } from '../../demo/shaders/lib/program-state.js'
```

Adjust relative paths based on your file's location. The key source entry points are:

| Entry Point | Exports |
|-------------|---------|
| `shaders/src/renderer/canvas.js` | `CanvasRenderer`, `getEffect`, `getAllEffects`, `isStarterEffect`, `cloneParamValue` |
| `shaders/src/lang/index.js` | `compile`, `unparse`, `lex`, `parse`, `applyParameterUpdates`, `formatValue` |
| `shaders/src/index.js` | All of the above, plus `ProgramState`, `Emitter`, `Effect`, backends, etc. |
| `demo/shaders/lib/program-state.js` | `ProgramState` |
| `demo/shaders/lib/demo-ui.js` | `UIController` (reference UI implementation) |

In source mode, effects are loaded at runtime from the `shaders/effects/` directory (each effect is a directory with `definition.js` and shader files). Set `basePath` to point at the `shaders/` directory.

## Quick Start

### Minimal Setup (Rendering Only)

```javascript
const { CanvasRenderer } = await import('./vendor/noisemaker-shaders-core.esm.js')

const canvas = document.getElementById('canvas')
const renderer = new CanvasRenderer({
    canvas,
    width: 1024,
    height: 1024,
    basePath: './vendor',             // Path to shader assets
    useBundles: true,                 // Use pre-built effect bundles
    bundlePath: './vendor/effects'    // Path to effect bundles
})

await renderer.loadManifest()
await renderer.compile('noise().write(o0)\nrender(o0)')
renderer.start()
```

### With State Management

```javascript
const { CanvasRenderer, ProgramState } = await import('./vendor/noisemaker-shaders-core.esm.js')

const renderer = new CanvasRenderer({ /* ... */ })
await renderer.loadManifest()

const state = new ProgramState({ renderer })

// Load a DSL program
state.fromDsl(`
    noise(octaves: 4, scale: 2.0).write(o0)
    render(o0)
`)

// Modify parameters (automatically applies to pipeline)
state.setValue('step_0', 'octaves', 6)
state.setValue('step_0', 'scale', 3.0)
```

## Core APIs

### CanvasRenderer

The rendering engine that manages GPU pipelines.

```javascript
const renderer = new CanvasRenderer({
    canvas: HTMLCanvasElement,     // Target canvas
    width: 1024,                   // Render resolution
    height: 1024,
    basePath: './vendor',          // Path to shader assets directory
    preferWebGPU: false,           // Use WebGPU if available (default: false)
    useBundles: true,              // Use pre-built effect bundles
    bundlePath: './vendor/effects',// Path to effect bundles
    onFPS: (fps) => { },           // FPS callback
    onError: (err) => { }          // Error callback
})

// Lifecycle
await renderer.loadManifest()      // Load effect definitions
await renderer.compile(dsl)        // Compile DSL to shader pipeline
renderer.start()                   // Start render loop
renderer.stop()                    // Stop render loop

// Single frame (normalizedTime 0-1)
renderer.render(0.5)

// Parameters
renderer.applyStepParameterValues(values)  // Apply parameter values from ProgramState
renderer.updateTextureFromSource(id, src)  // Update texture from image/video

// Backend switching
await renderer.switchBackend('wgsl')       // Switch to WebGPU
await renderer.switchBackend('glsl')       // Switch to WebGL2

// Effect loading
await renderer.loadEffects(['synth/noise', 'filter/bloom'])
renderer.getEffectsFromManifest('synth')   // List effects in a namespace
```

**Path configuration:**

- **`basePath`** — Root directory for shader assets. In source mode, this points at the `shaders/` directory. In bundle mode, it points at where `dist/shaders/` was copied.
- **`bundlePath`** — Directory containing per-effect bundles (`{namespace}/{effect}.js`) and `manifest.json`. Only used when `useBundles: true`.
- **`useBundles`** — When `true`, loads effects from pre-built JS bundles. When `false`, loads from source directories (each effect is a directory with `definition.js` + shader files).

### ProgramState

Centralized state management with event-driven updates.

```javascript
const state = new ProgramState({ renderer })

// Parameter access
state.getValue('step_0', 'scale')           // Get single value
state.setValue('step_0', 'scale', 2.0)      // Set single value
state.getStepValues('step_0')               // Get all values for a step
state.setStepValues('step_0', { ... })      // Set multiple values

// Batching (single event for multiple changes)
state.batch(() => {
    state.setValue('step_0', 'scale', 2.0)
    state.setValue('step_0', 'octaves', 4)
})

// Events
state.on('change', ({ stepKey, paramName, value }) => { })
state.on('structurechange', () => { })
state.on('reset', ({ stepKey }) => { })

// DSL sync
state.fromDsl(dslText)              // Parse DSL into state
state.toDsl()                       // Generate DSL from state

// Reset
state.resetStep('step_0', effectDef)  // Reset step to defaults

// Serialization (for undo/redo, persistence)
const snapshot = state.serialize()
state.deserialize(snapshot)

// Skip state (for bypassing effects)
state.setSkip('step_0', true)
state.isSkipped('step_0')
```

### DSL Compiler

Direct access to DSL parsing and code generation.

```javascript
// Compile DSL to executable structure
const compiled = compile(`
    noise(octaves: 4).write(o0)
    render(o0)
`)

// Generate DSL from structure
const dsl = unparse(compiled)

// Error handling
try {
    compile(userInput)
} catch (err) {
    console.error(err.message)
}
```

### Effect Registry

Access effect definitions for building UIs. Effects must be loaded (via `loadManifest()` + `loadEffects()`) before they can be queried.

```javascript
// Get effect definition (after loading)
const noiseDef = getEffect('synth/noise')
console.log(noiseDef.globals)  // Parameter definitions

// Check effect type
isStarterEffect(noiseDef)  // true if it generates content (vs filters)

// Get all registered effects (returns Map)
const allEffects = getAllEffects()
for (const [effectId, effectDef] of allEffects) {
    console.log(`${effectId}: ${effectDef.description}`)
}
```

## Building Custom UIs

### Example: Vanilla JS

A minimal standalone app using vendored bundles:

```html
<!DOCTYPE html>
<html>
<body>
    <canvas id="canvas" width="512" height="512"></canvas>
    <div>
        <label>Octaves: <input type="range" id="octaves" min="1" max="8" value="4"></label>
        <label>Scale: <input type="range" id="scale" min="0.1" max="10" step="0.1" value="2"></label>
    </div>

    <script type="module">
        const { CanvasRenderer, ProgramState } =
            await import('./vendor/noisemaker-shaders-core.esm.js')

        const canvas = document.getElementById('canvas')
        const renderer = new CanvasRenderer({
            canvas,
            width: 512,
            height: 512,
            basePath: './vendor',
            useBundles: true,
            bundlePath: './vendor/effects'
        })

        await renderer.loadManifest()
        await renderer.loadEffects(['synth/noise'])

        const state = new ProgramState({ renderer })
        state.fromDsl('noise(octaves: 4, scale: 2.0).write(o0)\nrender(o0)')
        await renderer.compile(state.toDsl())
        renderer.start()

        document.getElementById('octaves').addEventListener('input', e => {
            state.setValue('step_0', 'octaves', +e.target.value)
        })
        document.getElementById('scale').addEventListener('input', e => {
            state.setValue('step_0', 'scale', +e.target.value)
        })
    </script>
</body>
</html>
```

### Example: React Integration

```jsx
import { useEffect, useState, useRef } from 'react'

function NoiseGenerator() {
    const canvasRef = useRef(null)
    const [state, setState] = useState(null)
    const [params, setParams] = useState({ octaves: 4, scale: 2.0 })

    useEffect(() => {
        let renderer

        async function init() {
            const { CanvasRenderer, ProgramState } =
                await import('./vendor/noisemaker-shaders-core.esm.js')

            renderer = new CanvasRenderer({
                canvas: canvasRef.current,
                width: 512,
                height: 512,
                useBundles: true,
                basePath: './vendor',
                bundlePath: './vendor/effects'
            })

            await renderer.loadManifest()
            await renderer.loadEffects(['synth/noise'])

            const programState = new ProgramState({ renderer })
            programState.fromDsl('noise().write(o0)\nrender(o0)')
            await renderer.compile(programState.toDsl())
            renderer.start()
            setState(programState)
        }

        init()
        return () => renderer?.stop()
    }, [])

    const handleParamChange = (key, value) => {
        if (!state) return
        state.setValue('step_0', key, value)
        setParams(p => ({ ...p, [key]: value }))
    }

    return (
        <div>
            <canvas ref={canvasRef} width={512} height={512} />
            <div>
                <label>
                    Octaves: {params.octaves}
                    <input
                        type="range"
                        min={1}
                        max={8}
                        value={params.octaves}
                        onChange={e => handleParamChange('octaves', +e.target.value)}
                    />
                </label>
                <label>
                    Scale: {params.scale.toFixed(2)}
                    <input
                        type="range"
                        min={0.1}
                        max={10}
                        step={0.1}
                        value={params.scale}
                        onChange={e => handleParamChange('scale', +e.target.value)}
                    />
                </label>
            </div>
        </div>
    )
}
```

## Parameter Definitions

Effect parameters are defined in `globals` with type information:

```javascript
const effectDef = getEffect('synth/noise')
for (const [name, spec] of Object.entries(effectDef.globals)) {
    console.log({
        name,
        type: spec.type,      // 'float', 'int', 'color', 'bool', 'choice'
        default: spec.default,
        min: spec.min,        // For numeric types
        max: spec.max,
        choices: spec.choices // For choice types
    })
}
```

### Parameter Types

| Type | JavaScript | UI Widget |
|------|------------|-----------|
| `float` | `number` | Slider |
| `int` | `number` | Slider (integer) |
| `color` | `[r, g, b]` (0-1) or `#rrggbb` | Color picker |
| `bool` | `boolean` | Toggle |
| `choice` | `string` or `number` | Dropdown |
| `surface` | `string` (`o0`, `o1`, etc) | Surface picker |

## Media Inputs

For effects that use images, video, or camera:

```javascript
// Check if effect needs media
const effectDef = getEffect('synth/media')
if (effectDef.externalTexture) {
    // Effect expects an external texture
}

// Load image
const img = new Image()
img.src = 'photo.jpg'
img.onload = () => {
    renderer.updateTextureFromSource('imageTex', img)
}

// Use video
const video = document.createElement('video')
video.src = 'video.mp4'
video.play()
// Update texture each frame
function updateVideo() {
    renderer.updateTextureFromSource('imageTex', video)
    requestAnimationFrame(updateVideo)
}
updateVideo()

// Use camera
const stream = await navigator.mediaDevices.getUserMedia({ video: true })
const video = document.createElement('video')
video.srcObject = stream
video.play()
```

## Undo/Redo Integration

Use ProgramState serialization for undo/redo:

```javascript
const undoStack = []
const redoStack = []

function pushUndo() {
    undoStack.push(state.serialize())
    redoStack.length = 0
}

function undo() {
    if (undoStack.length === 0) return
    redoStack.push(state.serialize())
    state.deserialize(undoStack.pop())
}

function redo() {
    if (redoStack.length === 0) return
    undoStack.push(state.serialize())
    state.deserialize(redoStack.pop())
}

// Before any user action
pushUndo()
state.setValue('step_0', 'scale', newValue)
```

## Advanced: Custom Effect Chains

Build effect chains programmatically:

```javascript
// Using DSL string
const dsl = `
    noise(octaves: 4, scale: 2.0)
      .posterize(levels: 8)
      .bloom(radius: 0.3)
      .write(o0)
    render(o0)
`
state.fromDsl(dsl)

// Or build incrementally
let chain = 'noise()'
chain += '.blur(radius: 0.5)'
chain += '.tint(color: [1.0, 0.5, 0.0])'
chain += '.write(o0)\nrender(o0)'
state.fromDsl(chain)
```

## Effect Directory Structure

Effects live in `shaders/effects/` organized by namespace:

```
shaders/effects/
  manifest.json               # Effect registry (metadata for all effects)
  synth/
    noise/
      definition.js           # Effect definition (globals, tags, metadata)
      glsl/                   # GLSL shader sources
      wgsl/                   # WGSL shader sources
      help.md                 # Effect documentation
    fractal/
    gradient/
    ...
  filter/
    bloom/
    blur/
    ...
  mixer/
  points/
  render/
  ...
```

When `useBundles: true`, effects are loaded from pre-built JS bundles (`dist/effects/{namespace}/{effect}.js`) which inline the shaders. When `useBundles: false`, effects are loaded from the source directories above.

### Available Namespaces

| Namespace | Description |
|-----------|-------------|
| `synth/` | Generator effects (noise, fractal, voronoi, etc.) |
| `synth3d/` | 3D volume generators |
| `filter/` | Image processing filters (bloom, blur, posterize, etc.) |
| `filter3d/` | 3D processing filters |
| `mixer/` | Blend and composition effects |
| `points/` | Agent-based simulations (physarum, flow, flock, particles) |
| `render/` | Render utilities (render3d, loopBegin/End, pointsEmitter/Render) |
| `classicNoisedeck/` | Noisedeck-original effects |
| `classicNoisemaker/` | Noisemaker-original effects |

## Bundle Contents

The core bundle (`noisemaker-shaders-core.esm.js`) includes:

| Module | Key Exports |
|--------|-------------|
| **Renderer** | `CanvasRenderer`, `cloneParamValue`, `isStarterEffect`, `is3dGenerator` |
| **Language** | `compile`, `unparse`, `lex`, `parse`, `applyParameterUpdates`, `formatValue` |
| **Runtime** | `Effect`, `registerEffect`, `getEffect`, `getAllEffects`, `Pipeline` |
| **Backends** | `WebGL2Backend`, `WebGPUBackend` |
| **External Input** | `MidiInputManager`, `AudioInputManager` |
| **State** | `ProgramState`, `Emitter`, `extractEffectsFromDsl` |
| **UI (reference)** | `UIController`, `EffectSelect`, `ToggleSwitch` |

## API Reference

For complete API documentation, see:
- [docs/shaders/demo-ui.rst](docs/shaders/demo-ui.rst) — UIController and control system
- [docs/shaders/language.rst](docs/shaders/language.rst) — DSL language reference
- [docs/shaders/effects.rst](docs/shaders/effects.rst) — Effect definitions

## Examples

- **Noisedeck** ([noisedeck.app](https://noisedeck.app)) — Full-featured visual synth app using vendored bundles
- **demo/shaders/** — Reference implementation with UIController (supports both source and bundle modes via `?bundles=1` URL parameter)
- **test/** — Unit tests demonstrating API usage
