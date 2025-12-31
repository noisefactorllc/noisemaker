// Physarum agent update shader - Common Agent Architecture
// Reads xyz/vel/rgba from pipeline, applies sensor-based steering

struct Uniforms {
    resolution: vec2f,
    time: f32,
    moveSpeed: f32,
    turnSpeed: f32,
    sensorAngle: f32,
    sensorDistance: f32,
    inputWeight: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(3) var velTex: texture_2d<f32>;
@group(0) @binding(5) var rgbaTex: texture_2d<f32>;
@group(0) @binding(7) var trailTex: texture_2d<f32>;
@group(0) @binding(8) var trailSampler: sampler;
@group(0) @binding(9) var inputTex: texture_2d<f32>;
@group(0) @binding(10) var inputSampler: sampler;

struct Outputs {
    @location(0) outXYZ: vec4f,
    @location(1) outVel: vec4f,
    @location(2) outRGBA: vec4f,
}

const TAU: f32 = 6.28318530718;

// Hash functions
fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

fn hash_f(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453123);
}

// Wrap position to [0,1]
fn wrapPosition(pos: vec2f) -> vec2f {
    return fract(pos + vec2f(1.0));
}

fn luminance(color: vec3f) -> f32 {
    return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

// Sample trail at normalized UV
fn sampleTrail(uv: vec2f) -> f32 {
    return luminance(textureSampleLevel(trailTex, trailSampler, uv, 0.0).rgb);
}

// Sample input texture for external field attraction
fn sampleExternalField(uv: vec2f, weight: f32) -> f32 {
    if (weight <= 0.0) { return 0.0; }
    let blend = clamp(weight * 0.01, 0.0, 1.0);
    return luminance(textureSampleLevel(inputTex, inputSampler, uv, 0.0).rgb) * blend * 0.05;
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> Outputs {
    let stateSize = vec2i(textureDimensions(xyzTex, 0));
    let coord = vec2i(i32(fragCoord.x), i32(fragCoord.y));
    
    // Read current state
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);
    
    var pos = xyz.xy;           // Normalized [0,1]
    var heading = xyz.z;        // Radians
    let alive = xyz.w;
    let age = vel.z;
    let seed = vel.w;
    
    // Check if agent is dead (needs respawn by pointsEmit)
    if (alive < 0.5) {
        // Pass through - pointsEmit will handle respawn
        // Initialize heading from seed
        return Outputs(
            vec4f(pos, hash(u32(seed * 1000.0)) * TAU, 0.0),
            vel,
            rgba
        );
    }
    
    // Attrition is now handled by pointsEmit
    
    // Compute sensor positions in normalized coords
    let forwardDir = vec2f(cos(heading), sin(heading));
    let leftDir = vec2f(cos(heading - u.sensorAngle), sin(heading - u.sensorAngle));
    let rightDir = vec2f(cos(heading + u.sensorAngle), sin(heading + u.sensorAngle));
    
    let sensorPosF = wrapPosition(pos + forwardDir * u.sensorDistance);
    let sensorPosL = wrapPosition(pos + leftDir * u.sensorDistance);
    let sensorPosR = wrapPosition(pos + rightDir * u.sensorDistance);
    
    // Sample trail + external field at sensor positions
    let valF = sampleTrail(sensorPosF) + sampleExternalField(sensorPosF, u.inputWeight);
    let valL = sampleTrail(sensorPosL) + sampleExternalField(sensorPosL, u.inputWeight);
    let valR = sampleTrail(sensorPosR) + sampleExternalField(sensorPosR, u.inputWeight);
    
    // Steering logic
    var newHeading = heading;
    if (valF > valL && valF > valR) {
        // Forward is best, keep going
    } else if (valF < valL && valF < valR) {
        // Forward is worst, turn randomly
        newHeading += (hash_f(u.time + pos.x) - 0.5) * 2.0 * u.turnSpeed * u.moveSpeed;
    } else if (valL > valR) {
        // Turn left
        newHeading -= u.turnSpeed * u.moveSpeed;
    } else if (valR > valL) {
        // Turn right
        newHeading += u.turnSpeed * u.moveSpeed;
    }
    
    // Move forward
    let moveDir = vec2f(cos(newHeading), sin(newHeading));
    
    // Speed modulation from input texture
    var speedScale = 1.0;
    let blend = clamp(u.inputWeight * 0.01, 0.0, 1.0);
    if (blend > 0.0) {
        let localInput = luminance(textureSampleLevel(inputTex, inputSampler, pos, 0.0).rgb);
        // Invert: slow in bright, fast in dark
        speedScale = mix(1.0, mix(1.8, 0.35, localInput), blend);
    }
    
    // Scale moveSpeed to normalized coords
    let normalizedSpeed = u.moveSpeed * 0.001 * speedScale;
    let newPos = wrapPosition(pos + moveDir * normalizedSpeed);
    
    // Update age
    let newAge = age + 0.016;
    
    // Output
    return Outputs(
        vec4f(newPos, newHeading, 1.0),  // alive = 1
        vec4f(0.0, 0.0, newAge, seed),
        rgba  // Color unchanged
    );
}
