/*
 * Recursive grid subdivision with shapes
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, mode, depth)
    // data[1] = (density, seed, fill, outline)
    // data[2] = (inputMix, wrap, time, speed)
    data: array<vec4<f32>, 3>,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

// PCG PRNG - deterministic across platforms
fn pcg(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn prng(p: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(pcg(vec3<u32>(u32(p.x), u32(p.y), u32(p.z)))) / f32(0xffffffffu);
}

// Get a random float for a cell at a given level and channel
// Golden ratio for staggering level transitions
const PHI: f32 = 1.618033988749895;

fn cellRand(cellMin: vec2<f32>, level: f32, channel: f32, animSeed: f32) -> f32 {
    let cx = floor(cellMin.x * 1000.0);
    let cy = floor(cellMin.y * 1000.0);
    let seed = u.data[1].y;
    return prng(vec3<f32>(cx + level * 7.0, cy + level * 13.0, seed + channel + animSeed * 100.0)).x;
}

// Shape functions (1.0 inside, 0.0 outside)
// All work in 1:1 aspect-corrected centered coords
fn circleShape(centered: vec2<f32>) -> f32 {
    return step(length(centered), 0.32);
}

fn diamondShape(centered: vec2<f32>) -> f32 {
    return step(abs(centered.x) + abs(centered.y), 0.32);
}

fn squareShape(centered: vec2<f32>) -> f32 {
    return step(max(abs(centered.x), abs(centered.y)), 0.28);
}

fn arcShape(centered: vec2<f32>, halfW: f32, halfH: f32, h: f32) -> f32 {
    let corner = i32(h * 4.0);
    var origin: vec2<f32>;
    if (corner == 0) { origin = vec2<f32>(-halfW, -halfH); }
    else if (corner == 1) { origin = vec2<f32>(halfW, -halfH); }
    else if (corner == 2) { origin = vec2<f32>(-halfW, halfH); }
    else { origin = vec2<f32>(halfW, halfH); }
    let dist = length(centered - origin);
    return step(dist, 0.7) * (1.0 - step(dist, 0.5));
}

fn drawShape(shapeType: i32, centered: vec2<f32>, halfW: f32, halfH: f32, h: f32) -> f32 {
    if (shapeType == 0) { return 1.0; }  // solid
    if (shapeType == 1) { return circleShape(centered); }
    if (shapeType == 2) { return diamondShape(centered); }
    if (shapeType == 3) { return squareShape(centered); }
    if (shapeType == 4) { return arcShape(centered, halfW, halfH, h); }
    return 1.0;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = u.data[0].xy;
    let modeType = i32(u.data[0].z);
    let maxDepth = i32(u.data[0].w);
    let dens = u.data[1].x / 100.0;
    let fillType = i32(u.data[1].z);
    let outlineWidthX = u.data[1].w / resolution.x;
    let outlineWidthY = u.data[1].w / resolution.y;

    let time = u.data[2].z;
    let spd = floor(u.data[2].w) * 2.0;

    let st = pos.xy / resolution;

    // Subdivision loop
    var cellMin = vec2<f32>(0.0);
    var cellMax = vec2<f32>(1.0);
    var isOutline = false;

    for (var level = 0; level < 6; level = level + 1) {
        if (level >= maxDepth) { break; }

        // Stagger each level's transition using golden ratio
        let levelTime = floor(time * spd + f32(level) * PHI);
        let h = cellRand(cellMin, f32(level), 0.0, levelTime);

        if (h < dens) {
            // Skip splits that would create too-narrow cells (max 5:1 aspect)
            let cellW = (cellMax.x - cellMin.x) * resolution.x;
            let cellH = (cellMax.y - cellMin.y) * resolution.y;
            let canSplitH = min(cellW, cellH * 0.5) / max(cellW, cellH * 0.5) >= 0.2;
            let canSplitV = min(cellW * 0.5, cellH) / max(cellW * 0.5, cellH) >= 0.2;

            if (modeType == 0) {
                let dir = cellRand(cellMin, f32(level), 1.0, levelTime);
                var splitDir = -1;
                if (dir < 0.5) {
                    if (canSplitH) { splitDir = 0; }
                    else if (canSplitV) { splitDir = 1; }
                } else {
                    if (canSplitV) { splitDir = 1; }
                    else if (canSplitH) { splitDir = 0; }
                }
                if (splitDir == 0) {
                    let mid = (cellMin.y + cellMax.y) * 0.5;
                    if (abs(st.y - mid) < outlineWidthY) { isOutline = true; }
                    if (st.y < mid) { cellMax.y = mid; }
                    else { cellMin.y = mid; }
                } else if (splitDir == 1) {
                    let mid = (cellMin.x + cellMax.x) * 0.5;
                    if (abs(st.x - mid) < outlineWidthX) { isOutline = true; }
                    if (st.x < mid) { cellMax.x = mid; }
                    else { cellMin.x = mid; }
                }
            } else {
                if (canSplitH && canSplitV) {
                    let mid = (cellMin + cellMax) * 0.5;
                    if (abs(st.x - mid.x) < outlineWidthX || abs(st.y - mid.y) < outlineWidthY) {
                        isOutline = true;
                    }
                    if (st.x < mid.x) { cellMax.x = mid.x; }
                    else { cellMin.x = mid.x; }
                    if (st.y < mid.y) { cellMax.y = mid.y; }
                    else { cellMin.y = mid.y; }
                }
            }
        }
    }

    // Cell properties
    let cellSize = cellMax - cellMin;
    let cellUv = (st - cellMin) / cellSize;

    // 1:1 aspect-corrected coords, scaled to fit shorter side
    let cellPixelW = cellSize.x * resolution.x;
    let cellPixelH = cellSize.y * resolution.y;
    let minDim = min(cellPixelW, cellPixelH);
    var centered = cellUv - 0.5;
    centered.x = centered.x * (cellPixelW / minDim);
    centered.y = centered.y * (cellPixelH / minDim);
    let halfW = cellPixelW / minDim * 0.5;
    let halfH = cellPixelH / minDim * 0.5;

    // Visual properties use their own staggered phase
    let visualTime = floor(time * spd + PHI * 7.0);

    // Pick shape and background shades from same palette
    let shadeHash = cellRand(cellMin, 0.0, 2.0, visualTime);
    let shadeIdx = i32(shadeHash * 5.0);
    var shade: f32;
    if (shadeIdx == 0) { shade = 0.15; }
    else if (shadeIdx == 1) { shade = 0.35; }
    else if (shadeIdx == 2) { shade = 0.55; }
    else if (shadeIdx == 3) { shade = 0.75; }
    else { shade = 1.0; }

    let bgHash = cellRand(cellMin, 0.0, 8.0, visualTime);
    let bgIdx = i32(bgHash * 5.0);
    var bgShade: f32;
    if (bgIdx == 0) { bgShade = 0.15; }
    else if (bgIdx == 1) { bgShade = 0.35; }
    else if (bgIdx == 2) { bgShade = 0.55; }
    else if (bgIdx == 3) { bgShade = 0.75; }
    else { bgShade = 1.0; }

    // Pick shape (solid only in binary mode, mixed picks random)
    var shapeType = fillType;
    if (modeType == 0) {
        shapeType = 0;
    } else if (fillType == 5) {
        let shapeHash = cellRand(cellMin, 0.0, 3.0, visualTime);
        shapeType = i32(shapeHash * 5.0);  // 0-4
    }

    // Draw shape
    let cornerHash = cellRand(cellMin, 0.0, 4.0, visualTime);
    let shapeMask = drawShape(shapeType, centered, halfW, halfH, cornerHash);
    var color = mix(bgShade, shade, shapeMask);

    var result = vec3<f32>(color);

    // Input texture blend (random scale, offset, aspect-preserving)
    let blend = u.data[2].x / 100.0;
    if (blend > 0.0) {
        let texScale = 0.3 + cellRand(cellMin, 0.0, 5.0, visualTime) * 0.7;
        var texUv = cellUv;
        // Correct for aspect ratio difference between cell and texture
        let cellAspect = (cellSize.x * resolution.x) / (cellSize.y * resolution.y);
        let texAspect = resolution.x / resolution.y;
        let ratio = cellAspect / texAspect;
        if (ratio > 1.0) {
            texUv.x = 0.5 + (texUv.x - 0.5) * ratio;
        } else {
            texUv.y = 0.5 + (texUv.y - 0.5) / ratio;
        }
        texUv = texUv * texScale;
        texUv.x = texUv.x + cellRand(cellMin, 0.0, 6.0, visualTime) * (1.0 - texScale);
        texUv.y = texUv.y + cellRand(cellMin, 0.0, 7.0, visualTime) * (1.0 - texScale);
        // Apply wrap mode
        let wrapMode = i32(u.data[2].y);
        if (wrapMode == 0) {
            texUv = abs((texUv + 1.0) % 2.0 - 1.0);
        } else if (wrapMode == 1) {
            texUv = texUv % 1.0;
        } else {
            texUv = clamp(texUv, vec2<f32>(0.0), vec2<f32>(1.0));
        }
        let inputColor = textureSample(inputTex, samp, texUv).rgb;
        result = mix(result, inputColor, blend);
    }

    // Outline (black, drawn after texture so it stays visible)
    if (isOutline && u.data[1].w > 0.0) {
        result = vec3<f32>(0.0);
    }

    return vec4<f32>(result, 1.0);
}
