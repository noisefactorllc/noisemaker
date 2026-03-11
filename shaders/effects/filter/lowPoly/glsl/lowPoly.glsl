/*
 * Low Poly - Voronoi-based low-polygon art style
 * Generates deterministic seed points, finds nearest Voronoi cell,
 * fills with input color at seed position, blends with distance for edges.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;
uniform float freq;
uniform float seed;
uniform float nth;
uniform float alpha;

out vec4 fragColor;

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
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;

    float n = max(102.0 - freq, 2.0);
    float s = seed;

    // Aspect-corrected coordinates for square Voronoi cells
    float aspect = resolution.x / resolution.y;
    vec2 auv = vec2(uv.x * aspect, uv.y);

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
    vec4 cellColor = texture(inputTex, vec2(nearestPoint.x / aspect, nearestPoint.y));

    vec3 result;
    if (nth < 0.5) {
        // nth=0: flat cell color with subtle edge darkening
        float edgeDist = clamp((secondDist - minDist) * n * 2.0, 0.0, 1.0);
        result = cellColor.rgb * (0.85 + 0.15 * edgeDist);
    } else {
        // nth=1,2: blend distance field with cell color (matches Python lowpoly)
        float selectedDist = (nth < 1.5) ? secondDist : thirdDist;
        float distField = sqrt(clamp(selectedDist * n, 0.0, 1.0));
        result = mix(vec3(distField), cellColor.rgb, 0.5);
    }

    // Alpha blend with original
    vec4 original = texture(inputTex, uv);
    fragColor = vec4(mix(original.rgb, result, alpha), original.a);
}
