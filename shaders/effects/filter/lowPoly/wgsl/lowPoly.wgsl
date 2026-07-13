/*
 * Low Poly - Voronoi-based low-polygon art style
 * Generates deterministic seed points, finds nearest Voronoi cell,
 * fills with input color at seed position. Supports flat and distance modes.
 */

struct Uniforms {
    scale: f32,
    seed: f32,
    mode: i32,
    edgeStrength: f32,
    edgeColor: vec3<f32>,
    speed: f32,
    time: f32,
    alpha: f32,
    borderWidth: i32,
    lightIntensity: i32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

// LP_BORDER / LP_LIGHT are compile-time consts injected by the runtime
// (definition.js `define:` fields bake borderWidth / lightIntensity). Keeping
// them compile-time lets naga dead-code-eliminate the border and lighting
// blocks from the default variant, so a plain render is byte-identical to the
// mode result.

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const TAU: f32 = 6.28318530718;

// PCG PRNG - MIT License
fn pcg(seed: vec3<u32>) -> vec3<u32> {
    var v = seed * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn hash2(p: vec2<f32>, s: f32) -> vec2<f32> {
    let v = pcg(vec3<u32>(
        u32(select(-p.x * 2.0 + 1.0, p.x * 2.0, p.x >= 0.0)),
        u32(select(-p.y * 2.0 + 1.0, p.y * 2.0, p.y >= 0.0)),
        u32(select(-s * 2.0 + 1.0, s * 2.0, s >= 0.0)),
    ));
    return vec2<f32>(v.xy) / f32(0xffffffffu);
}

fn lowPolySite(siteCell: vec2<i32>, n: f32, s: f32, spd: f32) -> vec2<f32> {
    let siteCellF = vec2<f32>(siteCell);
    var offset = hash2(siteCellF, s);

    if (spd > 0.0) {
        let animRand = hash2(siteCellF, s + 100.0);
        let angle = uniforms.time * TAU + animRand.x * TAU;
        let radius = animRand.y * spd;
        offset = clamp(offset + vec2<f32>(cos(angle), sin(angle)) * radius, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    return (siteCellF + offset) / n;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let globalUV = (pos.xy + uniforms.tileOffset) / uniforms.fullResolution;

    let n = max(102.0 - uniforms.scale, 2.0);
    let s = uniforms.seed;
    let spd = f32(uniforms.speed) * 0.3;

    // Aspect-corrected coordinates for square Voronoi cells
    let aspect = uniforms.fullResolution.x / uniforms.fullResolution.y;
    let auv = vec2<f32>(globalUV.x * aspect, globalUV.y);

    // Scale to grid in corrected space
    let scaled = auv * n;
    let cell = vec2<i32>(floor(scaled));

    var minDist: f32 = 1e10;
    var secondDist: f32 = 1e10;
    var thirdDist: f32 = 1e10;
    var nearestPoint = vec2<f32>(0.0);
    var nearestCell = vec2<i32>(0);

    // Search 3x3 neighborhood of cells
    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
        for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
            let neighbor = cell + vec2<i32>(dx, dy);
            // Inlined seed computation (identical math to lowPolySite) so the
            // primary nearest-site search retains its original per-pixel FP
            // result; lowPolySite() is reused by the border pass below.
            let neighborF = vec2<f32>(neighbor);
            var offset = hash2(neighborF, s);
            if (spd > 0.0) {
                let animRand = hash2(neighborF, s + 100.0);
                let angle = uniforms.time * TAU + animRand.x * TAU;
                let radius = animRand.y * spd;
                offset = clamp(offset + vec2<f32>(cos(angle), sin(angle)) * radius, vec2<f32>(0.0), vec2<f32>(1.0));
            }
            let point = (neighborF + offset) / n;
            let d = distance(auv, point);

            if (d < minDist) {
                thirdDist = secondDist;
                secondDist = minDist;
                minDist = d;
                nearestPoint = point;
                nearestCell = neighbor;
            } else if (d < secondDist) {
                thirdDist = secondDist;
                secondDist = d;
            } else if (d < thirdDist) {
                thirdDist = d;
            }
        }
    }

    // Convert nearest point back to UV space for texture sampling
    let cellColor = textureSample(inputTex, inputSampler, (vec2<f32>(nearestPoint.x / aspect, nearestPoint.y) * uniforms.fullResolution - uniforms.tileOffset) / texSize);

    var result: vec3<f32>;
    if (uniforms.mode == 0) {
        // Flat: pure solid cell color
        result = cellColor.rgb;
    } else if (uniforms.mode == 1) {
        // Edges: solid cell color with F2-F1 edge darkening
        let edgeDist = clamp((secondDist - minDist) * n * 2.0, 0.0, 1.0);
        let edgeFactor = mix(uniforms.edgeStrength, 0.0, edgeDist);
        result = mix(cellColor.rgb, uniforms.edgeColor, edgeFactor);
    } else {
        // Distance: multiply distance field with cell color
        var selectedDist: f32;
        if (uniforms.mode == 2) { selectedDist = secondDist; }
        else { selectedDist = thirdDist; }
        let raw = clamp(selectedDist * n, 0.0, 1.0);
        let distField = pow(raw, mix(0.5, 3.0, uniforms.edgeStrength));
        result = cellColor.rgb * distField;
    }

    // Optional borders and lighting layer over the selected Low Poly mode.
    // With both controls at zero, the established mode result is untouched.
    let modeResult = result;
    var borderMask: f32 = 0.0;

    // Draw a controllable band along cell boundaries. A bounded 5x5 site search
    // measures perpendicular distance to nearby Voronoi bisectors; width is a
    // percentage of the nominal cell radius. Zero skips this block entirely.
    if (LP_BORDER != 0) {
        // Keep the established mode path's original 3x3 result, but find the
        // exact nearest site for optional border geometry. Full-cell jitter can
        // make a radius-two site own the current pixel.
        var borderNearestPoint = nearestPoint;
        var borderNearestCell = nearestCell;
        var borderNearestDist = minDist;
        for (var dy: i32 = -2; dy <= 2; dy = dy + 1) {
            for (var dx: i32 = -2; dx <= 2; dx = dx + 1) {
                let candidateCell = cell + vec2<i32>(dx, dy);
                let candidatePoint = lowPolySite(candidateCell, n, s, spd);
                let candidateDist = distance(auv, candidatePoint);
                if (candidateDist < borderNearestDist) {
                    borderNearestDist = candidateDist;
                    borderNearestPoint = candidatePoint;
                    borderNearestCell = candidateCell;
                }
            }
        }
        var distToEdge: f32 = 1e10;
        for (var dy: i32 = -2; dy <= 2; dy = dy + 1) {
            for (var dx: i32 = -2; dx <= 2; dx = dx + 1) {
                let candidateCell = cell + vec2<i32>(dx, dy);
                if (any(candidateCell != borderNearestCell)) {
                    let candidatePoint = lowPolySite(candidateCell, n, s, spd);
                    let siteVector = candidatePoint - borderNearestPoint;
                    let siteDistance = max(length(siteVector), 1e-8);
                    let bisectorDistance = dot(
                        (borderNearestPoint + candidatePoint) * 0.5 - auv,
                        siteVector / siteDistance
                    );
                    distToEdge = min(distToEdge, bisectorDistance);
                }
            }
        }
        let cellRadius = 0.5 / n;
        let borderHalfWidth = (f32(LP_BORDER) / 100.0) * cellRadius;
        let borderFeather = max(fwidth(distToEdge), 1e-6);
        borderMask = 1.0 - smoothstep(
            borderHalfWidth - borderFeather,
            borderHalfWidth + borderFeather,
            distToEdge
        );
        result = mix(modeResult, uniforms.edgeColor, borderMask);
    }

    // Raise the selected mode's value with a bounded exposure curve while
    // scaling RGB together. Composite the border afterward so it never brightens.
    // lightIntensity == 0 remains an exact no-op.
    if (LP_LIGHT != 0) {
        let intensity = clamp(f32(LP_LIGHT) / 100.0, 0.0, 1.0);
        let paneValue = max(max(modeResult.r, modeResult.g), modeResult.b);
        let exposure = mix(1.0, 2.25, intensity);
        let litValue = 1.0 - pow(max(1.0 - paneValue, 0.0), exposure);
        var litMode = modeResult;
        if (paneValue > 1e-6) {
            litMode = modeResult * (litValue / paneValue);
        }
        result = mix(litMode, uniforms.edgeColor, borderMask);
    }

    // Alpha blend with original
    let original = textureSample(inputTex, inputSampler, uv);
    return vec4<f32>(mix(original.rgb, result, uniforms.alpha), original.a);
}
