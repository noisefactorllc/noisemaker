/*
 * Low Poly - Voronoi-based low-polygon art style
 * Generates deterministic seed points, finds nearest Voronoi cell,
 * fills with input color at seed position, blends with distance for edges.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float freq;
uniform float seed;
uniform float alpha;

out vec4 fragColor;

// Hash function for deterministic pseudo-random seed points
vec2 hash2(vec2 p, float s) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + s * 0.1);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;

    float n = max(freq, 2.0);
    float s = seed;

    // Scale UV to grid
    vec2 scaled = uv * n;
    ivec2 cell = ivec2(floor(scaled));

    float minDist = 1e10;
    float secondDist = 1e10;
    vec2 nearestPoint = vec2(0.0);

    // Search 3x3 neighborhood of cells
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            ivec2 neighbor = cell + ivec2(dx, dy);
            vec2 neighborF = vec2(neighbor);

            // Generate seed point in this cell
            vec2 offset = hash2(neighborF, s);
            vec2 point = (neighborF + offset) / n;

            float d = distance(uv, point);

            if (d < minDist) {
                secondDist = minDist;
                minDist = d;
                nearestPoint = point;
            } else if (d < secondDist) {
                secondDist = d;
            }
        }
    }

    // Sample input color at the nearest seed point (color regions)
    vec4 cellColor = texture(inputTex, nearestPoint);

    // Distance field using second-nearest distance (nth=1)
    // Normalized so cell boundaries are dark, centers are bright
    float distField = clamp(secondDist * n * 1.5, 0.0, 1.0);

    // Blend 50/50 between distance field and color regions (matches Python)
    vec3 result = mix(vec3(distField), cellColor.rgb, 0.5);

    // Alpha blend with original
    vec4 original = texture(inputTex, uv);
    fragColor = vec4(mix(original.rgb, result, alpha), original.a);
}
