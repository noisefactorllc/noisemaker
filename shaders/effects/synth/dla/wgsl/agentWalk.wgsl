// DLA - Agent Walk Pass

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

struct FragmentOutputs {
    @location(0) outState: vec4<f32>,
    @location(1) outColor: vec4<f32>,
}

@group(0) @binding(0) var agentTex: texture_2d<f32>;
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var gridTex: texture_2d<f32>;
@group(0) @binding(3) var tex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> inputWeight: f32;
@group(0) @binding(5) var<uniform> attrition: f32;
@group(0) @binding(6) var<uniform> stride: f32;
@group(0) @binding(7) var<uniform> density: f32;
@group(0) @binding(8) var<uniform> frame: i32;
@group(0) @binding(9) var<uniform> resetState: i32;
@group(0) @binding(10) var<uniform> colorMode: i32;  // 0 = mono (white), 1 = sample from tex

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
    let dims = vec2<f32>(textureDimensions(gridTex));
    
    // Try to find a spawn position away from existing structure
    // Use threshold of 0.05 (half the sticking threshold) to spawn safely away
    for (var attempt = 0; attempt < 8; attempt++) {
        let rx = rand(seed);
        let ry = rand(seed);
        let jitter = vec2<f32>(hash21(uv + *seed), hash21(uv + *seed * 1.7));
        let candidate = wrap01(vec2<f32>(rx, ry) + jitter * 0.15);
        
        // Check if this spot is clear of structure
        let coord = vec2<i32>(candidate * dims);
        let nearby = textureLoad(gridTex, coord, 0).a;
        if (nearby < 0.05) {
            return candidate;
        }
        *seed = nextSeed(*seed);
    }
    // Fallback: return last attempt anyway
    let rx = rand(seed);
    let ry = rand(seed);
    return wrap01(vec2<f32>(rx, ry));
}

@fragment
fn main(in: VertexOutput) -> FragmentOutputs {
    let agentDims = vec2<f32>(textureDimensions(agentTex));
    let gridDims = vec2<f32>(textureDimensions(gridTex));
    let coord = vec2<i32>(in.position.xy);
    let uv = (vec2<f32>(coord) + 0.5) / agentDims;
    
    // Density check
    let densityNorm = density / 100.0;
    let agentId = hash21(uv * 123.45);
    if (agentId > densityNorm) {
        return FragmentOutputs(vec4<f32>(0.0), vec4<f32>(0.0));
    }
    
    let prev = textureLoad(agentTex, coord, 0);
    let prevColor = textureLoad(colorTex, coord, 0);
    var pos = prev.xy;
    var seed = prev.z;
    var stuckPrev = prev.w;
    var agentColor = prevColor.rgb;
    
    var respawn = false;
    if (frame <= 1 || seed <= 0.0 || resetState != 0) { respawn = true; }
    if (stuckPrev > 0.5) { respawn = true; }
    
    // Attrition (0-10% → 0-0.1)
    let attritionNorm = attrition / 100.0;
    var seedCopy = seed;
    if (rand(&seedCopy) < attritionNorm) { respawn = true; }
    
    let justSpawned = respawn;
    if (respawn) {
        seed = hash21(uv + f32(frame) * 0.013) + 0.6180339887;
        pos = spawnPosition(uv, &seed);
        stuckPrev = 0.0;
        
        // Sample color from input at spawn position
        if (colorMode == 0) {
            // Mono mode - use white
            agentColor = vec3<f32>(1.0);
        } else {
            let texDims = vec2<f32>(textureDimensions(tex));
            let texCoord = vec2<i32>(pos * texDims);
            let inputColor = textureLoad(tex, texCoord, 0);
            agentColor = inputColor.rgb;
        }
    }
    
    let texel = 1.0 / max(gridDims.x, gridDims.y);
    let baseStep = (stride / 10.0) * texel;
    
    let local = neighborhood(pos, 4.0);
    let proximity = smoothstep(0.015, 0.12, local);
    
    let randomDir = randomDirection(&seed);
    
    let inputW = inputWeight / 100.0;
    var inputDir = vec2<f32>(0.0);
    if (inputW > 0.0) {
        let inputDims = vec2<f32>(textureDimensions(tex));
        let inputCoord = vec2<i32>(wrap01(pos) * inputDims);
        let inputVal = textureLoad(tex, inputCoord, 0);
        inputDir = inputVal.xy * 2.0 - 1.0;
        if (length(inputDir) < 0.01) {
            inputDir = randomDir;
        } else {
            inputDir = normalize(inputDir);
        }
    }
    
    let stepDirRaw = mix(randomDir, inputDir, inputW);
    var stepDir = normalize(stepDirRaw);
    
    // Step size directly from stride (stride=10 means 1 pixel)
    // Slow down near structure for finer aggregation
    let stepSize = (stride / 10.0) * texel * mix(3.0, 0.5, proximity);
    
    // Add some wander/jitter
    stepDir += randomDirection(&seed) * 0.3;
    stepDir = normalize(stepDir);
    
    var candidate = wrap01(pos + stepDir * stepSize);
    
    // Check for sticking - need nearby structure but empty local spot
    // Use higher threshold (0.1) so agents only stick near actual cluster, not diffused trail
    let here = sampleCluster(candidate);
    let nearby = neighborhood(candidate, 3.0);
    var stuck = 0.0;
    if (!justSpawned && nearby > 0.1 && here < 0.5) { stuck = 1.0; }
    
    return FragmentOutputs(
        vec4<f32>(candidate, max(seed, 1e-4), stuck),
        vec4<f32>(agentColor, 1.0)
    );
}
