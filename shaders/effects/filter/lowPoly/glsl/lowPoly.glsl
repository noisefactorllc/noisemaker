/*
 * Low Poly - Voronoi-based low-polygon art style
 * Generates deterministic seed points, finds nearest Voronoi cell,
 * fills with input color at seed position. Supports flat and distance modes.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float scale;
uniform float seed;
uniform int mode;
uniform float edgeStrength;
uniform vec3 edgeColor;
uniform float speed;
uniform float time;
uniform float alpha;

out vec4 fragColor;

const float TAU = 6.28318530718;

// PCG PRNG - MIT License
uvec3 pcg(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec2 hash2(vec2 p, float s) {
    uvec3 v = pcg(uvec3(
        uint(p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0),
        uint(p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0),
        uint(s >= 0.0 ? s * 2.0 : -s * 2.0 + 1.0)
    ));
    return vec2(v.xy) / float(0xffffffffu);
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 globalUV = globalCoord / fullResolution;

    float n = max(102.0 - scale, 2.0);
    float s = seed;
    float spd = speed * 0.3;

    // Aspect-corrected coordinates for square Voronoi cells
    float aspect = fullResolution.x / fullResolution.y;
    vec2 auv = vec2(globalUV.x * aspect, globalUV.y);

    // Scale to grid in corrected space
    vec2 scaled = auv * n;
    ivec2 cell = ivec2(floor(scaled));

    float minDist = 1e10;
    float secondDist = 1e10;
    float thirdDist = 1e10;
    vec2 nearestPoint = vec2(0.0);

    // Search 3x3 neighborhood of cells
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            ivec2 neighbor = cell + ivec2(dx, dy);
            vec2 neighborF = vec2(neighbor);

            // Generate seed point in this cell
            vec2 offset = hash2(neighborF, s);

            // Animate: per-cell circular drift with unique phase/radius
            if (spd > 0.0) {
                vec2 animRand = hash2(neighborF, s + 100.0);
                float angle = time * TAU + animRand.x * TAU;
                float radius = animRand.y * spd;
                offset = clamp(offset + vec2(cos(angle), sin(angle)) * radius, 0.0, 1.0);
            }

            vec2 point = (neighborF + offset) / n;
            float d = distance(auv, point);

            if (d < minDist) {
                thirdDist = secondDist;
                secondDist = minDist;
                minDist = d;
                nearestPoint = point;
            } else if (d < secondDist) {
                thirdDist = secondDist;
                secondDist = d;
            } else if (d < thirdDist) {
                thirdDist = d;
            }
        }
    }

    // Convert nearest point back to UV space for texture sampling
    // Map from global UV to tile-local UV for texture sampling
    vec2 cellGlobalUV = vec2(nearestPoint.x / aspect, nearestPoint.y);
    vec2 cellLocalUV = (cellGlobalUV * fullResolution - tileOffset) / resolution;
    vec4 cellColor = texture(inputTex, clamp(cellLocalUV, 0.0, 1.0));

    vec3 result;
    if (mode == 0) {
        // Flat: pure solid cell color
        result = cellColor.rgb;
    } else if (mode == 1) {
        // Edges: solid cell color with F2-F1 edge darkening
        float edgeDist = clamp((secondDist - minDist) * n * 2.0, 0.0, 1.0);
        float edgeFactor = mix(edgeStrength, 0.0, edgeDist);
        result = mix(cellColor.rgb, edgeColor, edgeFactor);
    } else {
        // Distance: multiply distance field with cell color
        float selectedDist = (mode == 2) ? secondDist : thirdDist;
        float raw = clamp(selectedDist * n, 0.0, 1.0);
        float distField = pow(raw, mix(0.5, 3.0, edgeStrength));
        result = cellColor.rgb * distField;
    }

    // Alpha blend with original
    vec4 original = texture(inputTex, uv);
    fragColor = vec4(mix(original.rgb, result, alpha), original.a);
}
