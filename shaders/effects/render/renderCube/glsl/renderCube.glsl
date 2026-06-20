/*
 * Cubemap volume renderer (GLSL) — renderCube
 *
 * Renders a 3D volume (inputTex3d) into a 2D output using a center-camera
 * 90-degree mat3 frustum projection (cubeBasis). Two compositing modes:
 *   cubeMode 0 = isosurface (SDF raymarching with bisection refinement)
 *   cubeMode 1 = volumetric (front-to-back emission/absorption, nebula look)
 *
 * The volume is sampled from the red channel (.r) for the density/SDF field.
 * RGB channels are used for coloring in non-mono modes.
 *
 * INVERT is a compile-time #define injected by the expander (see definition.js).
 */

#version 300 es
precision highp float;

// INVERT is a compile-time #define; the optimizer drops the dead branch.
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float threshold;
uniform int volumeSize;
uniform mat3 cubeBasis;
uniform vec3 bgColor;
uniform float bgAlpha;
uniform sampler2D volumeCache;
uniform int cubeMode;
uniform float density;
uniform float absorption;
uniform float emission;

// MRT outputs: color and geometry buffer
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

const float TAU = 6.283185307179586;
const float PI = 3.141592653589793;
const int MAX_STEPS = 256;
const float MAX_DIST = 10.0;

// Helper to convert 3D texel coords to 2D atlas texel coords
ivec2 atlasTexel(ivec3 p, int volSize) {
    return ivec2(p.x, p.y + p.z * volSize);
}

// Sample the cached 3D volume with trilinear interpolation
// World position p is in [-1, 1]^3 (bounding box coordinates)
vec4 sampleVolume(vec3 worldPos) {
    int volSize = volumeSize;
    float volSizeF = float(volSize);

    // Convert world position [-1, 1] to normalized volume coords [0, 1]
    vec3 uvw = worldPos * 0.5 + 0.5;
    uvw = clamp(uvw, 0.0, 1.0);

    // Convert to texel coordinates
    vec3 texelPos = uvw * (volSizeF - 1.0);
    vec3 texelFloor = floor(texelPos);
    vec3 frac = texelPos - texelFloor;

    ivec3 i0 = ivec3(texelFloor);
    ivec3 i1 = min(i0 + 1, volSize - 1);

    // Trilinear filtering - sample all 8 corners
    vec4 c000 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i0.y, i0.z), volSize), 0);
    vec4 c100 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i0.y, i0.z), volSize), 0);
    vec4 c010 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i1.y, i0.z), volSize), 0);
    vec4 c110 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i1.y, i0.z), volSize), 0);
    vec4 c001 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i0.y, i1.z), volSize), 0);
    vec4 c101 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i0.y, i1.z), volSize), 0);
    vec4 c011 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i1.y, i1.z), volSize), 0);
    vec4 c111 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i1.y, i1.z), volSize), 0);

    // Trilinear interpolation
    vec4 c00 = mix(c000, c100, frac.x);
    vec4 c10 = mix(c010, c110, frac.x);
    vec4 c01 = mix(c001, c101, frac.x);
    vec4 c11 = mix(c011, c111, frac.x);

    vec4 c0 = mix(c00, c10, frac.y);
    vec4 c1 = mix(c01, c11, frac.y);

    return mix(c0, c1, frac.z);
}

// Get the scalar field value at a point. INVERT is a compile-time #define;
// the optimizer drops the dead branch.
float getField(vec3 p) {
    float val = sampleVolume(p).r;
    if (INVERT) {
        val = 1.0 - val;
    }
    return threshold - val;
}

// Ray-box intersection against [-1,1]^3. Returns vec2(tEnter, tExit).
// result.y < 0 or result.x > result.y means no intersection.
vec2 intersectBox(vec3 ro, vec3 rd) {
    vec3 invRd = 1.0 / rd;
    vec3 t0 = (-1.0 - ro) * invRd;
    vec3 t1 = (1.0 - ro) * invRd;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tEnter = max(max(tmin.x, tmin.y), tmin.z);
    float tExit = min(min(tmax.x, tmax.y), tmax.z);
    if (tEnter > tExit || tExit < 0.0) {
        return vec2(-1.0);
    }
    return vec2(tEnter, tExit);
}

// Compute smooth normal using central differences on the SDF field
vec3 calcNormal(vec3 p) {
    float eps = 2.0 / float(volumeSize);

    float dx = getField(p + vec3(eps, 0.0, 0.0)) - getField(p - vec3(eps, 0.0, 0.0));
    float dy = getField(p + vec3(0.0, eps, 0.0)) - getField(p - vec3(0.0, eps, 0.0));
    float dz = getField(p + vec3(0.0, 0.0, eps)) - getField(p - vec3(0.0, 0.0, eps));

    vec3 n = vec3(dx, dy, dz);

    // Handle degenerate case
    float len = length(n);
    if (len < 0.0001) return vec3(0.0, 1.0, 0.0);

    return n / len;
}

