#version 300 es

precision highp float;
precision highp int;

// Voronoi diagram effect - simplified version for WebGL2

uniform sampler2D inputTex;
uniform float time;
uniform float speed;
uniform float alpha;
uniform float pointFreq;
uniform float pointDistrib;
uniform float nth;
uniform float shape;

in vec2 v_texCoord;
out vec4 fragColor;

const float PI = 3.14159265358979;
const float TAU = 6.28318530717959;
const int MAX_POINTS = 64;

// Hash function
float hash21(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}

// Distance metrics
float distanceMetric(vec2 a, vec2 b, int metric) {
    vec2 d = a - b;
    if (metric == 1) {
        // Manhattan
        return abs(d.x) + abs(d.y);
    } else if (metric == 2) {
        // Chebyshev
        return max(abs(d.x), abs(d.y));
    } else {
        // Euclidean
        return length(d);
    }
}

// Get cell point with animation
vec2 getCellPoint(vec2 cell, float t) {
    vec2 random = hash22(cell);
    float angle = t * speed * 0.5;
    vec2 offset = vec2(cos(random.x * TAU + angle), sin(random.y * TAU + angle)) * 0.3;
    return cell + 0.5 + random * 0.3 + offset * 0.2;
}

void main() {
    vec2 dims = vec2(textureSize(inputTex, 0));
    vec4 src = texture(inputTex, v_texCoord);
    
    int freq = max(int(pointFreq), 2);
    int metric = int(shape);
    int nthPoint = max(int(nth), 1);
    float t = time;
    
    // Scale coordinates to grid
    vec2 coord = v_texCoord * float(freq);
    vec2 baseCell = floor(coord);
    
    // Find distances to nearby points
    float distances[9];
    int count = 0;
    
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            vec2 cell = baseCell + vec2(float(dx), float(dy));
            vec2 point = getCellPoint(cell, t);
            float d = distanceMetric(coord, point, metric);
            distances[count] = d;
            count++;
        }
    }
    
    // Sort to find nth closest (simple bubble sort)
    for (int i = 0; i < 8; i++) {
        for (int j = i + 1; j < 9; j++) {
            if (distances[j] < distances[i]) {
                float tmp = distances[i];
                distances[i] = distances[j];
                distances[j] = tmp;
            }
        }
    }
    
    // Get nth distance (0-indexed, so nth=1 means closest)
    int idx = min(nthPoint - 1, 8);
    float d = distances[idx];
    
    // Normalize to 0-1 range
    float maxDist = sqrt(2.0);
    float val = clamp(d / maxDist, 0.0, 1.0);
    
    // Mix with source
    vec3 voronoiColor = vec3(val);
    vec3 result = mix(src.rgb, voronoiColor, alpha);
    
    fragColor = vec4(result, src.a);
}
