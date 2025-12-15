# Noisemaker Shader MCP Tools

MCP (Model Context Protocol) server exposing shader testing tools for VS Code Copilot coding agents.

## Quick Start

```bash
# Install dependencies
npm install

# Test the harness
node shaders/mcp/test-harness.js --effects synth/noise --backend webgl2
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System design and data flow |
| [VS Code Integration](docs/VSCODE_INTEGRATION.md) | Setup and configuration |
| [Agent Workflow](docs/AGENT_WORKFLOW.md) | How agents should use the tools |
| [Tool Reference](docs/TOOL_REFERENCE.md) | Complete API documentation |

## Tools

### Browser-Based Tools (require browser session)

| Tool | Purpose |
|------|---------|
| `compileEffect` | Verify shader compiles cleanly |
| `renderEffectFrame` | Render frame, check for monochrome output |
| `runDslProgram` | Compile and run arbitrary DSL code, return metrics |
| `describeEffectFrame` | AI vision analysis of rendered output |
| `benchmarkEffectFPS` | Measure sustained framerate |
| `testUniformResponsiveness` | Verify uniform controls affect output |
| `testNoPassthrough` | Verify filter effects modify input (not passthrough) |

### On-Disk Tools (no browser required)

| Tool | Purpose |
|------|---------|
| `checkEffectStructure` | Detect unused files, naming issues, leaked uniforms |
| `checkAlgEquiv` | Compare GLSL/WGSL algorithmic equivalence |
| `analyzeBranching` | Identify unnecessary branching that could be flattened |
| `generateShaderManifest` | Rebuild shader manifest |

See [Tool Reference](docs/TOOL_REFERENCE.md) for complete input/output schemas.

## Architecture

The implementation follows a three-layer design:

1. **Core Operations** (`core-operations.js`) - Pure library functions for shader testing
2. **Browser Harness** (`browser-harness.js`) - Session-based browser lifecycle management
3. **MCP Server** (`server.js`) - Thin façade exposing tools over stdio

Each browser-based tool invocation:
1. Creates a fresh browser session
2. Loads the demo UI and configures the backend
3. Runs the test for each specified effect (with grace periods)
4. Tears down the browser session
5. Returns structured results

See [Architecture](docs/ARCHITECTURE.md) for details.

## Installation

1. Install dependencies from the project root:
   ```bash
   npm install
   cd shaders/mcp && npm install
   ```

2. Install Playwright browsers (if not already installed):
   ```bash
   npx playwright install chromium
   ```

3. For AI vision features, create a `.openai` file in the project root containing your API key:
   ```bash
   echo "sk-..." > .openai
   ```

See [VS Code Integration](docs/VSCODE_INTEGRATION.md) for MCP server configuration.

## Test Harness CLI

Run the test harness to verify the setup:

```bash
node test-harness.js --effects <patterns> --backend <backend> [flags]
```

### Required Flags

| Flag | Description |
|------|-------------|
| `--backend <backend>` | `webgl2` or `webgpu` (REQUIRED) |
| `--webgl2`, `--glsl` | Shortcut for `--backend webgl2` |
| `--webgpu`, `--wgsl` | Shortcut for `--backend webgpu` |

### Effect Selection

| Flag | Description |
|------|-------------|
| `--effects <patterns>` | CSV of effect IDs or glob patterns |

### Test Selection

| Flag | Description |
|------|-------------|
| `--all` | Run ALL optional tests |
| `--benchmark` | Run FPS test |
| `--uniforms` | Test uniform responsiveness |
| `--structure` | Check naming, unused files, leaked uniforms |
| `--alg-equiv` | Check GLSL/WGSL algorithmic equivalence |
| `--branching` | Analyze shaders for unnecessary branching |
| `--passthrough` | Check filter effects don't pass through input |
| `--no-vision` | Skip AI vision validation |

### Examples

```bash
# Basic compile + render + vision check
node test-harness.js --effects synth/noise --backend webgl2

# Multiple effects with glob pattern
node test-harness.js --effects "synth/*" --webgl2 --benchmark

# All tests on WebGPU
node test-harness.js --effects "nm/*" --webgpu --all

# Multiple specific effects
node test-harness.js --effects "synth/noise,nm/worms" --glsl --uniforms
```

See [Tool Reference](docs/TOOL_REFERENCE.md) for complete flag documentation.

## Development Notes

- Each tool invocation gets a fresh browser session (no stale state)
- The browser harness launches Chromium with WebGPU support
- A local HTTP server (`shaders/scripts/serve.js`) is started automatically
- Console errors from the browser are captured and included in results
- A 125ms grace period is applied between effects for stability
