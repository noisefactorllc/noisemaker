import assert from 'assert'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cliPath = path.resolve(__dirname, '../js/bin/noisemaker-js')
const outputPath = path.resolve(__dirname, 'tmp-cli-output.png')
const applyInputPath = path.resolve(__dirname, 'tmp-cli-input.png')
const applyOutputPath = path.resolve(__dirname, 'tmp-cli-apply-output.png')

for (const file of [outputPath, applyInputPath, applyOutputPath]) {
  try {
    fs.unlinkSync(file)
  } catch (_) {
    /* ignore */
  }
}

const listGenerate = spawnSync('node', [cliPath, 'generate', '--help-presets'], {
  encoding: 'utf8',
})

if (listGenerate.status !== 0) {
  const stderr = listGenerate.stderr ? `\n${listGenerate.stderr}` : ''
  const stdout = listGenerate.stdout ? `\n${listGenerate.stdout}` : ''
  throw new Error(`CLI help-presets generate exited with status ${listGenerate.status}${stderr}${stdout}`)
}

assert.ok(listGenerate.stdout.includes('Available generator presets:'), 'Missing generator preset list header')

const listApply = spawnSync('node', [cliPath, 'apply', '--help-presets'], {
  encoding: 'utf8',
})

if (listApply.status !== 0) {
  const stderr = listApply.stderr ? `\n${listApply.stderr}` : ''
  const stdout = listApply.stdout ? `\n${listApply.stdout}` : ''
  throw new Error(`CLI help-presets apply exited with status ${listApply.status}${stderr}${stdout}`)
}

assert.ok(listApply.stdout.includes('Available effect presets:'), 'Missing effect preset list header')

const result = spawnSync('node', [cliPath, 'generate', 'basic', '--filename', outputPath, '--width', '32', '--height', '32', '--seed', '1'], {
  encoding: 'utf8',
})

if (result.status !== 0) {
  const stderr = result.stderr ? `\n${result.stderr}` : ''
  const stdout = result.stdout ? `\n${result.stdout}` : ''
  throw new Error(`CLI exited with status ${result.status}${stderr}${stdout}`)
}

assert.ok(fs.existsSync(outputPath), 'Output file was not created')
const stats = fs.statSync(outputPath)
assert.ok(stats.size > 0, 'Output file is empty')
const plainImage = fs.readFileSync(outputPath)

fs.unlinkSync(outputPath)

// --debug-print and --debug-out report the preset and still write the image
// that the same command writes without them.
const debugOutPath = path.resolve(__dirname, 'tmp-cli-debug.txt')
for (const debugArgs of [['--debug-print'], ['--debug-out', debugOutPath]]) {
  const debugResult = spawnSync('node', [cliPath, 'generate', 'basic', '--filename', outputPath, '--width', '32', '--height', '32', '--seed', '1', ...debugArgs], {
    encoding: 'utf8',
  })
  if (debugResult.status !== 0) {
    throw new Error(`CLI ${debugArgs[0]} exited with status ${debugResult.status}\n${debugResult.stderr}${debugResult.stdout}`)
  }
  const debugText = debugArgs[0] === '--debug-print' ? debugResult.stdout : fs.readFileSync(debugOutPath, 'utf8')
  assert.ok(debugText.includes('Lineage (by newest):'), `${debugArgs[0]} wrote no preset lineage`)
  const debugImage = PNG.sync.read(fs.readFileSync(outputPath))
  assert.strictEqual(debugImage.width, 32, `${debugArgs[0]} image width`)
  assert.strictEqual(debugImage.height, 32, `${debugArgs[0]} image height`)
  assert.ok(fs.readFileSync(outputPath).equals(plainImage), `${debugArgs[0]} changed the image`)
  fs.unlinkSync(outputPath)
}
fs.unlinkSync(debugOutPath)

const png = new PNG({ width: 8, height: 8 })
for (let y = 0; y < png.height; y += 1) {
  for (let x = 0; x < png.width; x += 1) {
    const idx = (y * png.width + x) * 4
    png.data[idx] = x * 32
    png.data[idx + 1] = y * 32
    png.data[idx + 2] = 128
    png.data[idx + 3] = 255
  }
}
const inputBuffer = PNG.sync.write(png)
fs.writeFileSync(applyInputPath, inputBuffer)

const applyResult = spawnSync('node', [cliPath, 'apply', 'aberration', applyInputPath, '--filename', applyOutputPath, '--seed', '1', '--no-resize'], {
  encoding: 'utf8',
})

if (applyResult.status !== 0) {
  const stderr = applyResult.stderr ? `\n${applyResult.stderr}` : ''
  const stdout = applyResult.stdout ? `\n${applyResult.stdout}` : ''
  throw new Error(`CLI apply exited with status ${applyResult.status}${stderr}${stdout}`)
}

assert.ok(fs.existsSync(applyOutputPath), 'Apply output file was not created')
const applyStats = fs.statSync(applyOutputPath)
assert.ok(applyStats.size > 0, 'Apply output file is empty')

// --seed 0 is a seed like any other, so two runs write the same image.
for (const command of [
  ['generate', 'basic', '--width', '32', '--height', '32'],
  ['apply', 'posterize', applyInputPath, '--no-resize'],
]) {
  const images = []
  for (let run = 0; run < 2; run += 1) {
    const seedResult = spawnSync('node', [cliPath, ...command, '--seed', '0', '--filename', applyOutputPath], {
      encoding: 'utf8',
    })
    if (seedResult.status !== 0) {
      throw new Error(`CLI ${command[0]} --seed 0 exited with status ${seedResult.status}\n${seedResult.stderr}${seedResult.stdout}`)
    }
    images.push(fs.readFileSync(applyOutputPath))
  }
  assert.ok(images[0].equals(images[1]), `${command[0]} --seed 0 wrote different images`)
}

fs.unlinkSync(applyInputPath)
fs.unlinkSync(applyOutputPath)

console.log('cli tests passed')
