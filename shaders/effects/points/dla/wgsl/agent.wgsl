// DLA - Agent Walk Pass (Common Agent Architecture)
// Reads agent state from pointsEmit, performs random walk, detects sticking

struct Uniforms {
    diffuseActive: f32,
    stride: f32,
    inputWeight: f32,
    fieldActive: f32,
    attrition: f32,
    stateSize: i32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

struct FragmentOutputs {
    @location(0) outXYZ: vec4<f32>,
    @location(1) outVel: vec4<f32>,
    @location(2) outRGBA: vec4<f32>,
    @location(3) baseColor: vec4<f32>,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(2) var velTex: texture_2d<f32>;
@group(0) @binding(3) var rgbaTex: texture_2d<f32>;
@group(0) @binding(6) var diffuseTex: texture_2d<f32>;
@group(0) @binding(8) var baseColorTex: texture_2d<f32>;

fn selectedDiffuse(uv: vec2f) -> vec4f {
    let size = textureDimensions(diffuseTex, 0);
    let pixel = clamp(vec2i(clamp(uv, vec2f(0.0), vec2f(0.999999)) * vec2f(size)), vec2i(0), vec2i(size) - vec2i(1));
    return textureLoad(diffuseTex, pixel, 0);
}

// Color render/pointsEmit gives an agent spawned at pos.
fn spawnColor(pos: vec2f) -> vec4f {
    let dims = textureDimensions(inputTex);
    let sampled = textureLoad(inputTex, vec2<i32>(pos * vec2<f32>(dims)), 0);
    return select(vec4f(1.0), sampled, sampled.a > 0.0);
}

// The agent's color without a diffuse map. baseColorTex keeps it (alpha > 0)
// while a diffuse map is active and is cleared otherwise, so this is rgba
// unless the agent still carries a diffuse color and has not respawned.
fn baseColor(coord: vec2i, rgba: vec4f, pos: vec2f) -> vec4f {
    let kept = textureLoad(baseColorTex, coord, 0);
    if (kept.a == 0.0) { return rgba; }
    let spawnDelta = abs(round(rgba * 255.0) - round(clamp(spawnColor(pos), vec4f(0.0), vec4f(1.0)) * 255.0));
    return select(kept, rgba, all(spawnDelta <= vec4f(1.0)));
}

fn keptBaseColor(base: vec4f) -> vec4f {
    return select(vec4f(0.0), vec4f(base.rgb, max(base.a, 1.0 / 255.0)), u.diffuseActive > 0.5);
}

@group(0) @binding(4) var gridTex: texture_2d<f32>;
@group(0) @binding(5) var inputTex: texture_2d<f32>;
@group(0) @binding(7) var heightTex: texture_2d<f32>;

// Integer-based hash for deterministic randomness
fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

// PCG-style random using float seed (stored as bits)
fn rand(seed: ptr<function, f32>) -> f32 {
    var bits = bitcast<u32>(*seed);
    bits = hash_uint(bits);
    *seed = bitcast<f32>((bits & 0x007FFFFFu) | 0x3F800000u) - 1.0;
    bits = hash_uint(bits + 1u);
    *seed = bitcast<f32>((bits & 0x007FFFFFu) | 0x3F800000u) - 1.0;
    return *seed;
}

fn randomDirection(seed: ptr<function, f32>) -> vec2<f32> {
    let theta = rand(seed) * 6.28318530718;
    return vec2<f32>(cos(theta), sin(theta));
}

fn wrap01(v: vec2<f32>) -> vec2<f32> {
    return fract(max(v, vec2<f32>(0.0)));
}

fn sampleGrid(uv: vec2<f32>) -> f32 {
    let dims = vec2<f32>(textureDimensions(gridTex));
    let coord = vec2<i32>(wrap01(uv) * dims);
    return textureLoad(gridTex, coord, 0).a;
}

fn neighborhood(uv: vec2<f32>, radius: f32) -> f32 {
    let dims = vec2<f32>(textureDimensions(gridTex));
    let texel = radius / dims;
    var accum = 0.0;
    accum += sampleGrid(uv);
    accum += sampleGrid(uv + vec2<f32>(texel.x, 0.0));
    accum += sampleGrid(uv - vec2<f32>(texel.x, 0.0));
    accum += sampleGrid(uv + vec2<f32>(0.0, texel.y));
    accum += sampleGrid(uv - vec2<f32>(0.0, texel.y));
    return accum * 0.2;
}

@fragment
fn main(in: VertexOutput) -> FragmentOutputs {
    let coord = vec2<i32>(in.position.xy);
    let stateDims = textureDimensions(xyzTex);
    
    // Read input state from pipeline (from pointsEmit)
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);
    let base = baseColor(coord, rgba, xyz.xy);
    
