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

  // Cube export only works when the graph terminates in a cubemap renderer fed by a 3D volume.
  const DSL = [
    'search synth3d, filter3d, render', '',
    'noise3d(volumeSize: x64)', '  .renderCubemapSurface()', '  .write(o0)', '',
    'render(o0)',
  ].join('\n')

  const result = await page.evaluate(async (dsl) => {
    function cubemapSeamStats(faces) {
      const edgePairs = [
        { a: 0, aEdge: 'right', b: 4, bEdge: 'left' },
        { a: 4, aEdge: 'right', b: 1, bEdge: 'left' },
        { a: 1, aEdge: 'right', b: 5, bEdge: 'left' },
        { a: 2, aEdge: 'bottom', b: 4, bEdge: 'top' },
        { a: 4, aEdge: 'bottom', b: 3, bEdge: 'top' },
      ]

      const sample = (face, edge, i) => {
        const size = face.width
        const x = edge === 'left' ? 0 : edge === 'right' ? size - 1 : i
        const y = edge === 'top' ? 0 : edge === 'bottom' ? size - 1 : i
        const offset = (y * size + x) * 4
        const alpha = face.data[offset + 3] / 255
        return [
          face.data[offset] / 255 * alpha,
          face.data[offset + 1] / 255 * alpha,
          face.data[offset + 2] / 255 * alpha,
          alpha,
        ]
      }

      let worstMean = 0
      let worstMax = 0
      for (const pair of edgePairs) {
        const a = faces[pair.a]
        const b = faces[pair.b]
        let total = 0
        let max = 0
        for (let i = 0; i < a.width; i++) {
          const ca = sample(a, pair.aEdge, i)
          const cb = sample(b, pair.bEdge, i)
          const delta = (
            Math.abs(ca[0] - cb[0]) +
            Math.abs(ca[1] - cb[1]) +
            Math.abs(ca[2] - cb[2]) +
            Math.abs(ca[3] - cb[3])
          ) / 4
          total += delta
          max = Math.max(max, delta)
        }
        worstMean = Math.max(worstMean, total / a.width)
        worstMax = Math.max(worstMax, max)
      }
      return { worstMean, worstMax }
    }

    const r = window.__noisemakerCanvasRenderer
    await r.loadEffects(['synth3d/noise3d', 'render/renderCubemapSurface'])
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
      seam: cubemapSeamStats(faces),
    }
  }, DSL)

  expect(result.count, 'six faces returned').toBe(6)
  expect(result.width, 'faces at requested size').toBe(128)
  expect(result.multicolor, 'faces carry real pixel data (readback succeeded)').toBe(true)
  expect(result.distinct, 'all six faces distinct (cubeBasis varies per face)').toBe(6)
  expect(result.seam.worstMean, 'surface cube edges should not have hard discontinuities').toBeLessThan(0.09)
  expect(result.seam.worstMax, 'surface cube edges should not have large single-pixel breaks').toBeLessThan(0.45)
})

test('renderCubemapCloudShell exports transparent nonblank cloud faces', async ({ page }) => {
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

  const DSL = [
    'search synth3d, render', '',
    'noise3d(volumeSize: x32, octaves: 3, ridges: true, colorMode: rgb)',
    '  .renderCubemapCloudShell(bgAlpha: 0)',
    '  .write(o0)', '',
    'render(o0)',
  ].join('\n')

  const result = await page.evaluate(async (dsl) => {
    try {
      function cubemapSeamStats(faces) {
        const edgePairs = [
          { name: '+X|+Z', a: 0, aEdge: 'right', b: 4, bEdge: 'left' },
          { name: '+Z|-X', a: 4, aEdge: 'right', b: 1, bEdge: 'left' },
          { name: '-X|-Z', a: 1, aEdge: 'right', b: 5, bEdge: 'left' },
          { name: '+Y|+Z', a: 2, aEdge: 'bottom', b: 4, bEdge: 'top' },
          { name: '+Z|-Y', a: 4, aEdge: 'bottom', b: 3, bEdge: 'top' },
        ]

        const sample = (face, edge, i) => {
          const size = face.width
          const x = edge === 'left' ? 0 : edge === 'right' ? size - 1 : i
          const y = edge === 'top' ? 0 : edge === 'bottom' ? size - 1 : i
          const offset = (y * size + x) * 4
          const alpha = face.data[offset + 3] / 255
          return [
            face.data[offset] / 255 * alpha,
            face.data[offset + 1] / 255 * alpha,
            face.data[offset + 2] / 255 * alpha,
            alpha,
          ]
        }

        let worstMean = 0
        let worstMax = 0
        const pairs = []
        for (const pair of edgePairs) {
          const a = faces[pair.a]
          const b = faces[pair.b]
          let total = 0
          let max = 0
          for (let i = 0; i < a.width; i++) {
            const ca = sample(a, pair.aEdge, i)
            const cb = sample(b, pair.bEdge, i)
            const delta = (
              Math.abs(ca[0] - cb[0]) +
              Math.abs(ca[1] - cb[1]) +
              Math.abs(ca[2] - cb[2]) +
              Math.abs(ca[3] - cb[3])
            ) / 4
            total += delta
            max = Math.max(max, delta)
          }
          const mean = total / a.width
          pairs.push({ name: pair.name, mean, max })
          worstMean = Math.max(worstMean, mean)
          worstMax = Math.max(worstMax, max)
        }
        return { worstMean, worstMax, pairs }
      }

      const r = window.__noisemakerCanvasRenderer
      await r.loadEffects(['synth3d/noise3d', 'render/renderCubemapCloudShell'])
      await r.compile(dsl)
      const p = r.pipeline
      if (r.stop) r.stop()
      const faces = await p.renderCubemap({ size: 96 })

      let nonzeroRgb = false
      let alphaAboveZero = false
      let alphaBelowOpaque = false
      for (const face of faces) {
        const data = face.data
        for (let i = 0; i < data.length; i += 16) {
          if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) nonzeroRgb = true
          if (data[i + 3] > 0) alphaAboveZero = true
          if (data[i + 3] < 255) alphaBelowOpaque = true
          if (nonzeroRgb && alphaAboveZero && alphaBelowOpaque) break
        }
        if (nonzeroRgb && alphaAboveZero && alphaBelowOpaque) break
      }

      return {
        count: faces.length,
        width: faces[0].width,
        nonzeroRgb,
        alphaAboveZero,
        alphaBelowOpaque,
        seam: cubemapSeamStats(faces),
      }
    } catch (err) {
      const fallback = (() => {
        try { return JSON.stringify(err) } catch (_jsonErr) { return String(err) }
      })()
      return {
        error: err?.message || fallback,
        stack: err?.stack || '',
      }
    }
  }, DSL)

  expect(result.error || '', result.stack || '').toBe('')
  expect(result.count, 'six faces returned').toBe(6)
  expect(result.width, 'faces at requested size').toBe(96)
  expect(result.nonzeroRgb, 'cloud shell emits nonblack color').toBe(true)
  expect(result.alphaAboveZero, 'cloud shell contains visible alpha').toBe(true)
  expect(result.alphaBelowOpaque, 'cloud shell remains transparent somewhere').toBe(true)
  expect(result.seam.worstMean, JSON.stringify(result.seam)).toBeLessThan(0.09)
  expect(result.seam.worstMax, JSON.stringify(result.seam)).toBeLessThan(0.45)
})
