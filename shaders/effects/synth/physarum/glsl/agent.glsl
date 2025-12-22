#version 300 es
precision highp float;
precision highp int;

// Common Agent Architecture inputs
uniform sampler2D xyzTex;      // [x, y, heading, alive] in normalized [0,1]
uniform sampler2D velTex;      // [0, 0, age, seed]
uniform sampler2D rgbaTex;     // [r, g, b, a]
uniform sampler2D trailTex;    // Trail texture for sensor feedback
uniform sampler2D inputTex;    // Input texture for field attraction

uniform vec2 resolution;
uniform float time;
uniform float moveSpeed;
uniform float turnSpeed;
uniform float sensorAngle;
uniform float sensorDistance;  // Now in normalized [0,1] coords
uniform float inputWeight;
uniform float attrition;

// MRT outputs
layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;

const float TAU = 6.28318530718;

// Hash functions
uint hash_uint(uint seed) {
    uint state = seed * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hash(uint seed) {
    return float(hash_uint(seed)) / 4294967295.0;
}

float hash_f(float n) {
    return fract(sin(n) * 43758.5453123);
}

// Wrap position to [0,1]
vec2 wrapPosition(vec2 pos) {
    return fract(pos + 1.0);  // fract handles negative values correctly with +1
}

float luminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// Sample trail at normalized UV
float sampleTrail(vec2 uv) {
    return luminance(texture(trailTex, uv).rgb);
}

// Sample input texture for external field attraction
float sampleExternalField(vec2 uv, float weight) {
    if (weight <= 0.0) return 0.0;
    float blend = clamp(weight * 0.01, 0.0, 1.0);
    // Flip Y for OpenGL texture convention
    vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
    return luminance(texture(inputTex, flippedUV).rgb) * blend * 0.05;
}

void main() {
    ivec2 stateSize = textureSize(xyzTex, 0);
    ivec2 coord = ivec2(gl_FragCoord.xy);
    
    // Read current state
    vec4 xyz = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 rgba = texelFetch(rgbaTex, coord, 0);
    
    vec2 pos = xyz.xy;           // Normalized [0,1]
    float heading = xyz.z;       // Radians
    float alive = xyz.w;
    float age = vel.z;
    float seed = vel.w;
    
    // Check if agent is dead (needs respawn by pointsEmitter)
    if (alive < 0.5) {
        // Pass through - pointsEmitter will handle respawn
        // Initialize heading from seed
        outXYZ = vec4(pos, hash(uint(seed * 1000.0)) * TAU, 0.0);
        outVel = vel;
        outRGBA = rgba;
        return;
    }
    
    // Attrition: random chance to die and respawn
    if (attrition > 0.0) {
        uint agentId = uint(coord.y * stateSize.x + coord.x);
        // Use fractional time component to avoid synchronized bursts
        float fracTime = fract(time * 60.0);
        uint timeSeed = uint(time * 1000.0);  // Higher frequency for more randomness
        uint checkSeed = agentId * 747796405u + timeSeed;
        float respawnRand = hash(checkSeed);
        // Add fractional variation per-agent to stagger deaths
        float agentOffset = hash(agentId) * 0.5;
        float attritionRate = attrition * 0.01;  // Convert 0-10 to 0-0.1
        
        if (respawnRand < attritionRate) {
            // Mark as dead for pointsEmitter to respawn
            outXYZ = vec4(pos, heading, 0.0);  // alive = 0
            outVel = vel;
            outRGBA = rgba;
            return;
        }
    }
    
    // Compute sensor positions in normalized coords
    vec2 forwardDir = vec2(cos(heading), sin(heading));
    vec2 leftDir = vec2(cos(heading - sensorAngle), sin(heading - sensorAngle));
    vec2 rightDir = vec2(cos(heading + sensorAngle), sin(heading + sensorAngle));
    
    vec2 sensorPosF = wrapPosition(pos + forwardDir * sensorDistance);
    vec2 sensorPosL = wrapPosition(pos + leftDir * sensorDistance);
    vec2 sensorPosR = wrapPosition(pos + rightDir * sensorDistance);
    
    // Sample trail + external field at sensor positions
    float valF = sampleTrail(sensorPosF) + sampleExternalField(sensorPosF, inputWeight);
    float valL = sampleTrail(sensorPosL) + sampleExternalField(sensorPosL, inputWeight);
    float valR = sampleTrail(sensorPosR) + sampleExternalField(sensorPosR, inputWeight);
    
    // Steering logic
    float newHeading = heading;
    if (valF > valL && valF > valR) {
        // Forward is best, keep going
    } else if (valF < valL && valF < valR) {
        // Forward is worst, turn randomly
        newHeading += (hash_f(time + pos.x) - 0.5) * 2.0 * turnSpeed * moveSpeed;
    } else if (valL > valR) {
        // Turn left
        newHeading -= turnSpeed * moveSpeed;
    } else if (valR > valL) {
        // Turn right
        newHeading += turnSpeed * moveSpeed;
    }
    
    // Move forward
    vec2 moveDir = vec2(cos(newHeading), sin(newHeading));
    
    // Speed modulation from input texture
    float speedScale = 1.0;
    float blend = clamp(inputWeight * 0.01, 0.0, 1.0);
    if (blend > 0.0) {
        vec2 flippedUV = vec2(pos.x, 1.0 - pos.y);
        float localInput = luminance(texture(inputTex, flippedUV).rgb);
        // Invert: slow in bright, fast in dark
        speedScale = mix(1.0, mix(1.8, 0.35, localInput), blend);
    }
    
    // Scale moveSpeed to normalized coords (divide by resolution)
    // Original was in pixels, now convert: 1.78 pixels ≈ 0.00174 at 1024 res
    float normalizedSpeed = moveSpeed * 0.001 * speedScale;
    vec2 newPos = wrapPosition(pos + moveDir * normalizedSpeed);
    
    // Update age
    float newAge = age + 0.016;
    
    // Output
    outXYZ = vec4(newPos, newHeading, 1.0);  // alive = 1
    outVel = vec4(0.0, 0.0, newAge, seed);
    outRGBA = rgba;  // Color unchanged
}
