import { test, expect } from '@playwright/test'

const STATUS_TIMEOUT = 10_000

async function waitForCompileStatus(page) {
  const handle = await page.waitForFunction(() => {
    const status = document.getElementById('status')
    if (!status) return null
    const text = (status.textContent || '').toLowerCase()
    if (!text.trim()) return null
    if (text.includes('compilation failed')) {
      return { state: 'error', message: status.textContent || '' }
    }
    if (text.includes('compiled')) {
      return { state: 'ok', message: status.textContent || '' }
    }
    return null
  }, { timeout: STATUS_TIMEOUT })

  const result = await handle.jsonValue()
  if (result.state === 'error') {
     // Dump console logs if we hit an error
     await page.evaluate(() => {
         // This is a bit tricky since we are capturing logs in the node process via page.on('console')
         // But we can't access that here easily inside the browser context.
         // However, we can just return the result and let the test fail, but we want to see the logs.
         return []
     })
  }
  return result
}

async function exerciseParameterControls(page) {
  const parametersRoot = page.locator('#parameters')

  // Allow controls to render after the effect switches
  await page.waitForTimeout(5)

  // Toggle any toggle-switch components to ensure uniform updates propagate
  const toggleLocator = parametersRoot.locator('toggle-switch')
  const toggleCount = await toggleLocator.count()
  for (let i = 0; i < toggleCount; i += 1) {
    const toggle = toggleLocator.nth(i)
    // Toggle by clicking (which fires change event)
    await toggle.click()
    // Toggle back
    await toggle.click()
  }

  // Walk all select inputs and choose a deterministic alternate option when available
  const selectHandles = await parametersRoot.locator('select').elementHandles()
  for (const select of selectHandles) {
    // Skip the global effect selector
    const id = await select.evaluate(node => node.id || '')
    if (id === 'effect-select') continue

    const selected = await select.evaluate(node => node.value)
    const options = await select.evaluate(node => node instanceof HTMLSelectElement
      ? Array.from(node.options).map(opt => opt.value)
      : [])
    const alternative = options.find(value => value !== selected) ?? selected
    if (alternative !== selected) {
      await select.selectOption(alternative)
      await select.selectOption(selected)
    }
  }

  // Adjust sliders to trigger change handlers
  const sliderHandles = await parametersRoot.locator('input[type="range"]').elementHandles()
  for (const slider of sliderHandles) {
    await slider.evaluate(node => {
      const min = node.min === '' ? -Infinity : Number(node.min)
      const max = node.max === '' ? Infinity : Number(node.max)
      const current = Number(node.value)
      const hasFiniteMin = Number.isFinite(min)
      const hasFiniteMax = Number.isFinite(max)
      const hasRange = hasFiniteMin && hasFiniteMax && max > min

      const fallbackStep = hasRange ? Math.max((max - min) / 10, 0.0001) : 0.1
      const declaredStep = node.step === '' ? fallbackStep : Number(node.step)
      const step = Number.isFinite(declaredStep) && declaredStep !== 0 ? Math.abs(declaredStep) : fallbackStep

      const isNormalizedRange = hasRange && min >= 0 && max <= 1
      if (isNormalizedRange) {
        const target = min + (max - min) * 0.6
        node.value = `${target}`
        node.dispatchEvent(new Event('input', { bubbles: true }))
        node.dispatchEvent(new Event('change', { bubbles: true }))
        return
      }

      let target = current + step

      if (hasRange && (target > max || !Number.isFinite(target))) {
        target = current - step
      }

      if (hasRange && (target < min || !Number.isFinite(target))) {
        target = min + Math.min(step, (max - min) * 0.25)
      }

      if (!Number.isFinite(target) || Math.abs(target - current) < 1e-6) {
        if (hasRange) {
          const midpoint = min + (max - min) * 0.5
          if (Math.abs(midpoint - current) > 1e-6) {
            target = midpoint
          } else {
            target = Math.min(max, Math.max(min, current + step || 0.1))
          }
        } else {
          target = current + (step || 0.1)
        }
      }

      if (hasRange && Math.abs(target) < 1e-6 && Math.abs(current) < 1e-6) {
        target = Math.min(max, Math.max(min, current + step))
      }

      node.value = `${target}`
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  // Update color inputs with a fixed color to exercise vec4 translation
  const colorHandles = await parametersRoot.locator('input[type="color"]').elementHandles()
  const palette = ['#00ffcc', '#ff0066', '#3366ff', '#ffcc00']
  for (let i = 0; i < colorHandles.length; i += 1) {
    const colorInput = colorHandles[i]
    const colorValue = palette[i % palette.length]
    await colorInput.evaluate((node, value) => {
      node.value = value
      node.dispatchEvent(new Event('input', { bubbles: true }))
      node.dispatchEvent(new Event('change', { bubbles: true }))
    }, colorValue)
  }

  // Activate any momentary buttons to verify button uniforms
  const buttonLocator = parametersRoot.locator('button')
  const buttonCount = await buttonLocator.count()
  for (let i = 0; i < buttonCount; i += 1) {
    const button = buttonLocator.nth(i)
    await button.click({ delay: 10 })
  }
}

test.describe.configure({ mode: 'serial' })

test('demo renders all available effects without console errors', async ({ page }) => {
  const consoleMessages = []

  // Allow BACKEND env var to select 'glsl' or 'wgsl', or auto-detect based on WebGPU availability
  // The test will use WGSL if: BACKEND=wgsl env var is set, OR if 'webgpu' is in the project name
  const backendEnv = process.env.BACKEND || ''
  const projectName = test.info().project.name || ''
  const useWGSL = backendEnv === 'wgsl' || projectName.includes('webgpu')

  page.setDefaultTimeout(STATUS_TIMEOUT)
  page.setDefaultNavigationTimeout(STATUS_TIMEOUT)

    page.on('console', msg => {
      const text = msg.text()
      // Skip expected 404 errors for missing shader files
      if (text.includes('Failed to load resource') && text.includes('404')) {
        return
      }
      if (text.includes('Error') || text.includes('warning') || msg.type() === 'error') {
        // Try to get JSON args if possible
        const args = msg.args()
        Promise.all(args.map(arg => arg.jsonValue().catch(() => ''))).then(values => {
             const expanded = values.map(v => typeof v === 'object' ? JSON.stringify(v, null, 2) : v).join(' ')
             consoleMessages.push({ origin: 'console', text: `console: ${text} ${expanded}` })
        })
      }
    });  page.on('pageerror', error => {
    consoleMessages.push({ origin: 'pageerror', text: error.message })
  })

  // Navigate with backend query parameter if WGSL is requested
  const url = useWGSL ? '/demo/shaders/?backend=wgsl' : '/demo/shaders/'
  await page.goto(url)

  await page.waitForFunction(() => {
    const app = document.getElementById('app-container')
    return !!app && window.getComputedStyle(app).display !== 'none'
  }, { timeout: STATUS_TIMEOUT })

  await page.waitForFunction(() => document.querySelectorAll('#effect-select option').length > 0, {
    timeout: STATUS_TIMEOUT
  })

  // Verify the backend was set correctly
  if (useWGSL) {
    const backendSet = await page.evaluate(() => {
      return typeof window.__noisemakerCurrentBackend === 'function'
        && window.__noisemakerCurrentBackend() === 'wgsl'
    })
    expect(backendSet, 'WGSL backend should be active').toBe(true)
  }

  let effectValues = await page.$$eval('#effect-select option', options => options.map(option => option.value))
  expect(effectValues.length).toBeGreaterThan(0)

  const effectOnlyEnv = (process.env.EFFECT_ONLY || '').split(',')
    .map(value => value.trim())
    .filter(Boolean)

  if (effectOnlyEnv.length > 0) {
    // Support both exact matches and namespace prefixes (e.g., "nm" matches "nm/worms")
    effectValues = effectValues.filter(effect => {
      for (const filter of effectOnlyEnv) {
        // Exact match
        if (effect === filter) return true
        // Namespace prefix match (e.g., "nm" matches "nm/worms")
        if (effect.startsWith(filter + '/')) return true
      }
      return false
    })
    expect(effectValues.length, `No effects matched EFFECT_ONLY=${process.env.EFFECT_ONLY}`).toBeGreaterThan(0)
  }

  for (const effect of effectValues) {
    if (!effect) continue
    if (effect === 'classicNoisedeck/media-input') continue
    await test.step(`effect: ${effect}`, async () => {
      const baselineState = await page.evaluate(() => {
        const pipeline = window.__noisemakerRenderingPipeline
        if (!pipeline) {
          return { frame: 0, graphId: null }
        }
        return {
          frame: pipeline.frameIndex ?? 0,
          graphId: pipeline.graph?.id ?? null
        }
      })

      await page.selectOption('#effect-select', effect)
      const result = await waitForCompileStatus(page)
      if (result.state === 'error') {
        const errors = consoleMessages.map(msg => `${msg.origin}: ${msg.text}`).join('\n')
        console.log(`Console errors for ${effect}:\n${errors}`)
      }
      expect(result.state, `Compilation error for ${effect}: ${result.message}`).toBe('ok')
      await exerciseParameterControls(page)
      await page.waitForTimeout(90)
      await page.waitForFunction(({ frame, graphId }) => {
        const pipeline = window.__noisemakerRenderingPipeline
        if (!pipeline) return false
        const currentFrame = pipeline.frameIndex ?? 0
        const currentGraphId = pipeline.graph?.id ?? null
        if (currentGraphId !== graphId || currentFrame < frame) {
          return currentFrame >= 9
        }
        return currentFrame >= frame + 9
      }, { timeout: STATUS_TIMEOUT }, baselineState)

      // Verify that the rendered output has more than one color
      // nd/physarum and stateful/prev rely on warm-up/feedback before diverging from black.

      // ***STOP***: Do *NOT* add effects to this list without explicit permission
      // nd/shape-mixer: Uses palette cycling with time - test readback sees uniform color at snapshot
      const skipColorCheck = ['filter/a', 'filter/solid', 'stateful/prev', 'classicNoisedeck/shape-mixer'].includes(effect)
        || effect.includes('feedback')
      if (!skipColorCheck) {
        const hasMultipleColors = await page.evaluate(async (effectName) => {
          const pipeline = window.__noisemakerRenderingPipeline
          if (!pipeline) {
            console.error('Pipeline unavailable when sampling output')
            return false
          }

          const backend = pipeline.backend
          const backendName = backend?.getName?.() || 'unknown'

          const surface = pipeline.surfaces?.get('o0')
          if (!surface) {
            console.error('Surface o0 not found on pipeline')
            return false
          }

          // WebGPU backend path
          if (backendName === 'WebGPU') {
            try {
              const result = await backend.readPixels(surface.read)
              if (!result || !result.data) {
                console.error('Failed to read pixels from WebGPU backend')
                return false
              }

              const { data } = result
              const stride = 17
              const firstR = data[0]
              const firstG = data[1]
              const firstB = data[2]
              const firstA = data[3]

              for (let i = stride * 4; i < data.length; i += stride * 4) {
                if (data[i] !== firstR ||
                    data[i + 1] !== firstG ||
                    data[i + 2] !== firstB ||
                    data[i + 3] !== firstA) {
                  return true
                }
              }

              console.error(`Monochromatic color for ${effectName} (WebGPU): R=${firstR}, G=${firstG}, B=${firstB}, A=${firstA}`)
              return false
            } catch (err) {
              console.error(`WebGPU readPixels failed for ${effectName}:`, err.message || err)
              return false
            }
          }

          // WebGL2 backend path
          const gl = backend?.gl
          if (!gl) {
            console.error('Backend GL context unavailable when sampling output')
            return false
          }

          const textureInfo = backend.textures?.get(surface.read)
          if (!textureInfo) {
            console.error(`Texture info missing for ${surface.read}`)
            return false
          }

          const { handle, width, height, glFormat } = textureInfo
          if (!handle || !width || !height) {
            return false
          }

          const fbo = gl.createFramebuffer()
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, handle, 0)

          const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
          if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error(`FBO incomplete for ${effectName}: 0x${status.toString(16)}`)
            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            gl.deleteFramebuffer(fbo)
            return false
          }

          const canReadFloat = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('WEBGL_color_buffer_float'))
          const useFloatRead = glFormat?.type === gl.HALF_FLOAT || glFormat?.type === gl.FLOAT
          const pixelCount = width * height
          const stride = 7

          let buffer
          let isMulti = false

          gl.finish()

          if (useFloatRead && canReadFloat) {
            buffer = new Float32Array(pixelCount * 4)
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, buffer)
          } else {
            buffer = new Uint8Array(pixelCount * 4)
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buffer)
          }

          const firstR = buffer[0]
          const firstG = buffer[1]
          const firstB = buffer[2]
          const firstA = buffer[3]

          for (let i = stride * 4; i < buffer.length; i += stride * 4) {
            if (buffer[i] !== firstR ||
                buffer[i + 1] !== firstG ||
                buffer[i + 2] !== firstB ||
                buffer[i + 3] !== firstA) {
              isMulti = true
              break
            }
          }

          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.deleteFramebuffer(fbo)

          if (!isMulti) {
            return { isMulti: false, r: firstR, g: firstG, b: firstB, a: firstA, texId: surface.read, frameIndex: pipeline.frameIndex, width, height }
          }

          return { isMulti: true }
        }, effect)

        const pixelResult = typeof hasMultipleColors === 'object' ? hasMultipleColors : { isMulti: hasMultipleColors }
        if (!pixelResult.isMulti && pixelResult.r !== undefined) {
          console.log(`Pixel sample for ${effect}: R=${pixelResult.r}, G=${pixelResult.g}, B=${pixelResult.b}, A=${pixelResult.a}, texId=${pixelResult.texId}, frame=${pixelResult.frameIndex}, size=${pixelResult.width}x${pixelResult.height}`)
        }

        expect(pixelResult.isMulti, `Effect ${effect} rendered a single solid color (monochromatic)`).toBe(true)
      }
    })
  }

  const failureMessage = consoleMessages.map(msg => `${msg.origin}: ${msg.text}`).join('\n')
  expect(consoleMessages.length, failureMessage).toBe(0)
})
