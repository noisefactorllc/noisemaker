import noiseDefinition from '../effects/synth/noise/definition.js'
import { expand } from '../src/runtime/expander.js'
import { registerEffect } from '../src/runtime/registry.js'

registerEffect('noise', noiseDefinition)

function runNoise(args = {}) {
  const plan = {
    chain: [
      {
        op: 'noise',
        args: { ...args },
        from: null,
        temp: 0
      }
    ],
    write: 'o0'
  }

  const { passes, errors } = expand({ plans: [plan], diagnostics: [] })
  if (errors.length > 0) {
    throw new Error(`Expander reported errors: ${JSON.stringify(errors)}`)
  }

  const noisePass = passes.find((pass) => pass.effectKey === 'noise')
  if (!noisePass) {
    throw new Error('Noise pass not found in expanded graph')
  }

  return noisePass
}

function chooseVariantValue(name, spec) {
  if (spec.choices) {
    // Choice lists can hold null entries that label groups, not values.
    const value = Object.values(spec.choices).find((choice) => typeof choice === typeof spec.default && choice !== spec.default)
    if (value === undefined) {
      throw new Error(`No valid variant for choice control ${name}`)
    }
    return value
  }

  if (spec.type === 'boolean') {
    return !spec.default
  }

  if (spec.type === 'int') {
    if (spec.default + 1 <= spec.max) {
      return spec.default + 1
    }
    if (spec.default - 1 >= spec.min) {
      return spec.default - 1
    }
    throw new Error(`No valid variant for int control ${name}`)
  }

  if (spec.type === 'float') {
    const step = spec.step ?? 1
    const candidateUp = spec.default + step
    if (candidateUp <= spec.max) {
      return candidateUp
    }
    const candidateDown = spec.default - step
    if (candidateDown >= spec.min) {
      return candidateDown
    }
    const fallback = spec.max !== spec.default ? spec.max : spec.min
    if (fallback === spec.default) {
      throw new Error(`No valid variant for float control ${name}`)
    }
    return fallback
  }

  throw new Error(`Unsupported control type ${spec.type} on ${name}`)
}

function test(name, fn) {
  try {
    console.log(`Running test: ${name}`)
    fn()
    console.log(`PASS: ${name}`)
  } catch (error) {
    console.error(`FAIL: ${name}`)
    console.error(error)
    process.exit(1)
  }
}

test('Noise controls alter bound uniforms', () => {
  // colorMode choices are mono (0) and rgb (1, the default).
  const baseArgs = { colorMode: noiseDefinition.globals.colorMode.choices.mono }
  const basePass = runNoise(baseArgs)
  const baseUniforms = basePass.uniforms

  for (const [name, spec] of Object.entries(noiseDefinition.globals)) {
    if (name === 'colorMode') {
      continue
    }

    // A define control compiles its value into the pass program variant.
    if (spec.define) {
      const variantValue = chooseVariantValue(name, spec)
      const variantPass = runNoise({ ...baseArgs, [name]: variantValue })
      if (!variantPass.program.includes(`${spec.define}_${variantValue}`) || variantPass.program === basePass.program) {
        throw new Error(`Control ${name} did not compile define ${spec.define}=${variantValue} (program ${variantPass.program})`)
      }
      continue
    }

    const uniformName = spec.uniform
    if (!uniformName) {
      throw new Error(`Control ${name} is missing a uniform binding`)
    }

    if (!(uniformName in baseUniforms)) {
      throw new Error(`Uniform ${uniformName} was not bound in the base pass`)
    }

    const variantValue = chooseVariantValue(name, spec)
    const variantUniforms = runNoise({ ...baseArgs, [name]: variantValue }).uniforms

    if (variantUniforms[uniformName] === baseUniforms[uniformName]) {
      throw new Error(`Control ${name} did not modify uniform ${uniformName}`)
    }
  }

  const defaultUniforms = runNoise().uniforms
  const monoUniforms = runNoise({ colorMode: noiseDefinition.globals.colorMode.choices.mono }).uniforms
  if (defaultUniforms.colorMode === monoUniforms.colorMode) {
    throw new Error('colorMode control did not alter the colorMode uniform')
  }
})
