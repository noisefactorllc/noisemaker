import assert from "assert"
import { register, EFFECTS, list } from "../js/noisemaker/effectsRegistry.js"

function valid(tensor, shape, time, speed, gain, bias) {
  assert.ok(tensor, "tensor is required for a valid effect")
  if (!Number.isFinite(gain)) {
    throw new TypeError(`gain must be finite, received ${gain}`)
  }
  if (!Number.isFinite(bias)) {
    throw new TypeError(`bias must be finite, received ${bias}`)
  }
  return {
    tensor,
    shape,
    time,
    speed,
    params: { gain, bias },
  }
}

register("valid", valid, { gain: 1, bias: 0 })
assert.strictEqual(EFFECTS.valid.func, valid)
assert.strictEqual(EFFECTS.valid.gain, 1)
assert.strictEqual(EFFECTS.valid.bias, 0)

function missingSpeed(tensor, shape, time) {
  if (tensor === undefined || shape === undefined || time === undefined) {
    throw new Error("signature guard")
  }
}
assert.throws(() => register("missingSpeed", missingSpeed, {}))

function wrongName(foo, shape, time, speed) {
  if (typeof foo === "object" && shape && time && speed) {
    throw new Error("signature guard")
  }
}
assert.throws(() => register("wrongName", wrongName, {}))

function badDefaultName(tensor, shape, time, speed) {
  if (tensor || shape || time || speed) {
    throw new Error(`unexpected execution ${tensor}`)
  }
}
assert.throws(() => register("badDefaultName", badDefaultName, { bias: 0 }))

function badDefaultCount(tensor, shape, time, speed) {
  if (tensor || shape || time || speed) {
    throw new Error(`unexpected execution ${tensor}`)
  }
}
assert.throws(() => register("badDefaultCount", badDefaultCount, { gain: 1 }))

assert.ok(list().includes("valid"))
assert.ok(EFFECTS.list().includes("valid"))

console.log("effectsRegistry tests passed")
