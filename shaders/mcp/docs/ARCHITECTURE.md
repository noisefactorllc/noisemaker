# MCP Shader Tools Architecture

## Overview

The MCP shader tools system enables VS Code Copilot coding agents to test shader effects in a real browser environment. It follows a three-layer architecture with explicit setup/teardown per invocation.

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Copilot Agent                    │
│                                                             │
│  "Fix the noise shader" → compileEffect → renderEffectFrame │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ MCP Protocol (stdio)
┌─────────────────────────────────────────────────────────────┐
│                      MCP Server Layer                       │
│                       (server.js)                           │
│                                                             │
│  - Exposes 9 tools via JSON-RPC over stdio                  │
│  - Stateless: each call gets fresh browser session          │
│  - Delegates to browser harness or on-disk operations       │
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌───────────────────────────┐     ┌───────────────────────────┐
│   Browser Harness Layer   │     │   On-Disk Operations      │
│   (browser-harness.js)    │     │   (core-operations.js)    │
│                           │     │                           │
│ - createSession() per call│     │ - checkEffectStructure    │
│ - Fresh browser each time │     │ - checkShaderParity       │
│ - 6 browser-based tools   │     │ - generateShaderManifest  │
│ - Explicit teardown       │     │                           │
└───────────────────────────┘     └───────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Core Operations Layer                     │
│                   (core-operations.js)                      │
│                                                             │
│  Browser-based operations (receive page from harness):      │
│  - compileEffect(): Compile shader, return diagnostics      │
│  - renderEffectFrame(): Render frame, compute metrics       │
│  - benchmarkEffectFps(): Measure sustained framerate        │
│  - describeEffectFrame(): AI vision analysis                │
│  - testUniformResponsiveness(): Verify controls work        │
│  - testNoPassthrough(): Verify filter modifies input        │
│                                                             │
│  On-disk operations (no browser required):                  │
│  - checkEffectStructure(): Detect unused files, naming      │
│  - checkShaderParity(): Compare GLSL/WGSL via AI            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Demo Page (Browser)                      │
│                   /demo/shaders/index.html                  │
│                                                             │
│  - Real WebGL2/WebGPU rendering context                     │
│  - Effect registry with all available effects               │
│  - Pipeline runtime with frame timing                       │
└─────────────────────────────────────────────────────────────┘
```

## Session Lifecycle

Each browser-based tool invocation follows this lifecycle:

```
┌─────────────────────────────────────────────────────────────┐
│ Tool Invocation (e.g., compileEffect)                       │
│                                                             │
│  1. createSession()                                         │
│     ├─ Start HTTP server (if not running)                   │
│     ├─ Launch new Chromium browser                          │
│     ├─ Create new page                                      │
│     ├─ Navigate to demo.html                                │
│     ├─ Configure backend (WebGL2/WebGPU)                    │
│     └─ Return { page, close }                               │
│                                                             │
│  2. Run test logic                                          │
│     ├─ Loop over effects with grace period                  │
│     ├─ Call core operation (compileEffect, etc.)            │
│     └─ Collect results                                      │
│                                                             │
│  3. close()                                                 │
│     ├─ Close browser                                        │
│     └─ (HTTP server stays running for efficiency)           │
│                                                             │
│  4. Return results                                          │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Tool Call Flow

1. Agent invokes tool (e.g., `compileEffect({ effect_id: "synth/noise", backend: "webgl2" })`)
2. MCP server receives JSON-RPC request over stdio
3. Server calls browser harness method (e.g., `harness.compileEffect()`)
4. Harness creates fresh session, runs test, tears down
5. Core operation interacts with demo page via `page.evaluate()`
6. Results flow back: page → core → harness → server → agent

### Timeout Budget

All shader operations must complete within **1 second**:
- Shader compilation: < 100ms typical
- Frame render: < 16ms at 60fps
- Pixel readback: < 50ms
- Total buffer: 1000ms

## File Responsibilities

| File | Responsibility |
|------|----------------|
| `server.js` | MCP protocol handling, tool definitions, JSON-RPC |
| `browser-harness.js` | Browser lifecycle, createSession(), 6 browser-based tools |
| `core-operations.js` | Shader testing logic, image metrics, on-disk operations |
| `test-harness.js` | CLI for running tests outside MCP |
| `index.js` | Public exports for external consumers |

## Tool Categories

### Browser-Based Tools (require session)

These tools launch a browser and interact with the demo page:

| Tool | Description |
|------|-------------|
| `compileEffect` | Compile shader, return pass-level diagnostics |
| `renderEffectFrame` | Render frame, compute image metrics |
| `describeEffectFrame` | Render + AI vision analysis |
| `benchmarkEffectFPS` | Measure sustained framerate |
| `testUniformResponsiveness` | Verify uniform controls affect output |
| `testNoPassthrough` | Verify filter effects modify input |

### On-Disk Tools (no browser)

These tools analyze files directly without rendering:

| Tool | Description |
|------|-------------|
| `checkEffectStructure` | Detect unused files, naming issues, leaked uniforms |
| `checkAlgEquiv` | Compare GLSL/WGSL via AI for algorithmic equivalence |
| `generateShaderManifest` | Rebuild shader manifest from disk |

## Design Principles

1. **Effect-centric**: One tool call tests one effect
2. **Stateless**: Each invocation gets a fresh browser session
3. **Explicit teardown**: No lingering browser processes
4. **Fast**: 1-second timeout for all operations
5. **Honest**: Return raw results; let caller decide pass/fail thresholds
6. **Reusable**: Core operations work with any Playwright page
7. **Separated concerns**: Browser-based vs on-disk tools clearly distinguished
