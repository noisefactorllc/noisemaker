#version 300 es
precision highp float;
precision highp int;

uniform vec2 resolution;
uniform sampler2D stateTex;
uniform sampler2D colorTex;
uniform sampler2D bufTex;
uniform float moveSpeed;
uniform float turnSpeed;
uniform float sensorAngle;
uniform float sensorDistance;
uniform float time;
uniform float attrition;
uniform float density;
uniform float inputWeight;
uniform sampler2D inputTex;
uniform bool resetState;
uniform int spawnPattern;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 outColor;

// Simple hash function for pseudo-random numbers
uint hash_uint(uint seed) {
    uint state = seed * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hash(uint seed) {
    return float(hash_uint(seed)) / 4294967295.0;
}

vec2 hash2(uint seed) {
    return vec2(hash(seed), hash(seed + 1u));
}

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

vec2 wrapPosition(vec2 position, vec2 bounds) {
    return mod(position + bounds, bounds);
}

float luminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

vec3 sampleInputColor(vec2 uv) {
    vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
    return texture(inputTex, flippedUV).rgb;
}

float sampleExternalField(vec2 uv, float inputWeightVal) {
    if (inputWeightVal <= 0.0) {
        return 0.0;
    }
    float blend = clamp(inputWeightVal * 0.01, 0.0, 1.0);
    // Scale to trail-comparable values (trail deposits are ~0.05)
    // This provides a gentle bias toward bright areas without overwhelming trail signal
    return luminance(sampleInputColor(uv)) * blend * 0.05;
}

void main() {
    ivec2 stateSize = textureSize(stateTex, 0);
    vec2 uv = (gl_FragCoord.xy + vec2(0.5)) / vec2(stateSize);
    vec4 agent = texture(stateTex, uv);
    vec4 agentColor = texture(colorTex, uv);
    vec2 pos = agent.xy;
    float heading = agent.z;
    float age = agent.w;

    // Initialization / Reset
    if (resetState || (pos.x == 0.0 && pos.y == 0.0 && age == 0.0)) {
        float agentIndex = gl_FragCoord.y * float(stateSize.x) + gl_FragCoord.x;
        float seed = time + agentIndex;
        
        if (spawnPattern == 1) { // Clusters
            float clusterId = floor(hash(seed) * 5.0);
            vec2 center = vec2(hash(clusterId), hash(clusterId + 0.5)) * resolution;
            float r = hash(seed + 1.0) * min(resolution.x, resolution.y) * 0.15;
            float a = hash(seed + 2.0) * 6.28318530718;
            pos = center + vec2(cos(a), sin(a)) * r;
            heading = hash(seed + 3.0) * 6.28318530718;
        } else if (spawnPattern == 2) { // Ring
            vec2 center = resolution * 0.5;
            float r = min(resolution.x, resolution.y) * 0.35 + (hash(seed) - 0.5) * 20.0;
            float a = hash(seed + 1.0) * 6.28318530718;
            pos = center + vec2(cos(a), sin(a)) * r;
            heading = a + 1.5708; // Tangent
        } else if (spawnPattern == 3) { // Spiral
            vec2 center = resolution * 0.5;
            float t = hash(seed) * 20.0; 
            float r = t * min(resolution.x, resolution.y) * 0.02;
            float a = t * 6.28;
            pos = center + vec2(cos(a), sin(a)) * r;
            heading = a + 1.5708;
        } else { // Random (0)
            pos.x = hash(seed) * resolution.x;
            pos.y = hash(seed + 1.0) * resolution.y;
            heading = hash(seed + 2.0) * 6.28318530718;
        }
        
        pos = wrapPosition(pos, resolution);
        age = hash(seed + 3.0) * 10.0;  // Random initial age spread
        fragColor = vec4(pos, heading, age);
        outColor = vec4(sampleInputColor(pos / resolution), 1.0);
        return;
    }

    // Attrition respawn logic (0 = disabled)
    // Percentage of agents that respawn randomly each frame
    if (attrition > 0.0) {
        uint agent_id = uint(gl_FragCoord.y * float(stateSize.x) + gl_FragCoord.x);
        uint time_seed = uint(time * 60.0);
        uint check_seed = agent_id + time_seed * 747796405u;
        float respawnRand = hash(check_seed);
        float attritionRate = attrition * 0.01;  // Convert 0-10% to 0-0.1
        
        if (respawnRand < attritionRate) {
            // Respawn at random position
            uint pos_seed = check_seed ^ 2891336453u;
            vec2 rand_pos = hash2(pos_seed);
            pos.x = rand_pos.x * resolution.x;
            pos.y = rand_pos.y * resolution.y;
            heading = hash(pos_seed + 2u) * 6.28318530718;
            age = 0.0;
            fragColor = vec4(pos, heading, age);
            outColor = vec4(sampleInputColor(pos / resolution), 1.0);
            return;
        }
    }

    vec2 forwardDir = vec2(cos(heading), sin(heading));
    vec2 leftDir = vec2(cos(heading - sensorAngle), sin(heading - sensorAngle));
    vec2 rightDir = vec2(cos(heading + sensorAngle), sin(heading + sensorAngle));

    vec2 sensorPosF = pos + forwardDir * sensorDistance;
    vec2 sensorPosL = pos + leftDir * sensorDistance;
    vec2 sensorPosR = pos + rightDir * sensorDistance;

    // Wrap sensor positions
    sensorPosF = wrapPosition(sensorPosF, resolution);
    sensorPosL = wrapPosition(sensorPosL, resolution);
    sensorPosR = wrapPosition(sensorPosR, resolution);

    // Sample trail map + external field
    float valF = luminance(texture(bufTex, sensorPosF / resolution).rgb) + sampleExternalField(sensorPosF / resolution, inputWeight);
    float valL = luminance(texture(bufTex, sensorPosL / resolution).rgb) + sampleExternalField(sensorPosL / resolution, inputWeight);
    float valR = luminance(texture(bufTex, sensorPosR / resolution).rgb) + sampleExternalField(sensorPosR / resolution, inputWeight);

    // Steering
    if (valF > valL && valF > valR) {
        // Keep going forward
    } else if (valF < valL && valF < valR) {
        // Rotate randomly
        heading += (hash(time + pos.x) - 0.5) * 2.0 * turnSpeed * moveSpeed;
    } else if (valL > valR) {
        heading -= turnSpeed * moveSpeed;
    } else if (valR > valL) {
        heading += turnSpeed * moveSpeed;
    }

    // Move
    vec2 dir = vec2(cos(heading), sin(heading));
    float speedScale = 1.0;
    float blend = clamp(inputWeight * 0.01, 0.0, 1.0);
    if (blend > 0.0) {
        // Use raw luminance for speed modulation (not scaled by weight)
        float localInput = luminance(sampleInputColor(pos / resolution));
        // Invert: slow down in bright areas, speed up in dark areas
        speedScale = mix(1.0, mix(1.8, 0.35, localInput), blend);
    }
    pos += dir * (moveSpeed * speedScale);
    pos = wrapPosition(pos, resolution);

    // Update age
    age += 0.016;

    fragColor = vec4(pos, heading, age);
    outColor = agentColor;
}
