import { test, expect } from '@playwright/test'

// Regression: Pipeline.renderCubemap() reads back 6 distinct cube faces on BOTH
// backends. WebGPU export reads the OFFSCREEN surface texture via copyTextureToBuffer
// (not the canvas/present texture), so it sidesteps the canvas IOSurface readback race
// that affects harness/canvas reads. A readback failure makes renderCubemap throw, so
// the functional assertions below ARE the readback test.
//
// Runs under shaders-chromium (WebGL2) and shaders-chromium-webgpu (WebGPU) projects.
test('renderCube exports 6 distinct cube faces (readback works on this backend)', async ({ page }) => {
  const projectName = test.info().project.name || ''
  const useWGSL = process.env.BACKEND === 'wgsl' || projectName.includes('webgpu')

  await page.goto(useWGSL ? '/demo/shaders/?backend=wgsl' : '/demo/shaders/')
  await page.waitForFunction(
    () => !!window.__noisemakerCanvasRenderer && !!window.__noisemakerCanvasRenderer.manifest,
    null, { timeout: 30000 })

  if (useWGSL) {
    expect(await page.evaluate(() => window.__noisemakerCurrentBackend?.()),
      'WGSL backend should be active').toBe('wgsl')
  }

  // Cube export only works when the graph terminates in renderCube fed by a 3D volume.
  const DSL = [
    'search synth3d, filter3d, render', '',
    'noise3d(volumeSize: x64)', '  .renderCube()', '  .write(o0)', '',
    'render(o0)',
  ].join('\n')

  const result = await page.evaluate(async (dsl) => {
    const r = window.__noisemakerCanvasRenderer
    await r.loadEffects(['synth3d/noise3d', 'render/renderCube'])
    await r.compile(dsl)
    const p = r.pipeline
    if (r.stop) r.stop() // pause RAF loop so the driver owns cubeBasis
    const faces = await p.renderCubemap({ size: 128, mode: 'volumetric' })
    const hash = (d) => { let h = 0; for (let i = 0; i < d.length; i += 997) h = (h * 31 + d[i]) >>> 0; return h }
    const f0 = faces[0].data
    let multicolor = false
    for (let i = 4; i < f0.length; i += 4) {
      if (f0[i] !== f0[0] || f0[i + 1] !== f0[1] || f0[i + 2] !== f0[2]) { multicolor = true; break }
    }
    return {
      count: faces.length,
      width: faces[0].width,
      distinct: new Set(faces.map((f) => hash(f.data))).size,
      multicolor,
    }
  }, DSL)

  expect(result.count, 'six faces returned').toBe(6)
  expect(result.width, 'faces at requested size').toBe(128)
  expect(result.multicolor, 'faces carry real pixel data (readback succeeded)').toBe(true)
  expect(result.distinct, 'all six faces distinct (cubeBasis varies per face)').toBe(6)
})
