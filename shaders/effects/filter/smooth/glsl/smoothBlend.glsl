/*
 * Smooth - Blending Pass
 * MSAA mode: multi-sample supersampling with scalable radius
 * SMAA mode: morphological blending with improved edge-aware weights
 * Blur mode: edge-selective Gaussian blur
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D edgeTex;
uniform int smoothType;
uniform float smoothStrength;
uniform float smoothThreshold;
uniform float smoothRadius;
uniform int smoothSamples;
uniform int smoothSearchSteps;

out vec4 fragColor;

const vec3 LUMA_WEIGHTS = vec3(0.299, 0.587, 0.114);

float luminance(vec3 rgb) {
    return dot(rgb, LUMA_WEIGHTS);
}

// Manual bilinear interpolation (WebGL2 textures use NEAREST filtering)
vec4 sampleBilinear(vec2 uv, ivec2 texSize) {
    vec2 texCoord = uv * vec2(texSize) - 0.5;
    ivec2 base = ivec2(floor(texCoord));
    vec2 f = texCoord - vec2(base);
    ivec2 maxC = texSize - 1;

    vec4 tl = texelFetch(inputTex, clamp(base, ivec2(0), maxC), 0);
    vec4 tr = texelFetch(inputTex, clamp(base + ivec2(1, 0), ivec2(0), maxC), 0);
    vec4 bl = texelFetch(inputTex, clamp(base + ivec2(0, 1), ivec2(0), maxC), 0);
    vec4 br = texelFetch(inputTex, clamp(base + ivec2(1, 1), ivec2(0), maxC), 0);

    return mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);
}

// --- MSAA: rotated grid sample offsets ---

vec2 sampleOffset2x(int i) {
    if (i == 0) return vec2(-0.25, 0.25);
    return vec2(0.25, -0.25);
}

vec2 sampleOffset4x(int i) {
    if (i == 0) return vec2(-0.125, -0.375);
    if (i == 1) return vec2( 0.375, -0.125);
    if (i == 2) return vec2(-0.375,  0.125);
    return vec2( 0.125,  0.375);
}

vec2 sampleOffset8x(int i) {
    if (i == 0) return vec2(-0.375, -0.375);
    if (i == 1) return vec2( 0.125, -0.375);
    if (i == 2) return vec2(-0.125, -0.125);
    if (i == 3) return vec2( 0.375, -0.125);
    if (i == 4) return vec2(-0.375,  0.125);
    if (i == 5) return vec2( 0.125,  0.125);
    if (i == 6) return vec2(-0.125,  0.375);
    return vec2( 0.375,  0.375);
}

vec2 getSampleOffset(int i, int count) {
    if (count <= 2) return sampleOffset2x(i);
    if (count <= 4) return sampleOffset4x(i);
    return sampleOffset8x(i);
}

vec4 msaaBlend(vec2 uv, vec2 texelSize, ivec2 texSize) {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 maxC = texSize - 1;
    vec4 center = texelFetch(inputTex, coord, 0);

    // Threshold check: skip AA for low-contrast pixels
    float L = luminance(center.rgb);
    float Ln = luminance(texelFetch(inputTex, clamp(coord + ivec2(0, -1), ivec2(0), maxC), 0).rgb);
    float Ls = luminance(texelFetch(inputTex, clamp(coord + ivec2(0,  1), ivec2(0), maxC), 0).rgb);
    float Lw = luminance(texelFetch(inputTex, clamp(coord + ivec2(-1, 0), ivec2(0), maxC), 0).rgb);
    float Le = luminance(texelFetch(inputTex, clamp(coord + ivec2( 1, 0), ivec2(0), maxC), 0).rgb);

    float maxDiff = max(max(abs(L - Ln), abs(L - Ls)),
                        max(abs(L - Lw), abs(L - Le)));

    if (maxDiff < smoothThreshold) {
        return center;
    }

    // Supersample at radius-scaled offsets with manual bilinear interpolation
    vec4 sum = vec4(0.0);
    int count = smoothSamples;
    for (int i = 0; i < 8; i++) {
        if (i >= count) break;
        vec2 offset = getSampleOffset(i, count) * smoothRadius;
        sum += sampleBilinear(uv + offset * texelSize, texSize);
    }
    return sum / float(count);
}

// --- SMAA: morphological edge search and blending ---

float searchEdge(ivec2 coord, ivec2 dir, ivec2 maxC, int component) {
    for (int i = 1; i <= 32; i++) {
        if (i > smoothSearchSteps) break;
        ivec2 sampleCoord = clamp(coord + dir * i, ivec2(0), maxC);
        float edge = (component == 0) ? texelFetch(edgeTex, sampleCoord, 0).r
                                      : texelFetch(edgeTex, sampleCoord, 0).g;
        if (edge < 0.5) {
            return float(i - 1);
        }
    }
    return float(smoothSearchSteps);
}

vec4 smaaBlend(ivec2 texSize) {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 maxC = texSize - 1;
    vec4 edges = texelFetch(edgeTex, coord, 0);
    float edgeH = edges.r;
    float edgeV = edges.g;

    vec4 center = texelFetch(inputTex, coord, 0);
    if (edgeH < 0.5 && edgeV < 0.5) {
        return center;
    }

    vec4 blended = center;

    // Horizontal edge: search left/right, blend with vertical neighbor
    if (edgeH > 0.5) {
        float distLeft  = searchEdge(coord, ivec2(-1, 0), maxC, 0);
        float distRight = searchEdge(coord, ivec2( 1, 0), maxC, 0);
        float edgeLength = distLeft + distRight + 1.0;

        // Stronger blend for shorter edges (more jaggy), scaled by radius
        float weight = clamp(smoothRadius * 0.5 / sqrt(edgeLength), 0.0, 0.5);

        vec4 neighbor = texelFetch(inputTex, clamp(coord + ivec2(0, 1), ivec2(0), maxC), 0);
        blended = mix(blended, neighbor, weight);
    }

    // Vertical edge: search up/down, blend with horizontal neighbor
    if (edgeV > 0.5) {
        float distUp   = searchEdge(coord, ivec2(0, -1), maxC, 1);
        float distDown = searchEdge(coord, ivec2(0,  1), maxC, 1);
        float edgeLength = distUp + distDown + 1.0;

        float weight = clamp(smoothRadius * 0.5 / sqrt(edgeLength), 0.0, 0.5);

        vec4 neighbor = texelFetch(inputTex, clamp(coord + ivec2(1, 0), ivec2(0), maxC), 0);
        blended = mix(blended, neighbor, weight);
    }

    return blended;
}

// --- Blur: edge-selective Gaussian ---

vec4 edgeBlur(ivec2 texSize) {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 maxC = texSize - 1;
    vec4 edges = texelFetch(edgeTex, coord, 0);

    vec4 center = texelFetch(inputTex, coord, 0);
    if (edges.r < 0.5 && edges.g < 0.5) {
        return center;
    }

    int r = int(ceil(smoothRadius));
    float sigma = smoothRadius * 0.5;
    float sigma2 = 2.0 * sigma * sigma;

    vec4 sum = center;
    float totalWeight = 1.0;

    for (int dy = -4; dy <= 4; dy++) {
        for (int dx = -4; dx <= 4; dx++) {
            if (dx == 0 && dy == 0) continue;
            if (abs(dx) > r || abs(dy) > r) continue;

            float d = float(dx * dx + dy * dy);
            float w = exp(-d / sigma2);

            sum += texelFetch(inputTex, clamp(coord + ivec2(dx, dy), ivec2(0), maxC), 0) * w;
            totalWeight += w;
        }
    }

    return sum / totalWeight;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec2 texelSize = 1.0 / vec2(texSize);

    vec4 original = texelFetch(inputTex, ivec2(gl_FragCoord.xy), 0);
    vec4 result;

    if (smoothType == 0) {
        result = msaaBlend(uv, texelSize, texSize);
    } else if (smoothType == 1) {
        result = smaaBlend(texSize);
    } else {
        result = edgeBlur(texSize);
    }

    fragColor = mix(original, result, smoothStrength);
}
