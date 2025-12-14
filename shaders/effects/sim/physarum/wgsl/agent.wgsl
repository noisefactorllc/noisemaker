/*
 * Physarum agent update shader (WGSL port).
 * Updates agent state: position, heading, and age.
 * Uses textureLoad for exact texel sampling (no interpolation).
 */

@group(0) @binding(0) var stateTex: texture_2d<f32>;
@group(0) @binding(1) var bufTex: texture_2d<f32>;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: Uniforms;

struct Uniforms {
    time: f32,
    deltaTime: f32,
    frame: i32,
    _pad0: f32,
    resolution: vec2f,
    aspect: f32,
    moveSpeed: f32,
    turnSpeed: f32,
    sensorAngle: f32,
    sensorDistance: f32,
    lifetime: f32,
    weight: f32,
    resetState: i32,
    spawnPattern: i32,
}

const TAU: f32 = 6.28318530718;

fn hash(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453123);
}

fn wrap_int(value: i32, size: i32) -> i32 {
    if (size <= 0) { return 0; }
    var result = value % size;
    if (result < 0) { result = result + size; }
    return result;
}

fn wrap_float(value: f32, size: f32) -> f32 {
    if (size <= 0.0) { return 0.0; }
    let scaled = floor(value / size);
    var wrapped = value - scaled * size;
    if (wrapped < 0.0) { wrapped = wrapped + size; }
    return wrapped;
}

fn wrapPosition(position: vec2f, bounds: vec2f) -> vec2f {
    return vec2f(
        wrap_float(position.x, bounds.x),
        wrap_float(position.y, bounds.y)
    );
}

