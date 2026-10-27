#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
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
  { file: 'shaders/tests/test_webgpu_binding_parser.js', parity: false },
  { file: 'shaders/tests/test_mrt_cube_target.js', parity: false },
  { file: 'shaders/tests/test_readpixels_single_channel.js', parity: false },
  { file: 'shaders/tests/test_webgl2_depth_buffer.js', parity: false },
  { file: 'shaders/tests/test_webgpu_depth_cache.js', parity: false },
  { file: 'shaders/tests/test_webgpu_mrt_pipeline.js', parity: false },
  { file: 'shaders/tests/test_webgpu_struct_layout.js', parity: false },
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
  { file: 'test/scene-graph-ci.test.js', parity: false },
  { file: 'test/program-state.test.js', parity: false },
  { file: 'test/generators.test.js', parity: false },
  { file: 'test/parser.test.js', parity: false },
  { file: 'test/evaluator.test.js', parity: false },
  { file: 'test/encoder.test.js', parity: false },
  { file: 'test/cli.test.js', parity: false },
  // Scene graph engine tests
  { file: 'shaders/tests/test_scene_linalg.js', parity: false },
  { file: 'shaders/tests/test_scene_math.js', parity: false },
  { file: 'shaders/tests/test_corrective_baselines.js', parity: false },
  { file: 'shaders/tests/test_geometry_primitives.js', parity: false },
  { file: 'shaders/tests/test_mesh_obj_generator.js', parity: false },
  { file: 'shaders/tests/test_generated_marcher_shaders.js', parity: false },
  { file: 'shaders/tests/test_mesh_packing.js', parity: false },
  { file: 'shaders/tests/test_scene_tree.js', parity: false },
  { file: 'shaders/tests/test_gltf_loader.js', parity: false },
  { file: 'shaders/tests/test_scene_parser.js', parity: false },
  { file: 'shaders/tests/test_scene_compiler.js', parity: false },
  { file: 'shaders/tests/test_scene_graph_wiring.js', parity: false },
  { file: 'shaders/tests/test_scene_bindings.js', parity: false },
  { file: 'shaders/tests/test_scene_integration.js', parity: false },
  { file: 'shaders/tests/test_gbuffer.js', parity: false },
  { file: 'shaders/tests/test_volume_shaders.js', parity: false },
  { file: 'shaders/tests/test_volume_atlas_size.js', parity: false },
  { file: 'shaders/tests/test_scene_renderer.js', parity: false },
  { file: 'shaders/tests/test_procedural.js', parity: false },
  { file: 'shaders/tests/test_clock.js', parity: false },
  // DSL language and round-trip
  { file: 'shaders/tests/test_array_literal_additive.mjs', parity: false },
  { file: 'shaders/tests/test_array_literal_roundtrip.mjs', parity: false },
  { file: 'shaders/tests/test_comment_roundtrip.js', parity: false },
  { file: 'shaders/tests/test_scene_roundtrip.js', parity: false },
  { file: 'shaders/tests/test_validator.js', parity: false },
  { file: 'shaders/tests/test_chain_preservation.js', parity: false },
  // Compiler, expander, resource allocation
  { file: 'shaders/tests/test_compiler_phase2.js', parity: false },
  { file: 'shaders/tests/test_expander.js', parity: false },
  { file: 'shaders/tests/test_integration.js', parity: false },
  { file: 'shaders/tests/test_resources.js', parity: false },
  { file: 'shaders/tests/test_phase2_integration.js', parity: false },
  { file: 'shaders/tests/test_expander_palette.js', parity: false },
  { file: 'shaders/tests/test_palette_expansion.js', parity: false },
  { file: 'shaders/tests/test_outputs.js', parity: false },
  // Effect definition and shader structure
  { file: 'shaders/tests/test_post_shaders.js', parity: false },
  { file: 'shaders/tests/test_webgl_uniforms.js', parity: false },
  { file: 'shaders/tests/test_mode_ui_dependencies.mjs', parity: false },
  { file: 'shaders/tests/test_texture_material_modes.mjs', parity: false },
  { file: 'shaders/tests/test_lighting_height_map.js', parity: false },
  { file: 'shaders/tests/test_edge_renderscale_parity.mjs', parity: false },
  { file: 'shaders/tests/test_lowpoly_modifiers.mjs', parity: false },
  { file: 'shaders/tests/test_strokes_coherence.mjs', parity: false },
  { file: 'shaders/tests/test_wind_halftone_geometry.mjs', parity: false },
  // Renderer and host integration
  { file: 'shaders/tests/test_canvas_apply_step_params.js', parity: false },
  // External input (MIDI / audio)
  { file: 'shaders/tests/test_midi.js', parity: false },
  { file: 'shaders/tests/test_midi_audio_integration.js', parity: false },
  { file: 'test/mcp-config.test.js', parity: false },
  { file: 'test/docs-static-paths.test.js', parity: false, docs: true }
]

const skipParity = process.argv.includes('--skip-parity')
const skipDocs = process.argv.includes('--skip-docs')
const forwardedArgs = process.argv.filter((arg) => arg !== '--skip-parity' && arg !== '--skip-docs')

for (const entry of testEntries) {
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
