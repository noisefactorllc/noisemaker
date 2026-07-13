/*
 * Relief - shading pass. See rlShade.glsl for the full algorithm
 * derivation and the Y-orientation / light-angle derivation notes; this is
 * a 1:1 port with NO manual Y compensation anywhere (per orientation-
 * Intermediate render targets use backend-native texture orientation, so _rlBlur
 * reads are orientation-transparent on both backends, and the light
 * vector is a plain function of the lightAngle uniform, not fragment-
 * coordinate-derived).
 *
 * The MODE==2 grain hash is seeded from the tile-aware global pixel
 * coordinate (pos.xy + uniforms.tileOffset, floored), matching GLSL's
 * gl_FragCoord.xy + tileOffset exactly - same tileOffset uniform and
 * usage as filter/wind's WGSL (runtime-provided, defaulting to (0,0) for
 * normal non-tiled rendering), so the grain pattern stays seamless across
 * CLI render tiles instead of restarting at each tile's local origin.
 *
 * MODE is a compile-time const injected by the runtime via injectDefines
 * (see definition.js `globals.mode.define`); it is not declared here.
 */

struct Uniforms {
    detail: f32,
    lightAngle: f32,
    balance: f32,
    graininess: f32,
    inkColor: vec3<f32>,
    paperColor: vec3<f32>,
    tileOffset: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var blurTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn reliefShade(hC: f32, hR: f32, hT: f32, strength: f32, lightAngleDeg: f32) -> f32 {
    let grad = vec2<f32>(hR - hC, hT - hC) * strength;
    let n = normalize(vec3<f32>(-grad, 1.0));
    let a = radians(lightAngleDeg);
    let L = normalize(vec3<f32>(cos(a), sin(a), 0.75));
    return clamp(dot(n, L), 0.0, 1.0);
}

fn tonemap2(t: f32, ink: vec3<f32>, paper: vec3<f32>) -> vec3<f32> {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texel = 1.0 / texSize;
    let src = textureSample(inputTex, inputSampler, uv);

    let hC = lum(textureSample(blurTex, inputSampler, uv).rgb);
    let hR = lum(textureSample(blurTex, inputSampler, uv + vec2<f32>(texel.x, 0.0)).rgb);
    let hT = lum(textureSample(blurTex, inputSampler, uv + vec2<f32>(0.0, texel.y)).rgb);

    let strength = uniforms.detail * 0.2;
    var outColor = vec3<f32>(0.0);

    if (MODE == 1) {
        // Plaster: hard blobby height plateau, inverted (dark source =
        // raised), glossy (squared) shade.
        let hhC = 1.0 - smoothstep(0.35, 0.65, hC);
        let hhR = 1.0 - smoothstep(0.35, 0.65, hR);
        let hhT = 1.0 - smoothstep(0.35, 0.65, hT);
        let shade = reliefShade(hhC, hhR, hhT, strength, uniforms.lightAngle);
        let glossy = pow(shade, 2.0);
        outColor = tonemap2(mix(hhC, glossy, 0.75), uniforms.inkColor, uniforms.paperColor);
    } else if (MODE == 2) {
        // Note Paper: binary threshold cutout with a beveled contour band
        // and grain.
        let threshold = uniforms.balance / 100.0;
        let m = step(threshold, hC);
        let sheet = mix(uniforms.inkColor * 0.9 + 0.1, uniforms.paperColor, m);

        let shade = reliefShade(hC, hR, hT, strength, uniforms.lightAngle);
        let gradMag = length(vec2<f32>(hR - hC, hT - hC));
        let bandHeight = max(gradMag * 2.0, 1e-5);
        let edge = 1.0 - smoothstep(0.0, bandHeight, abs(hC - threshold));
        let beveled = clamp(sheet * mix(0.6, 1.4, shade), vec3<f32>(0.0), vec3<f32>(1.0));
        let sheetOut = mix(sheet, beveled, edge);

        let globalCoord = pos.xy + uniforms.tileOffset;
        let grain = (hash12(floor(globalCoord)) - 0.5) * (uniforms.graininess / 100.0) * 0.15;

        outColor = clamp(sheetOut + vec3<f32>(grain), vec3<f32>(0.0), vec3<f32>(1.0));
    } else {
        // Bas Relief (mode 0, default): shade blended with raw height,
        // linear tonemap.
        let shade = reliefShade(hC, hR, hT, strength, uniforms.lightAngle);
        outColor = tonemap2(mix(hC, shade, 0.75), uniforms.inkColor, uniforms.paperColor);
    }

    return vec4<f32>(outColor, src.a);
}
