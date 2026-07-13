/* Wind — 1:1 port of the coherent scanline integration in wind.glsl. */

// METHOD is a runtime-injected module-scope const (injectDefines, see
// definition.js `globals.method.define`). Dawn/naga constant-fold the
// wind/blast/stagger dispatch so only the active decay/taper/density/gain
// arm survives compilation.
struct Uniforms {
    direction: i32,
    strength: f32,
    threshold: f32,
    tileOffset: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const MAX_STEPS: i32 = 128;
const STEP_PX: f32 = 1.0;
const MAX_REACH: f32 = 128.0;

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let globalCoord = pos.xy + uniforms.tileOffset;
    let src = textureSample(inputTex, inputSampler, uv);

    let amount = clamp(uniforms.strength / 100.0, 0.0, 1.0);
    if (amount <= 0.0) {
        return src;
    }

    let reach = MAX_REACH * amount;
    let marchDir = select(1.0, -1.0, uniforms.direction == 0);
    var staggerPhase = 0.0;
    if (METHOD == 2) {
        staggerPhase = (0.5 + 0.5 * sin(globalCoord.y * 0.22))
            * min(12.0, reach * 0.18);
    }

    var accumColor = vec3<f32>(0.0);
    var accumWeight = 0.0;
    let baseLum = lum(src.rgb);
    let edge = uniforms.threshold / 100.0;

    for (var i: i32 = 1; i <= MAX_STEPS; i++) {
        let distancePx = f32(i) * STEP_PX;
        if (distancePx > reach) { break; }

        let sampleDistance = distancePx + staggerPhase;
        let sampleUV = clamp(
            (pos.xy + vec2<f32>(marchDir * sampleDistance, 0.0)) / texSize,
            vec2<f32>(0.0), vec2<f32>(1.0));
        let candidate = textureSample(inputTex, inputSampler, sampleUV).rgb;

        let contrast = lum(candidate) - baseLum - edge;
        let activation = smoothstep(0.0, 0.08, contrast);
        let alongRun = distancePx / max(reach, 1.0);
        var decayRate = 3.4;
        if (METHOD == 1) {
            decayRate = 0.8;
        } else if (METHOD == 2) {
            decayRate = 2.0;
        }
        var taperStart = 0.72;
        if (METHOD == 1) {
            taperStart = 0.82;
        }
        let endTaper = 1.0 - smoothstep(taperStart, 1.0, alongRun);
        let weight = activation * exp(-decayRate * alongRun) * endTaper;
        accumColor += candidate * weight;
        accumWeight += weight;
    }

    let integrated = accumColor / max(accumWeight, 0.00001);
    var densityRate = 0.16;
    if (METHOD == 1) {
        densityRate = 0.12;
    }
    let density = 1.0 - exp(-accumWeight * densityRate);
    var methodGain = 0.88;
    if (METHOD == 1) {
        methodGain = 1.0;
    }
    let blendAmount = clamp(density * amount * methodGain, 0.0, 1.0);
    let streak = mix(src.rgb, integrated, blendAmount);

    return vec4<f32>(max(src.rgb, streak), src.a);
}
