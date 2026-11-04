#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

/**
 * Ordered list of test modules and helpers.
 * Set `parity` to true when the module depends on the Python implementation.
 */
const testEntries = [
  { file: 'scripts/checkEnums.js', parity: true },
  { file: 'test/rng.test.js', parity: false },
  { file: 'test/constants.test.js', parity: false },
  { file: 'test/constants-parity.test.js', parity: true },
  { file: 'test/simplex.test.js', parity: false },
  { file: 'test/value.test.js', parity: false },
  { file: 'test/value-parity.test.js', parity: true },
  { file: 'test/value-fixture.test.js', parity: true },
  { file: 'test/points.test.js', parity: false },
  { file: 'test/points-fixture.test.js', parity: true },
  { file: 'test/masks.test.js', parity: false },
  { file: 'test/masks-parity.test.js', parity: true },
  { file: 'test/palettes.test.js', parity: false },
  { file: 'test/palettes-parity.test.js', parity: true },
  { file: 'test/asyncInit.test.js', parity: false },
  { file: 'test/setUniformAliases.test.js', parity: false },
  { file: 'test/backendSourceContract.test.js', parity: false },
  { file: 'test/effectsRegistry.test.js', parity: false },
  { file: 'test/effects-parity.test.js', parity: true },
  { file: 'test/effects.test.js', parity: true }, // Most tests use Python-generated fixtures
  { file: 'test/effects-fixture.test.js', parity: true },
  { file: 'test/composer.test.js', parity: false },
  { file: 'test/presets-parity.test.js', parity: true },
  { file: 'test/presets-params-parity.test.js', parity: true },
  { file: 'test/presets.test.js', parity: false },
  { file: 'test/mapEffect.test.js', parity: false },
  { file: 'test/presets-render.test.js', parity: false },
  { file: 'test/preset-cycle.test.js', parity: false },
  { file: 'test/colors.test.js', parity: false },
  { file: 'test/canvas.test.js', parity: false },
  { file: 'test/cubeCamera.test.js', parity: false },
  { file: 'test/cubeExport.test.js', parity: false },
  { file: 'shaders/tests/test_pipeline.js', parity: false },
  { file: 'shaders/tests/test_audio.js', parity: false },
  { file: 'shaders/tests/test_external_input.js', parity: false },
  { file: 'shaders/tests/test_midi_audio_parser.js', parity: false },
  { file: 'shaders/tests/test_output_surface_range.js', parity: false },
  { file: 'shaders/tests/test_diagnostic_locations.js', parity: false },
  { file: 'shaders/tests/test_subchain_arguments.js', parity: false },
  { file: 'shaders/tests/test_subchain_argument_differential.js', parity: false },
  { file: 'shaders/tests/test_param_aliases.js', parity: false },
  { file: 'shaders/tests/test_transform.js', parity: false },
  { file: 'shaders/tests/test_nested_automation.js', parity: false },
  { file: 'shaders/tests/test_oscillators.js', parity: false },
  { file: 'shaders/tests/test_contract_graph_shape.mjs', parity: false },
  { file: 'shaders/tests/test_contract_parity_session.mjs', parity: false },
  { file: 'shaders/tests/test_contract_delivery_pair.mjs', parity: false },
  { file: 'shaders/tests/test_contract_frame_lifetime.mjs', parity: false },
  { file: 'shaders/tests/test_compiler_phase2_exit.js', parity: false },
  { file: 'shaders/tests/test-let-roundtrip.mjs', parity: false },
  { file: 'shaders/tests/test_gl_error_gating.js', parity: false },
  { file: 'shaders/tests/test_cube_driver.js', parity: false },
  { file: 'shaders/tests/test_cube_texture.js', parity: false },
  { file: 'shaders/tests/test_remap_contract.js', parity: false },
  { file: 'shaders/tests/test_effect_definition_validation.js', parity: false },
  { file: 'shaders/tests/test_portable_registration.js', parity: false },
  { file: 'shaders/tests/test_mip_controls.js', parity: false },
  { file: 'shaders/tests/test_pass_fields.js', parity: false },
  { file: 'shaders/tests/test_lifecycle_hooks.js', parity: false },
  { file: 'shaders/tests/test_resource_pooling.js', parity: false },
  { file: 'shaders/tests/test_backend_diagnostics.js', parity: false },
  { file: 'shaders/tests/test_frame_metrics.js', parity: false },
  { file: 'shaders/tests/test_definition_schema.js', parity: false },
  { file: 'test/program-state.test.js', parity: false },
  { file: 'test/generators.test.js', parity: false },
  { file: 'test/parser.test.js', parity: false },
  { file: 'test/evaluator.test.js', parity: false },
  { file: 'test/encoder.test.js', parity: false },
  { file: 'test/cli.test.js', parity: false },
  { file: 'test/mcp-config.test.js', parity: false },
  { file: 'test/docs-static-paths.test.js', parity: false, docs: true }
]