fn luminance(color: vec3f) -> f32 {
    return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

fn sampleBufAt(x: i32, y: i32, width: i32, height: i32) -> f32 {
    let wx = wrap_int(x, width);
    // Flip Y to match how bufTex is written via fragCoord
    let wy = wrap_int(height - 1 - y, height);
    return textureLoad(bufTex, vec2<i32>(wx, wy), 0).r;
}

fn sampleInputAt(x: i32, y: i32, width: i32, height: i32) -> vec3f {
    let wx = wrap_int(x, width);
    // Flip Y for input texture
    let wy = wrap_int(height - 1 - y, height);
    return textureLoad(inputTex, vec2<i32>(wx, wy), 0).rgb;
}

fn sampleExternalField(x: i32, y: i32, width: i32, height: i32, weightVal: f32) -> f32 {
    if (weightVal <= 0.0) {
        return 0.0;
    }
    let blend = clamp(weightVal * 0.01, 0.0, 1.0);
    return luminance(sampleInputAt(x, y, width, height)) * blend;
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let stateSize = vec2<i32>(textureDimensions(stateTex, 0));
    let coord = vec2<i32>(i32(fragCoord.x), i32(fragCoord.y));
    
    // Read current agent state using textureLoad (exact texel, no interpolation)
    let agent = textureLoad(stateTex, coord, 0);
    var pos = agent.xy;
    var heading = agent.z;
    var age = agent.w;

    let width = i32(u.resolution.x);
    let height = i32(u.resolution.y);

    // Initialization / Reset
    let needsInit = u.resetState != 0 || (pos.x == 0.0 && pos.y == 0.0 && age == 0.0);
    if (needsInit) {
        let agentIndex = f32(coord.y * stateSize.x + coord.x);
        let seed = u.time + agentIndex;
        
        if (u.spawnPattern == 1) { // Clusters
            let clusterId = floor(hash(seed) * 5.0);
            let center = vec2f(hash(clusterId), hash(clusterId + 0.5)) * u.resolution;
            let r = hash(seed + 1.0) * min(u.resolution.x, u.resolution.y) * 0.15;
            let a = hash(seed + 2.0) * TAU;
            pos = center + vec2f(cos(a), sin(a)) * r;
            heading = hash(seed + 3.0) * TAU;
        } else if (u.spawnPattern == 2) { // Ring
            let center = u.resolution * 0.5;
            let r = min(u.resolution.x, u.resolution.y) * 0.35 + (hash(seed) - 0.5) * 20.0;
            let a = hash(seed + 1.0) * TAU;
            pos = center + vec2f(cos(a), sin(a)) * r;
            heading = a + 1.5708; // Tangent
        } else if (u.spawnPattern == 3) { // Spiral
            let center = u.resolution * 0.5;
            let t = hash(seed) * 20.0; 
            let r = t * min(u.resolution.x, u.resolution.y) * 0.02;
            let a = t * TAU;
            pos = center + vec2f(cos(a), sin(a)) * r;
            heading = a + 1.5708;
        } else { // Random (0)
            pos.x = hash(seed) * u.resolution.x;
            pos.y = hash(seed + 1.0) * u.resolution.y;
            heading = hash(seed + 2.0) * TAU;
        }
        
        pos = wrapPosition(pos, u.resolution);
        age = hash(seed + 3.0) * u.lifetime;
        return vec4f(pos, heading, age);
    }

    // Lifetime respawn logic (0 = disabled)
    if (u.lifetime > 0.0) {
        let agentIndex = f32(coord.y * stateSize.x + coord.x);
        let agentFraction = agentIndex / f32(stateSize.x * stateSize.y);
        let spawnOffset = agentFraction * u.lifetime;
        
        if (age > u.lifetime) {
            let seed = u.time * agentIndex;
            pos.x = hash(seed) * u.resolution.x;
            pos.y = hash(seed + 1.0) * u.resolution.y;
            heading = hash(seed + 2.0) * TAU;
            age = spawnOffset;
            return vec4f(pos, heading, age);
        }
    }

    // Compute sensor positions
    let forwardDir = vec2f(cos(heading), sin(heading));
    let leftDir = vec2f(cos(heading - u.sensorAngle), sin(heading - u.sensorAngle));
    let rightDir = vec2f(cos(heading + u.sensorAngle), sin(heading + u.sensorAngle));

    let sensorPosF = wrapPosition(pos + forwardDir * u.sensorDistance, u.resolution);
    let sensorPosL = wrapPosition(pos + leftDir * u.sensorDistance, u.resolution);
    let sensorPosR = wrapPosition(pos + rightDir * u.sensorDistance, u.resolution);

    // Sample trail map + external field using integer coordinates (textureLoad)
    let valF = sampleBufAt(i32(sensorPosF.x), i32(sensorPosF.y), width, height) + 
               sampleExternalField(i32(sensorPosF.x), i32(sensorPosF.y), width, height, u.weight);
    let valL = sampleBufAt(i32(sensorPosL.x), i32(sensorPosL.y), width, height) + 
               sampleExternalField(i32(sensorPosL.x), i32(sensorPosL.y), width, height, u.weight);
    let valR = sampleBufAt(i32(sensorPosR.x), i32(sensorPosR.y), width, height) + 
               sampleExternalField(i32(sensorPosR.x), i32(sensorPosR.y), width, height, u.weight);

    // Steering
    if (valF > valL && valF > valR) {
        // Keep going forward
    } else if (valF < valL && valF < valR) {
        // Rotate randomly
        heading += (hash(u.time + pos.x) - 0.5) * 2.0 * u.turnSpeed * u.moveSpeed;
    } else if (valL > valR) {
        heading -= u.turnSpeed * u.moveSpeed;
    } else if (valR > valL) {
        heading += u.turnSpeed * u.moveSpeed;
    }

    // Move
    let dir = vec2f(cos(heading), sin(heading));
    var speedScale = 1.0;
    let blend = clamp(u.weight * 0.01, 0.0, 1.0);
    if (blend > 0.0) {
        // Use raw luminance for speed modulation (not scaled by weight)
        let localInput = luminance(sampleInputAt(i32(pos.x), i32(pos.y), width, height));
        speedScale = mix(1.0, mix(1.8, 0.35, localInput), blend);
    }
    pos += dir * (u.moveSpeed * speedScale);
    pos = wrapPosition(pos, u.resolution);

    // Update age
    age += 0.016;

    return vec4f(pos, heading, age);
}