    // Extract state
    var pos = xyz.xy;
    let alive = xyz.w;
    
    // vel.x = seed, vel.y = justStuck flag, vel.w = agentRand from emitter
    var seed = vel.x;
    let agentRand = vel.w;
    
    // Initialize or evolve seed using per-particle deterministic chain (matches GLSL)
    let agentId = u32(coord.x + coord.y * i32(stateDims.x));
    if (seed <= 0.0) {
        seed = hash(agentId) + 0.001;
    }
    let frameSeed = hash_uint(agentId * 31u + bitcast<u32>(seed));
    seed = bitcast<f32>((frameSeed & 0x007FFFFFu) | 0x3F800000u) - 1.0;
    
    // If not alive, pass through (waiting for respawn from pointsEmit)
    if (alive < 0.5) {
        return FragmentOutputs(
            xyz,
            vec4<f32>(seed, 0.0, 0.0, agentRand),
            rgba,
            keptBaseColor(base)
        );
    }
    
    // Grid dimensions for step size
    let gridDims = vec2<f32>(textureDimensions(gridTex));
    let texel = 1.0 / max(gridDims.x, gridDims.y);
    
    // Check proximity to existing structure
    let local = neighborhood(pos, 2.0);
    let proximity = smoothstep(0.015, 0.12, local);
    
    // Random direction for walk
    let randomDir = randomDirection(&seed);
    
    // Input-weighted direction
    let inputW = u.inputWeight / 100.0;
    var stepDir = randomDir;
    if (inputW > 0.0) {
        let inputDims = select(textureDimensions(inputTex), textureDimensions(heightTex), u.fieldActive > 0.5);
        let inputCoord = vec2<i32>(wrap01(pos) * vec2<f32>(inputDims));
        let inputVal = select(textureLoad(inputTex, inputCoord, 0), textureLoad(heightTex, inputCoord, 0), u.fieldActive > 0.5);
        var inputDir = inputVal.xy * 2.0 - 1.0;
        if (length(inputDir) > 0.01) {
            inputDir = normalize(inputDir);
            stepDir = normalize(mix(randomDir, inputDir, inputW));
        }
    }
    
    // Step size: slow down near structure for finer aggregation
    let stepSize = (u.stride / 10.0) * texel * mix(3.0, 0.5, proximity);
    
    // Add wander jitter
    stepDir += randomDirection(&seed) * 0.3;
    stepDir = normalize(stepDir);
    
    // Move agent
    let candidate = wrap01(pos + stepDir * stepSize);
    
    // Check for sticking - require direct adjacency (radius 1.0)
    let here = sampleGrid(candidate);
    let nearby = neighborhood(candidate, 1.0);
    
    // Stick if adjacent to structure but local spot is empty
    let stuck = (nearby > 0.3 && here < 0.5);
    
    // Attrition: random respawn (0-10 scale → 0-0.1)
    var needsRespawn = false;
    if (u.attrition > 0.0) {
        let attritionRate = u.attrition * 0.01;
        if (rand(&seed) < attritionRate) {
            needsRespawn = true;
        }
    }
    
    if (stuck) {
        // Agent stuck: mark as dead for respawn, flag justStuck for deposit
        return FragmentOutputs(
            vec4<f32>(candidate, 0.0, 0.0),  // w=0 signals death to pointsEmit
            vec4<f32>(seed, 1.0, 0.0, agentRand),  // y=1 signals "just stuck" for depositGrid
            select(base, selectedDiffuse(candidate), u.diffuseActive > 0.5),
            keptBaseColor(base)
        );
    } else if (needsRespawn) {
        // Attrition death: mark for respawn
        return FragmentOutputs(
            vec4<f32>(candidate, 0.0, 0.0),  // w=0 signals death
            vec4<f32>(seed, 0.0, 0.0, agentRand),  // y=0, not stuck
            select(base, selectedDiffuse(candidate), u.diffuseActive > 0.5),
            keptBaseColor(base)
        );
    } else {
        // Continue walking
        return FragmentOutputs(
            vec4<f32>(candidate, 0.0, 1.0),  // w=1 alive
            vec4<f32>(seed, 0.0, 0.0, agentRand),
            select(base, selectedDiffuse(candidate), u.diffuseActive > 0.5),
            keptBaseColor(base)
        );
    }
}
