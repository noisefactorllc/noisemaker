import { PRESETS } from '../../js/noisemaker/presets.js'
import { Preset } from '../../js/noisemaker/composer.js'
import { setSeed as setValueSeed } from '../../js/noisemaker/value.js'

// Render one preset with the JavaScript port and print its pixels as JSON:
// {"shape": [height, width, channels], "tensor": <base64 little-endian float32>}.
const [, , name, seedStr, widthStr, heightStr] = process.argv
const seed = parseInt(seedStr, 10)
const width = parseInt(widthStr, 10)
const height = parseInt(heightStr, 10)

// Seed in the order of the Python CLI: value.set_seed(seed), PRESETS(),
// Preset(name). The Preset factory in noisemaker.presets calls PRESETS()
// a second time.
setValueSeed(seed)
PRESETS()
const preset = new Preset(name, PRESETS())
const tensor = await preset.render(seed, { width, height })
const data = await tensor.read()
const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
console.log(JSON.stringify({ shape: tensor.shape, tensor: bytes.toString('base64') }))
