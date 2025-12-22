// Flow agent pass - Common Agent Architecture middleware
// Reads from global_xyz/vel/rgba, applies flow-field movement, writes back
// State format: xyz=[x, y, z, alive] vel=[vx, vy, rotRand, strideRand] rgba=[r, g, b, a]
// Positions in normalized coords [0,1]

struct Uniforms {
    resolution: vec2f,
    time: f32,
    stride: f32,
    strideDeviation: f32,
    kink: f32,
    quantize: f32,
    attrition: f32,
    inputWeight: f32,
    behavior: f32,
}

struct Outputs {
    @location(0) xyz: vec4f,
    @location(1) vel: vec4f,
    @location(2) rgba: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var xyzTex: texture_2d<f32>;
@group(0) @binding(4) var velTex: texture_2d<f32>;
@group(0) @binding(5) var rgbaTex: texture_2d<f32>;

const TAU: f32 = 6.283185307179586;
const RIGHT_ANGLE: f32 = 1.5707963267948966;

fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

fn srgb_to_linear(value: f32) -> f32 {
    if (value <= 0.04045) { return value / 12.92; }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn cube_root(value: f32) -> f32 {
    if (value == 0.0) { return 0.0; }
    let sign_value = select(-1.0, 1.0, value >= 0.0);
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

fn oklab_l(rgb: vec3f) -> f32 {
    let r_lin = srgb_to_linear(clamp(rgb.x, 0.0, 1.0));
    let g_lin = srgb_to_linear(clamp(rgb.y, 0.0, 1.0));
    let b_lin = srgb_to_linear(clamp(rgb.z, 0.0, 1.0));
    let l = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    let m = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    let s = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;
    return 0.2104542553 * cube_root(l) + 0.7936177850 * cube_root(m) - 0.0040720468 * cube_root(s);
}

fn normalized_sine(value: f32) -> f32 {
    return (sin(value) + 1.0) * 0.5;
}

fn computeRotationBias(behaviorMode: i32, baseHeading: f32, rotRand: f32, time: f32, agentIndex: i32, totalAgents: i32) -> f32 {
    if (behaviorMode <= 0) {
        return 0.0;
    } else if (behaviorMode == 1) {
        return baseHeading;
    } else if (behaviorMode == 2) {
        return baseHeading + floor(rotRand * 4.0) * RIGHT_ANGLE;
    } else if (behaviorMode == 3) {
        return baseHeading + (rotRand - 0.5) * 0.25;
    } else if (behaviorMode == 4) {
        return rotRand * TAU;
    } else if (behaviorMode == 5) {
        let quarterSize = max(1, totalAgents / 4);
        let band = agentIndex / quarterSize;
        if (band <= 0) {
            return baseHeading;
        } else if (band == 1) {
            return baseHeading + floor(rotRand * 4.0) * RIGHT_ANGLE;
        } else if (band == 2) {
            return baseHeading + (rotRand - 0.5) * 0.25;
        } else {
            return rotRand * TAU;
        }
    } else if (behaviorMode == 10) {
        return normalized_sine((time - rotRand) * TAU);
    } else {
        return rotRand * TAU;
    }
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> Outputs {
    let coord = vec2i(fragCoord.xy);
    let stateSize = textureDimensions(xyzTex, 0);
    
    // Read input state from pipeline
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);
    
    // Extract components (positions in normalized coords [0,1])
    var px = xyz.x;
    var py = xyz.y;
    let pz = xyz.z;
    let alive = xyz.w;
    
    // Flow-specific state stored in vel
    var rotRand = vel.z;     // Per-agent rotation random [0,1]
    var strideRand = vel.w;  // Per-agent stride random [-0.5, 0.5]
    
    // If not alive, pass through unchanged
    if (alive < 0.5) {
        return Outputs(xyz, vel, rgba);
    }
    
    // Initialize rotRand/strideRand on first use (if they're zero from pointsEmitter)
    let agentSeed = u32(coord.x) + u32(coord.y) * u32(stateSize.x);
    if (rotRand == 0.0 && strideRand == 0.0) {
        rotRand = hash(agentSeed + 200u);
        strideRand = hash(agentSeed + 300u) - 0.5;
    }
    
    // Sample input texture at current position for flow direction
    let texSize = textureDimensions(inputTex, 0);
    var texCoord = vec2i(i32(px * f32(texSize.x)), i32(py * f32(texSize.y)));
    texCoord = clamp(texCoord, vec2i(0), vec2i(texSize) - vec2i(1));
    let texel = textureLoad(inputTex, texCoord, 0);
    let inputLuma = oklab_l(texel.rgb);
    
    // inputWeight controls how much the input texture influences flow direction
    let weightBlend = clamp(u.inputWeight * 0.01, 0.0, 1.0);
    let indexValue = mix(0.5, inputLuma, weightBlend);
    
    // Compute rotation bias based on behavior uniform
    let baseHeading = hash(0u) * TAU;
    let behaviorMode = i32(u.behavior);
    let totalAgents = i32(stateSize.x * stateSize.y);
    let agentIndex = coord.x + coord.y * i32(stateSize.x);
    let rotationBias = computeRotationBias(behaviorMode, baseHeading, rotRand, u.time, agentIndex, totalAgents);
    
    // Final angle based on input texture and kink
    var finalAngle = indexValue * TAU * u.kink + rotationBias;
    
    if (u.quantize > 0.5) {
        finalAngle = round(finalAngle);
    }
    
    // Compute actual stride in normalized coords
    let scale = max(max(u.resolution.x, u.resolution.y) / 1024.0, 1.0);
    let devFactor = 1.0 + strideRand * 2.0 * u.strideDeviation;
    let actualStride = max(0.0001, (u.stride * 0.1) * scale * devFactor / max(u.resolution.x, u.resolution.y));
    
    // Move agent
    var newX = px + sin(finalAngle) * actualStride;
    var newY = py + cos(finalAngle) * actualStride;
    
    // Wrap position to [0,1]
    newX = fract(newX);
    newY = fract(newY);
    
    // Check for respawn based on attrition
    var needsRespawn = false;
    if (u.attrition > 0.0) {
        let time_seed = u32(u.time * 60.0);
        let check_seed = agentSeed + time_seed * 747796405u;
        let respawnRand = hash(check_seed);
        let attritionRate = u.attrition * 0.01;
        if (respawnRand < attritionRate) {
            needsRespawn = true;
        }
    }
    
    if (needsRespawn) {
        // Signal respawn by setting alive flag to 0
        return Outputs(
            vec4f(newX, newY, pz, 0.0),
            vec4f(0.0, 0.0, rotRand, strideRand),
            rgba
        );
    } else {
        return Outputs(
            vec4f(newX, newY, pz, 1.0),
            vec4f(0.0, 0.0, rotRand, strideRand),
            rgba
        );
    }
}
