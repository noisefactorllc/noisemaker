/*
 * 3D Reaction-Diffusion simulation shader (GLSL)
 * Implements Gray-Scott model in 3D with 6-neighbor Laplacian
 * Self-initializing: detects empty buffer and seeds on first frame
 */

#version 300 es
precision highp float;

uniform float time;
uniform int seed;
uniform int volumeSize;
uniform float feed;
uniform float kill;
uniform float rate1;
uniform float rate2;
uniform float speed;
uniform int iterations;
uniform int colorMode;
uniform float weight;
uniform bool resetState;
uniform sampler2D stateTex;
uniform sampler2D seedTex;  // 3D input volume atlas (inputTex3d)

out vec4 fragColor;

// Hash for initialization
float hash3(vec3 p) {
    p = p + float(seed) * 0.1;
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
}

// Helper to convert 3D voxel coords to 2D atlas texel coords
ivec2 atlasTexel(ivec3 p, int volSize) {
    // Wrap coordinates for periodic boundary
    ivec3 wrapped = ivec3(
        (p.x + volSize) % volSize,
        (p.y + volSize) % volSize,
        (p.z + volSize) % volSize
    );
    return ivec2(wrapped.x, wrapped.y + wrapped.z * volSize);
}

// Sample state at voxel coordinate with wrapping
vec4 sampleState(ivec3 voxel, int volSize) {
    return texelFetch(stateTex, atlasTexel(voxel, volSize), 0);
}

// Sample seed texture at voxel coordinate (for inputTex3d seeding)
vec4 sampleSeed(ivec3 voxel, int volSize) {
    return texelFetch(seedTex, atlasTexel(voxel, volSize), 0);
}

// 3D Laplacian using 6-neighbor stencil (face neighbors only)
// Standard discrete Laplacian for uniform 3D grid
vec2 laplacian3D(ivec3 voxel, int volSize) {
    vec4 center = sampleState(voxel, volSize);
    
    // 6-neighbor stencil (face-adjacent neighbors)
    vec4 xp = sampleState(voxel + ivec3(1, 0, 0), volSize);
    vec4 xn = sampleState(voxel + ivec3(-1, 0, 0), volSize);
    vec4 yp = sampleState(voxel + ivec3(0, 1, 0), volSize);
    vec4 yn = sampleState(voxel + ivec3(0, -1, 0), volSize);
    vec4 zp = sampleState(voxel + ivec3(0, 0, 1), volSize);
    vec4 zn = sampleState(voxel + ivec3(0, 0, -1), volSize);
    
    // Standard discrete 3D Laplacian: sum of neighbors - 6 * center
    // State layout: .r = B (density), .a = A (chemical)
    vec2 neighborSum = xp.ra + xn.ra + yp.ra + yn.ra + zp.ra + zn.ra;
    vec2 lap = neighborSum - 6.0 * center.ra;
    
    return lap;
}

void main() {
    int volSize = volumeSize;
    
    // Decode voxel position from atlas
    ivec2 pixelCoord = ivec2(gl_FragCoord.xy);
    int x = pixelCoord.x;
    int y = pixelCoord.y % volSize;
    int z = pixelCoord.y / volSize;
    ivec3 voxel = ivec3(x, y, z);
    
    // Bounds check
    if (x >= volSize || y >= volSize || z >= volSize) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Current state
    vec4 state = sampleState(voxel, volSize);
    float b = state.r;  // Chemical B (density, used by render3d)
    float a = state.a;  // Chemical A (simulation state)
    
    // Self-initialization: detect empty buffer (first frame) or reset requested
    bool bufferIsEmpty = (state.r == 0.0 && state.g == 0.0 && state.b == 0.0 && state.a == 0.0);
    
    if (bufferIsEmpty || resetState) {
        a = 1.0;
        b = 0.0;

        if (resetState) {
            // Reset behavior: reseed a 4x4x4 cube at the center of the volume.
            // For even sizes, this is indices [N/2-2 .. N/2+1] (inclusive).
            int start = max(0, (volSize / 2) - 2);
            int end = min(volSize - 1, start + 3);
            bool inCenterCube = (x >= start && x <= end && y >= start && y <= end && z >= start && z <= end);
            b = inCenterCube ? 1.0 : 0.0;
        } else {
            // First-frame init: if we have input from seedTex (inputTex3d), use it.
            vec4 seedVal = sampleSeed(voxel, volSize);
            bool hasSeedInput = (seedVal.r > 0.0 || seedVal.g > 0.0 || seedVal.b > 0.0);

            if (hasSeedInput) {
                float lum = 0.299 * seedVal.r + 0.587 * seedVal.g + 0.114 * seedVal.b;
                b = lum > 0.5 ? 1.0 : 0.0;
            } else {
                // Fallback: sparse random seeding of B
                vec3 p = vec3(float(x), float(y), float(z));
                if (hash3(p) > 0.97) {
                    b = 1.0;
                }
            }
        }

        fragColor = vec4(b, b, b, a);
        return;
    }
    
    // Compute Laplacian for diffusion
    vec2 lap = laplacian3D(voxel, volSize);
    
    // Gray-Scott parameters (scaled from UI values)
    // Note: Laplacian in 3D is 6x larger than normalized form,
    // so we scale diffusion rates down by 6 to maintain stability
    float f = feed * 0.001;       // Feed rate
    float k = kill * 0.001;       // Kill rate
    float r1 = rate1 * 0.01 / 6.0;  // Diffusion rate A (scaled for 3D)
    float r2 = rate2 * 0.01 / 6.0;  // Diffusion rate B (scaled for 3D)
    // This pass is executed `iterations` times per frame (pipeline repeat).
    // To keep the solver stable and make "speed" behave like a per-frame control,
    // we scale the per-iteration timestep down by the iteration count.
    float iterF = max(1.0, float(iterations));
    float s = (speed * 0.01) / iterF;
    
    // Gray-Scott reaction-diffusion equations
    // lap.x = Lap(B) from .r, lap.y = Lap(A) from .a
    float newA = a + (r1 * lap.y - a * b * b + f * (1.0 - a)) * s;
    float newB = b + (r2 * lap.x + a * b * b - (k + f) * b) * s;
    
    // Apply input weight blending from seedTex (inputTex3d)
    if (weight > 0.0) {
        vec4 seedVal = sampleSeed(voxel, volSize);
        float seedLum = 0.299 * seedVal.r + 0.587 * seedVal.g + 0.114 * seedVal.b;
        // Seed influences chemical B (the visible one)
        newB = mix(newB, seedLum, weight * 0.01);
    }
    
    // Clamp for numerical stability
    newA = clamp(newA, 0.0, 1.0);
    newB = clamp(newB, 0.0, 1.0);
    
    // .r = B (density for render3d), .a = A (simulation state)
    // .rgb = visualization colors, .a = chemical A
    float density = newB;
    vec3 outRgb;
    if (colorMode == 0) {
        outRgb = vec3(density);
    } else {
        outRgb = vec3(density, newA, 1.0 - density);
    }

    fragColor = vec4(outRgb, newA);
}
