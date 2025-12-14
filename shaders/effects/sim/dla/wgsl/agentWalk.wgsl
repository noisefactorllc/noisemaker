// DLA - Agent Walk Pass
// Fragment shader matching GLSL agentWalk.glsl

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var agentTex: texture_2d<f32>;
@group(0) @binding(1) var gridTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> padding: f32;
@group(0) @binding(3) var<uniform> speed: f32;
@group(0) @binding(4) var<uniform> frame: i32;
@group(0) @binding(5) var<uniform> density: f32;
@group(0) @binding(6) var<uniform> seedDensity: f32;
@group(0) @binding(7) var<uniform> resetState: i32;

fn hash11(v: f32) -> f32 {
    var v2 = fract(v * 0.1031);
    v2 *= v2 + 33.33;
    v2 *= v2 + v2;
    return fract(v2);
}

fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, vec3<f32>(p3.z, p3.y, p3.x) + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

fn nextSeed(seed: f32) -> f32 {
    return fract(seed * 43758.5453123 + 0.2137);
}

fn rand(seed: ptr<function, f32>) -> f32 {
    *seed = nextSeed(*seed);
    return *seed;
}

fn randomDirection(seed: ptr<function, f32>) -> vec2<f32> {
    let theta = rand(seed) * 6.28318530718;
    return vec2<f32>(cos(theta), sin(theta));
}

fn wrap01(v: vec2<f32>) -> vec2<f32> {
    return fract(max(v, vec2<f32>(0.0)));
}

fn sampleCluster(uv: vec2<f32>) -> f32 {
    let dims = vec2<f32>(textureDimensions(gridTex));
    let coord = vec2<i32>(wrap01(uv) * dims);
    return textureLoad(gridTex, coord, 0).a;
}

fn neighborhood(uv: vec2<f32>, radius: f32) -> f32 {
    let dims = vec2<f32>(textureDimensions(gridTex));
    let texel = radius * vec2<f32>(1.0 / dims.x, 1.0 / dims.y);
    var accum = 0.0;
    accum += sampleCluster(uv);
    accum += sampleCluster(uv + vec2<f32>(texel.x, 0.0));
    accum += sampleCluster(uv - vec2<f32>(texel.x, 0.0));
    accum += sampleCluster(uv + vec2<f32>(0.0, texel.y));
    accum += sampleCluster(uv - vec2<f32>(0.0, texel.y));
    return accum * 0.2;
}

fn spawnPosition(uv: vec2<f32>, seed: ptr<function, f32>) -> vec2<f32> {
    let rx = rand(seed);
    let ry = rand(seed);
    let jitter = vec2<f32>(hash21(uv + *seed), hash21(uv + *seed * 1.7));
    return wrap01(vec2<f32>(rx, ry) + jitter * 0.15);
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    let agentDims = vec2<f32>(textureDimensions(agentTex));
    let gridDims = vec2<f32>(textureDimensions(gridTex));
    let coord = vec2<i32>(in.position.xy);
    let uv = (vec2<f32>(coord) + 0.5) / agentDims;
    
    let prev = textureLoad(agentTex, coord, 0);
    var pos = prev.xy;
    var seed = prev.z;
    var stuckPrev = prev.w;
    
    // Init or reset on first frame, invalid seed, or resetState requested
    if (frame <= 1 || seed <= 0.0 || resetState != 0) {
        seed = hash21(uv + f32(frame) * 0.013) + 0.6180339887;
        pos = spawnPosition(uv, &seed);
        stuckPrev = 0.0;
    }
    
    // Respawn if stuck
    if (stuckPrev > 0.5) {
        seed = nextSeed(seed + hash11(dot(uv, vec2<f32>(17.0, 23.0))));
        pos = spawnPosition(uv + seed, &seed);
        stuckPrev = 0.0;
    }
    
    let texel = 1.0 / max(gridDims.x, gridDims.y);
    let baseStep = max(padding, 1.0) * texel;
    var wander = mix(0.8, 2.5, clamp(density, 0.0, 1.0));
    wander += seedDensity * 6.0;
    let speedScale = clamp(speed, 0.25, 6.0);
    
    let local = neighborhood(pos, 4.0);
    let proximity = smoothstep(0.015, 0.12, local);
    
    var stepDir = randomDirection(&seed);
    let stepSize = mix(7.0, 1.25, proximity) * baseStep * speedScale;
    stepDir += randomDirection(&seed) * (wander - 0.8) * baseStep * 0.25;
    
    var candidate = wrap01(pos + stepDir * stepSize);
    let jitterStrength = 0.35 + seedDensity * 1.5;
    candidate += (rand(&seed) - 0.5) * texel * jitterStrength * vec2<f32>(0.75, -0.65);
    candidate = wrap01(candidate);
    
    let neighbourhoodVal = neighborhood(candidate, 2.0);
    let threshold = mix(0.06, 0.02, proximity);
    var stuck = 0.0;
    if (neighbourhoodVal > threshold) {
        stuck = 1.0;
    }
    
    return vec4<f32>(candidate, max(seed, 1e-4), stuck);
}
