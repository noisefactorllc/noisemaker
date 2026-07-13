/*
 * Patchwork - needlepoint grid of solid-color squares raised by luminance
 * with lit bevel edges. See patchwork.glsl for the full algorithm
 * derivation (center-anchored grid, 3x3 mini-blur cell color, top-face
 * shading, the analytic per-side bevel construction, and the raised-vs-
 * carved polarity check against filter/craquelure); this is a 1:1 port.
 *
 * tileOffset converts the tile-local fragment position to global
 * procedural coordinates, matching GLSL's `gl_FragCoord.xy + tileOffset`:
 * globalCoord anchors the center-anchored grid (relPx/cellIdxF/
 * cellCenter) in full-image space, and toSampleUV subtracts tileOffset
 * back off before dividing by the tile-local texSize, so the 3x3
 * mini-blur and neighbor-cell samples land on the correct texel
 * regardless of which tile is being rendered - matching
 * filter/mosaicTiles' and filter/halftone's WGSL precedent. fullResolution
 * (guarded the same way as filter/texture's globalDims: falls back to
 * texSize when unset) gives imgCenter the TRUE full-image center rather
 * than this tile's own center, so the grid stays continuous across CLI
 * tiles. Both uniforms are zero/unset for ordinary full-frame renders,
 * where tileOffset=(0,0) and fullResolution=texSize reduce every
 * expression below to the previous non-tiling form exactly.
 *
 * cellIdxF/localPx/edgeNormal/imgCenter are all POSITION-DERIVED (built
 * from globalCoord = pos.xy + tileOffset) and ported with NO manual Y
 * compensation, exactly like filter/extrude's center-anchored imgCenter
 * (see extrude.wgsl's header:
 * "No centerY-style flip is needed for the image center itself... same
 * reasoning as pondRipples' fixed center") - the WebGPU present-time flip
 * cancels the raw Y-convention difference for position-derived geometry
 * automatically. lightDir is a plain function of the lightAngle uniform,
 * not fragment-coordinate-derived at all, so it is textually identical to
 * the GLSL, matching filter/relief's rlShade.wgsl
 * and filter/craquelure's WGSL light-vector precedent.
 *
 * cellAvgColor3x3 uses textureSampleLevel (explicit LOD 0), not
 * textureSample: it is called from inside main()'s `dMin < rimPx`
 * branch, whose condition is genuinely per-fragment data (non-uniform
 * control flow) - the same reasoning as filter/extrude's
 * cellAvgColor3x3.wgsl comment. inputTex is a non-mipmapped
 * render-target-style texture, so LOD 0 is exactly GLSL's texture() here.
 */

struct Uniforms {
    squareSize: f32,
    relief: f32,
    lightAngle: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn toSampleUV(globalPixelPos: vec2<f32>, texSize: vec2<f32>) -> vec2<f32> {
    return clamp((globalPixelPos - uniforms.tileOffset) / texSize, vec2<f32>(0.0), vec2<f32>(1.0));
}

// 3x3 mini-blur centered on a cell - see patchwork.glsl's cellAvgColor3x3.
fn cellAvgColor3x3(centerPx: vec2<f32>, texSize: vec2<f32>) -> vec4<f32> {
    let sp = uniforms.squareSize * 0.25;
    var sum = vec4<f32>(0.0);
    for (var j = -1; j <= 1; j++) {
        for (var i = -1; i <= 1; i++) {
            let p = centerPx + vec2<f32>(f32(i), f32(j)) * sp;
            sum = sum + textureSampleLevel(inputTex, inputSampler, toSampleUV(p, texSize), 0.0);
        }
    }
    return sum * (1.0 / 9.0);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var fullDims = texSize;
    if (uniforms.fullResolution.x > 0.0) { fullDims = uniforms.fullResolution; }
    let globalCoord = pos.xy + uniforms.tileOffset;
    let uv = pos.xy / texSize;
    let srcOwn = textureSample(inputTex, inputSampler, uv);

    // Center-anchored grid - see patchwork.glsl's header for why.
    let imgCenter = fullDims * 0.5;
    let relPx = globalCoord - imgCenter;
    let cellIdxF = floor(relPx / uniforms.squareSize);
    let localPx = relPx - cellIdxF * uniforms.squareSize;
    let cellCenter = imgCenter + (cellIdxF + 0.5) * uniforms.squareSize;

    let cellColor = cellAvgColor3x3(cellCenter, texSize).rgb;
    let h = lum(cellColor);
    let topFaceShade = 0.9 + 0.2 * (h - 0.5);

    // Distance (px) from this rim pixel to each of the cell's 4 edges.
    let rimPx = 0.15 * uniforms.squareSize;
    let dLeft = localPx.x;
    let dRight = uniforms.squareSize - localPx.x;
    let dBottom = localPx.y;
    let dTop = uniforms.squareSize - localPx.y;
    let dMin = min(min(dLeft, dRight), min(dBottom, dTop));

    var bevelMul = 1.0;
    if (dMin < rimPx) {
        var neighborIdx = cellIdxF;
        var edgeNormal: vec2<f32>;
        if (dMin == dLeft) {
            neighborIdx.x = neighborIdx.x - 1.0;
            edgeNormal = vec2<f32>(-1.0, 0.0);
        } else if (dMin == dRight) {
            neighborIdx.x = neighborIdx.x + 1.0;
            edgeNormal = vec2<f32>(1.0, 0.0);
        } else if (dMin == dBottom) {
            neighborIdx.y = neighborIdx.y - 1.0;
            edgeNormal = vec2<f32>(0.0, -1.0);
        } else {
            neighborIdx.y = neighborIdx.y + 1.0;
            edgeNormal = vec2<f32>(0.0, 1.0);
        }

        let neighborCenter = imgCenter + (neighborIdx + 0.5) * uniforms.squareSize;
        let hNeighbor = lum(cellAvgColor3x3(neighborCenter, texSize).rgb);
        let dh = h - hNeighbor;

        let a = radians(uniforms.lightAngle);
        let lightDir = vec2<f32>(cos(a), sin(a));
        let signTerm = dot(edgeNormal, lightDir);

        // See patchwork.glsl's POLARITY DERIVATION.
        bevelMul = 1.0 + 0.35 * (uniforms.relief / 100.0) * sign(dh) * signTerm;
    }

    let result = clamp(cellColor * topFaceShade * bevelMul, vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(result, srcOwn.a);
}
