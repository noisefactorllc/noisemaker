import { simplex } from '../js/noisemaker/simplex.js'
import { spawnSync } from 'child_process'

// 16 by 16 reaches every 3D gradient, so a change to any entry of the
// JavaScript gradient table fails the comparison.
const shape = [16, 16]
const time = 0.25
const seed = 12345
const speed = 1.0
const js = simplex([...shape], { time, seed, speed })
const jsVals = Array.from(js.read()).slice(0, shape[0]*shape[1])

const pyCode = `
from noisemaker.simplex import simplex
import json
data=simplex([${shape[0]}, ${shape[1]}], time=${time}, seed=${seed}, speed=${speed}, as_np=True)
print(json.dumps(data[:, :, 0].tolist()))
`
const py = spawnSync('python3', ['-'], { input: pyCode, encoding: 'utf8' })
if (py.status !== 0) {
  console.error(py.stderr)
  process.exit(py.status)
}
const pyVals = JSON.parse(py.stdout.trim()).flat()

let diff = 0
for (let i = 0; i < jsVals.length; i++) {
  diff += Math.abs(jsVals[i] - pyVals[i])
}
diff /= jsVals.length
console.log('mean absolute diff', diff)
if (diff > 1e-6) {
  throw new Error('Regression mismatch')
}
console.log('Regression tests passed')
