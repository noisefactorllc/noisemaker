# VS Code Integration Guide

## Prerequisites

1. **Node.js 18+** installed
2. **Playwright** with Chromium browser
3. **MCP SDK** installed in project

```bash
# From project root
npm install
cd shaders/mcp && npm install
npx playwright install chromium
```

## Configuration

### VS Code Settings

The MCP server is configured in `.vscode/settings.json`:

```json
{
  "mcp": {
    "servers": {
      "noisemaker-shader-tools": {
        "command": "node",
        "args": ["${workspaceFolder}/shaders/mcp/server.js"]
      }
    }
  }
}
```

### API Key Setup

For AI vision features (`describeEffectFrame`, `checkAlgEquiv`), create a `.openai` file in the project root:
```bash
echo "sk-..." > .openai
```

## How It Works

1. **On each tool call**: Fresh browser session is created
2. **HTTP server**: Started once, reused across calls
3. **Browser lifecycle**: Created and destroyed per invocation
4. **On VS Code shutdown**: Server process terminates

The explicit setup/teardown per call ensures reliability and prevents stale state.

## Available Tools

### Browser-Based Tools

| Tool | Purpose |
|------|---------|
| `compileEffect` | Verify shader compiles cleanly |
| `renderEffectFrame` | Render frame, check for monochrome output |
| `describeEffectFrame` | AI vision analysis of rendered output |
| `benchmarkEffectFPS` | Measure sustained framerate |
| `testUniformResponsiveness` | Verify uniform controls affect output |
| `testNoPassthrough` | Verify filter effects modify input |

### On-Disk Tools

| Tool | Purpose |
|------|---------|
| `checkEffectStructure` | Detect unused files, naming issues, leaked uniforms |
| `checkAlgEquiv` | Compare GLSL/WGSL algorithmic equivalence |
| `generateShaderManifest` | Rebuild shader manifest from disk |

## Verifying Setup

### Test the harness manually:

```bash
cd /path/to/py-noisemaker
node shaders/mcp/test-harness.js --effects synth/noise --backend webgl2
```

Expected output:
```
Starting browser session...
Backend: webgl2

=== Compile Check: synth/noise ===
✓ Compiled successfully

=== Render Check: synth/noise ===
✓ Rendered (not monochrome)
  unique_colors: 847
  luma_variance: 5312.4

Browser session closed.
```

### Test multiple effects:

```bash
node shaders/mcp/test-harness.js --effects "synth/*" --webgl2

# With all tests
node shaders/mcp/test-harness.js --effects "classicNoisemaker/worms" --webgl2 --all
```

### Test the MCP server directly:

```bash
# Start server (blocks on stdio)
node shaders/mcp/server.js

# In another terminal, send a test request:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node shaders/mcp/server.js
```

## Troubleshooting

### "Browser failed to launch"

Install Playwright browsers:
```bash
npx playwright install chromium
```

### "Timeout waiting for compilation"

- Check that the shader effect exists
- Verify the demo page loads at http://localhost:4173/demo/shaders/

### "No OpenAI API key found"

Create a `.openai` file in the project root with your API key. Only needed for `describeEffectFrame` and `checkAlgEquiv`. Other tools work without it.

### Server won't start

Check for port conflicts:
```bash
lsof -i :4173
```

Kill any existing process and retry.

### Browser session not closing

Each tool call should create and destroy its own browser. If you see lingering Chromium processes, check for errors in the MCP server output.

```bash
# Find and kill orphaned browsers
pkill -f "chromium.*--headless"
```

## Backend Selection

All browser-based tools require a `backend` parameter:

- `"webgl2"` (aliases: `--glsl`, `--webgl2`) - Use WebGL2 with GLSL shaders
- `"webgpu"` (aliases: `--wgsl`, `--webgpu`) - Use WebGPU with WGSL shaders

When calling via MCP, specify in the request:
```json
{
  "effect_id": "synth/noise",
  "backend": "webgl2"
}
```

When using the CLI:
```bash
node test-harness.js --effects synth/noise --backend webgl2
```