// Isosurface hit result
struct IsoHit {
    float dist;
    vec3 pos;
    bool hit;
};

// Analytic isosurface raymarching with bisection refinement
IsoHit isosurfaceTrace(vec3 ro, vec3 rd) {
    IsoHit result;
    result.hit = false;
    result.dist = -1.0;
    result.pos = vec3(0.0);

    vec2 tb = intersectBox(ro, rd);
    if (tb.y < 0.0 || tb.x > tb.y) return result;

    float tStart = max(tb.x, 0.0);
    float tExit = tb.y;

    // Step size based on volume resolution
    float stepSize = 1.5 / float(volumeSize);

    // March through volume
    float t = tStart;
    float prevField = getField(ro + rd * t);

    // If we start inside solid (e.g., inverted volume), hit the bounding box surface
    if (prevField < 0.0) {
        result.hit = true;
        result.dist = tStart;
        result.pos = ro + rd * tStart;
        return result;
    }

    for (int i = 0; i < MAX_STEPS; i++) {
        t += stepSize;
        if (t > tExit) break;

        vec3 p = ro + rd * t;
        float field = getField(p);

        // Check for sign change (threshold crossing)
        if (prevField * field < 0.0) {
            // Found crossing - refine with bisection
            float tLo = t - stepSize;
            float tHi = t;

            // Bisection iterations for precise surface location
            for (int j = 0; j < 8; j++) {
                float tMid = (tLo + tHi) * 0.5;
                float fMid = getField(ro + rd * tMid);

                if (prevField * fMid < 0.0) {
                    tHi = tMid;
                } else {
                    tLo = tMid;
                    prevField = fMid;
                }
            }

            result.hit = true;
            result.dist = (tLo + tHi) * 0.5;
            result.pos = ro + rd * result.dist;
            return result;
        }

        prevField = field;
    }

    return result;
}

// Shading for smooth isosurface - uses RGB from volume for coloring
vec3 shade(vec3 p, vec3 rd) {
    vec3 n = calcNormal(p);
    vec3 lightDir = normalize(vec3(1.0, 1.0, -1.0));

    // Diffuse lighting
    float diff = max(dot(n, lightDir), 0.0);
    float amb = 0.15;

    // Specular highlight
    vec3 halfVec = normalize(lightDir - rd);
    float spec = pow(max(dot(n, halfVec), 0.0), 32.0);

    // Fresnel rim lighting
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    // Use RGB from volume for coloring
    vec4 volColor = sampleVolume(p);
    vec3 baseColor = volColor.rgb;

    // If volume appears grayscale (R≈G≈B), use a neutral gray
    float colorVariance = length(volColor.rgb - vec3(volColor.r));
    if (colorVariance < 0.01) {
        baseColor = vec3(0.75);
    }

    return baseColor * (amb + diff * 0.7) + spec * 0.2 + rim * 0.15;
}

void main() {
    // Square face: uv in [-1, 1], 90-degree frustum. Camera at the volume center.
    vec2 res = (fullResolution.x > 0.0) ? fullResolution : resolution;
    vec2 uv = ((gl_FragCoord.xy + tileOffset) - 0.5 * res) / (0.5 * res.y);
    vec3 ro = vec3(0.0);
    vec3 rd = normalize(cubeBasis * vec3(uv.x, -uv.y, 1.0));

    // Volumetric mode: front-to-back emission/absorption integration
    if (cubeMode == 1) {
        vec3 col = vec3(0.0);
        float trans = 1.0;
        vec2 tb = intersectBox(ro, rd);
        if (tb.y > 0.0) {
            float t0 = max(tb.x, 0.0);
            float dt = (tb.y - t0) / float(MAX_STEPS);
            float t = t0;
            for (int i = 0; i < MAX_STEPS; i++) {
                vec4 s = sampleVolume(ro + rd * t);
                float a = 1.0 - exp(-s.r * density * absorption * dt);
                col += trans * a * s.rgb * emission;
                trans *= (1.0 - a);
                if (trans < 0.01) break;
                t += dt;
            }
        }
        vec3 outc = pow(col + bgColor * trans, vec3(1.0 / 2.2));
        fragColor = vec4(outc, 1.0 - trans + bgAlpha * trans);
        geoOut = vec4(0.5, 0.5, 0.5, 1.0);
        return;
    }

    // Isosurface mode
    vec3 color;
    vec3 normal = vec3(0.0, 0.0, 1.0);
    float depth = 1.0;
    float alpha = 1.0;

    IsoHit hit = isosurfaceTrace(ro, rd);
    if (hit.hit) {
        color = shade(hit.pos, rd);
        normal = calcNormal(hit.pos);
        depth = hit.dist / MAX_DIST;
    } else {
        color = bgColor;
        alpha = bgAlpha;
    }

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    fragColor = vec4(color, alpha);
    // Geometry buffer: RGB = normal (remapped to 0-1), A = depth
    geoOut = vec4(normal * 0.5 + 0.5, depth);
}
