/*
 * Recursive grid subdivision with shapes
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float mode;
uniform float depth;
uniform float density;
uniform float seed;
uniform float fill;
uniform float outline;
uniform float inputMix;
uniform float wrap;

out vec4 fragColor;

// PCG PRNG - deterministic across platforms
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

vec3 prng(vec3 p) {
    return vec3(pcg(uvec3(uint(p.x), uint(p.y), uint(p.z)))) / float(0xffffffffu);
}

float cellRand(vec2 cellMin, float level, float channel) {
    float cx = floor(cellMin.x * 1000.0);
    float cy = floor(cellMin.y * 1000.0);
    return prng(vec3(cx + level * 7.0, cy + level * 13.0, seed + channel)).x;
}

// Shape functions (1.0 inside, 0.0 outside)
// All work in 1:1 aspect-corrected centered coords
float circleShape(vec2 centered) {
    return step(length(centered), 0.32);
}

float diamondShape(vec2 centered) {
    return step(abs(centered.x) + abs(centered.y), 0.32);
}

float squareShape(vec2 centered) {
    return step(max(abs(centered.x), abs(centered.y)), 0.28);
}

float arcShape(vec2 centered, float halfW, float halfH, float h) {
    int corner = int(h * 4.0);
    vec2 origin;
    if (corner == 0) origin = vec2(-halfW, -halfH);
    else if (corner == 1) origin = vec2(halfW, -halfH);
    else if (corner == 2) origin = vec2(-halfW, halfH);
    else origin = vec2(halfW, halfH);
    float dist = length(centered - origin);
    return step(dist, 0.7) * (1.0 - step(dist, 0.5));
}

float drawShape(int shapeType, vec2 centered, float halfW, float halfH, float h) {
    if (shapeType == 0) return 1.0;  // solid
    if (shapeType == 1) return circleShape(centered);
    if (shapeType == 2) return diamondShape(centered);
    if (shapeType == 3) return squareShape(centered);
    if (shapeType == 4) return arcShape(centered, halfW, halfH, h);
    return 1.0;
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    int maxDepth = int(depth);
    float dens = density / 100.0;
    int fillType = int(fill);
    int modeType = int(mode);
    float outlineWidthX = outline / resolution.x;
    float outlineWidthY = outline / resolution.y;

    // Subdivision loop
    vec2 cellMin = vec2(0.0);
    vec2 cellMax = vec2(1.0);
    bool isOutline = false;

    for (int level = 0; level < 6; level++) {
        if (level >= maxDepth) break;

        float h = cellRand(cellMin, float(level), 0.0);

        if (h < dens) {
            // Skip splits that would create too-narrow cells (max 5:1 aspect)
            float cellW = (cellMax.x - cellMin.x) * resolution.x;
            float cellH = (cellMax.y - cellMin.y) * resolution.y;
            bool canSplitH = min(cellW, cellH * 0.5) / max(cellW, cellH * 0.5) >= 0.2;
            bool canSplitV = min(cellW * 0.5, cellH) / max(cellW * 0.5, cellH) >= 0.2;

            if (modeType == 0) {
                float dir = cellRand(cellMin, float(level), 1.0);
                int splitDir = -1;
                if (dir < 0.5) {
                    if (canSplitH) splitDir = 0;
                    else if (canSplitV) splitDir = 1;
                } else {
                    if (canSplitV) splitDir = 1;
                    else if (canSplitH) splitDir = 0;
                }
                if (splitDir == 0) {
                    float mid = (cellMin.y + cellMax.y) * 0.5;
                    if (abs(st.y - mid) < outlineWidthY) isOutline = true;
                    if (st.y < mid) cellMax.y = mid;
                    else cellMin.y = mid;
                } else if (splitDir == 1) {
                    float mid = (cellMin.x + cellMax.x) * 0.5;
                    if (abs(st.x - mid) < outlineWidthX) isOutline = true;
                    if (st.x < mid) cellMax.x = mid;
                    else cellMin.x = mid;
                }
            } else {
                if (canSplitH && canSplitV) {
                    vec2 mid = (cellMin + cellMax) * 0.5;
                    if (abs(st.x - mid.x) < outlineWidthX || abs(st.y - mid.y) < outlineWidthY) {
                        isOutline = true;
                    }
                    if (st.x < mid.x) cellMax.x = mid.x;
                    else cellMin.x = mid.x;
                    if (st.y < mid.y) cellMax.y = mid.y;
                    else cellMin.y = mid.y;
                }
            }
        }
    }

    // Cell properties
    vec2 cellSize = cellMax - cellMin;
    vec2 cellUv = (st - cellMin) / cellSize;

    // 1:1 aspect-corrected coords, scaled to fit shorter side
    float cellPixelW = cellSize.x * resolution.x;
    float cellPixelH = cellSize.y * resolution.y;
    float minDim = min(cellPixelW, cellPixelH);
    vec2 centered = cellUv - 0.5;
    centered.x *= cellPixelW / minDim;
    centered.y *= cellPixelH / minDim;
    float halfW = cellPixelW / minDim * 0.5;
    float halfH = cellPixelH / minDim * 0.5;

    // Pick shape and background shades from same palette
    float shadeHash = cellRand(cellMin, 0.0, 2.0);
    int shadeIdx = int(shadeHash * 5.0);
    float shade;
    if (shadeIdx == 0) shade = 0.15;
    else if (shadeIdx == 1) shade = 0.35;
    else if (shadeIdx == 2) shade = 0.55;
    else if (shadeIdx == 3) shade = 0.75;
    else shade = 1.0;

    float bgHash = cellRand(cellMin, 0.0, 8.0);
    int bgIdx = int(bgHash * 5.0);
    float bgShade;
    if (bgIdx == 0) bgShade = 0.15;
    else if (bgIdx == 1) bgShade = 0.35;
    else if (bgIdx == 2) bgShade = 0.55;
    else if (bgIdx == 3) bgShade = 0.75;
    else bgShade = 1.0;

    // Pick shape (solid only in binary mode, mixed picks random)
    int shapeType = fillType;
    if (modeType == 0) {
        shapeType = 0;
    } else if (fillType == 5) {
        float shapeHash = cellRand(cellMin, 0.0, 3.0);
        shapeType = int(shapeHash * 5.0);  // 0-4
    }

    // Draw shape
    float cornerHash = cellRand(cellMin, 0.0, 4.0);
    float shapeMask = drawShape(shapeType, centered, halfW, halfH, cornerHash);
    float color = mix(bgShade, shade, shapeMask);

    vec3 result = vec3(color);

    // Input texture blend (scaled to wider side, aspect-preserving)
    float blend = inputMix / 100.0;
    if (blend > 0.0) {
        float texScale = 0.3 + cellRand(cellMin, 0.0, 5.0) * 0.7;
        vec2 texUv = cellUv;
        // Correct for aspect ratio difference between cell and texture
        float cellAspect = (cellSize.x * resolution.x) / (cellSize.y * resolution.y);
        float texAspect = resolution.x / resolution.y;
        float ratio = cellAspect / texAspect;
        if (ratio > 1.0) {
            texUv.x = 0.5 + (texUv.x - 0.5) * ratio;
        } else {
            texUv.y = 0.5 + (texUv.y - 0.5) / ratio;
        }
        texUv = texUv * texScale;
        texUv.x += cellRand(cellMin, 0.0, 6.0) * (1.0 - texScale);
        texUv.y += cellRand(cellMin, 0.0, 7.0) * (1.0 - texScale);
        // Apply wrap mode
        int wrapMode = int(wrap);
        if (wrapMode == 0) {
            texUv = abs(mod(texUv + 1.0, 2.0) - 1.0);
        } else if (wrapMode == 1) {
            texUv = mod(texUv, 1.0);
        } else {
            texUv = clamp(texUv, 0.0, 1.0);
        }
        vec3 inputColor = texture(inputTex, texUv).rgb;
        result = mix(result, inputColor, blend);
    }

    // Outline (black, drawn after texture so it stays visible)
    if (isOutline && outline > 0.0) {
        result = vec3(0.0);
    }

    fragColor = vec4(result, 1.0);
}
