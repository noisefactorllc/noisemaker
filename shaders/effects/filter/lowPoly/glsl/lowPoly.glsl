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

// LP_BORDER / LP_LIGHT are compile-time defines injected by the runtime
// (definition.js `define:` fields bake borderWidth / lightIntensity). Keeping
// them compile-time lets the border and lighting blocks be preprocessed out of
// the default variant, so a plain render is byte-identical to the mode result.
#ifndef LP_BORDER
#define LP_BORDER 0
#endif
#ifndef LP_LIGHT
#define LP_LIGHT 0
#endif

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

#if LP_BORDER > 0
vec2 lowPolySite(ivec2 siteCell, float n, float s, float spd) {
    vec2 siteCellF = vec2(siteCell);
    vec2 offset = hash2(siteCellF, s);

    if (spd > 0.0) {
        vec2 animRand = hash2(siteCellF, s + 100.0);
        float angle = time * TAU + animRand.x * TAU;
        float radius = animRand.y * spd;
        offset = clamp(offset + vec2(cos(angle), sin(angle)) * radius, 0.0, 1.0);
    }

    return (siteCellF + offset) / n;
}
#endif

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 tileDims = vec2(texSize);
    vec2 resolution = fullResolution.x > 0.0 ? fullResolution : tileDims;
    vec2 uv = gl_FragCoord.xy / tileDims;
    vec2 globalUV = (gl_FragCoord.xy + tileOffset) / resolution;

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
#if LP_BORDER > 0
    ivec2 nearestCell = ivec2(0);
#endif

    // Search 3x3 neighborhood of cells
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            ivec2 neighbor = cell + ivec2(dx, dy);
            // Inlined seed computation (identical math to lowPolySite) so the
            // primary nearest-site search retains its original per-pixel FP
            // result; lowPolySite() is reused by the border pass below.
            vec2 neighborF = vec2(neighbor);
            vec2 offset = hash2(neighborF, s);
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
#if LP_BORDER > 0
                nearestCell = neighbor;
#endif
            } else if (d < secondDist) {
                thirdDist = secondDist;
                secondDist = d;
            } else if (d < thirdDist) {
                thirdDist = d;
            }
        }
    }

    // Convert nearest point from aspect-corrected global UV to tile-local UV for sampling
    vec2 globalUV_sample = vec2(nearestPoint.x / aspect, nearestPoint.y);
    vec2 localUV_sample = (globalUV_sample * resolution - tileOffset) / tileDims;
    vec4 cellColor = texture(inputTex, localUV_sample);

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

    // Optional borders and lighting layer over the selected Low Poly mode.
    // Both controls are compile-time defines (LP_BORDER / LP_LIGHT): when zero
    // these blocks are preprocessed out entirely, so the established mode result
    // reaches the blend byte-identical to a plain render.
#if (LP_BORDER > 0) || (LP_LIGHT > 0)
    vec3 modeResult = result;
    float borderMask = 0.0;
#endif

#if LP_BORDER > 0
    // Draw a controllable band along cell boundaries. A bounded 5x5 site search
    // measures perpendicular distance to nearby Voronoi bisectors; width is a
    // percentage of the nominal cell radius.
    {
        // The established mode path above intentionally retains its original
        // 3x3 search. Borders opt into a wider exact-nearest search because a
        // fully jittered site two cells away can own the current pixel.
        vec2 borderNearestPoint = nearestPoint;
        ivec2 borderNearestCell = nearestCell;
        float borderNearestDist = minDist;
        for (int dy = -2; dy <= 2; dy++) {
            for (int dx = -2; dx <= 2; dx++) {
                ivec2 candidateCell = cell + ivec2(dx, dy);
                vec2 candidatePoint = lowPolySite(candidateCell, n, s, spd);
                float candidateDist = distance(auv, candidatePoint);
                if (candidateDist < borderNearestDist) {
                    borderNearestDist = candidateDist;
                    borderNearestPoint = candidatePoint;
                    borderNearestCell = candidateCell;
                }
            }
        }
        float distToEdge = 1e10;
        for (int dy = -2; dy <= 2; dy++) {
            for (int dx = -2; dx <= 2; dx++) {
                ivec2 candidateCell = cell + ivec2(dx, dy);
                if (any(notEqual(candidateCell, borderNearestCell))) {
                    vec2 candidatePoint = lowPolySite(candidateCell, n, s, spd);
                    vec2 siteVector = candidatePoint - borderNearestPoint;
                    float siteDistance = max(length(siteVector), 1e-8);
                    float bisectorDistance = dot(
                        (borderNearestPoint + candidatePoint) * 0.5 - auv,
                        siteVector / siteDistance
                    );
                    distToEdge = min(distToEdge, bisectorDistance);
                }
            }
        }
        float cellRadius = 0.5 / n;
        float borderHalfWidth = (float(LP_BORDER) / 100.0) * cellRadius;
        float borderFeather = max(fwidth(distToEdge), 1e-6);
        borderMask = 1.0 - smoothstep(
            borderHalfWidth - borderFeather,
            borderHalfWidth + borderFeather,
            distToEdge
        );
        result = mix(modeResult, edgeColor, borderMask);
    }
#endif

#if LP_LIGHT > 0
    // Raise the selected mode's value with a bounded exposure curve while
    // scaling RGB together. Composite the border afterward so it never brightens.
    {
        float intensity = clamp(float(LP_LIGHT) / 100.0, 0.0, 1.0);
        float paneValue = max(max(modeResult.r, modeResult.g), modeResult.b);
        float exposure = mix(1.0, 2.25, intensity);
        float litValue = 1.0 - pow(max(1.0 - paneValue, 0.0), exposure);
        vec3 litMode = paneValue > 1e-6 ? modeResult * (litValue / paneValue) : modeResult;
        result = mix(litMode, edgeColor, borderMask);
    }
#endif

    // Alpha blend with original
    vec4 original = texture(inputTex, uv);
    fragColor = vec4(mix(original.rgb, result, alpha), original.a);
}