const skipParity = process.argv.includes('--skip-parity')
const skipDocs = process.argv.includes('--skip-docs')
const forwardedArgs = process.argv.filter((arg) => arg !== '--skip-parity' && arg !== '--skip-docs')

/**
 * Operator rule: when NM_CHANGED_FILES lists the candidate's changed paths
 * (one per line), run only the test modules that exercise those paths, and
 * keep every such module. A change to this runner itself exercises every
 * module, so a changed path naming this runner selects the whole suite.
 * Unset, the runner executes the whole suite exactly
 * as before. When a selection would still exceed one invocation's time
 * budget, NM_SHARD_COUNT and NM_SHARD_INDEX (from 0) split the selection
 * deterministically by original list position, so the shards together run
 * every selected module. Sharding applies only when NM_CHANGED_FILES is set,
 * so behavior without that variable never changes.
 */
const changedPaths = parseChangedPaths(process.env.NM_CHANGED_FILES)

function parseChangedPaths(value) {
  if (value === undefined) {
    return null
  }

  return String(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function shardSpec() {
  const count = Number.parseInt(process.env.NM_SHARD_COUNT ?? '', 10)
  const index = Number.parseInt(process.env.NM_SHARD_INDEX ?? '', 10)

  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 0 || index >= count) {
    return null
  }

  return { count, index }
}

function changedPathKeys(changedPath) {
  const segments = path.relative(repoRoot, path.resolve(repoRoot, changedPath)).split(path.sep)
  const relative = segments.join('/')
  const base = segments[segments.length - 1]

  return [relative, relative.replace(/\.[^.]+$/, ''), base, base.replace(/\.[^.]+$/)]
}

function entryExercises(entry, keys) {
  if (keys.includes(entry.file)) {
    return true
  }

  let content = ''

  try {
    content = fs.readFileSync(path.resolve(repoRoot, entry.file), 'utf8')
  } catch {
    return false
  }

  return keys.some((key) => content.includes(key))
}

let entries = testEntries

if (changedPaths !== null) {
  const runnerPath = path.relative(repoRoot, __filename).split(path.sep).join('/')

  if (changedPaths.includes(runnerPath)) {
    entries = testEntries
  } else {
    const keys = changedPaths.flatMap((changedPath) => changedPathKeys(changedPath))

    entries = testEntries.filter((entry) => entryExercises(entry, keys))
  }

  const shard = shardSpec()

  if (shard) {
    entries = entries.filter((entry) => testEntries.indexOf(entry) % shard.count === shard.index)
  }

  const shardNote = shard ? `, shard ${shard.index}/${shard.count}` : ''
  console.log(`NM_CHANGED_FILES: ${entries.length} of ${testEntries.length} test modules${shardNote}`)
}

for (const entry of entries) {
  if ((skipParity && entry.parity) || (skipDocs && entry.docs)) {
    continue
  }

  const resolved = path.resolve(repoRoot, entry.file)
  const runArgs = [resolved, ...forwardedArgs]
  const result = spawnSync('node', runArgs, {
    cwd: repoRoot,
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
