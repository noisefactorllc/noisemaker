/*
 * Cubemap cloud shell renderer (WGSL) — renderCubemapCloudShell
 *
 * Samples an upstream 3D volume inside a spherical atmospheric band and emits a
 * straight-alpha cloud cubemap for compositing over terrain/ocean layers.
 */

struct Uniforms {
    resolution: vec2<f32>,
    volumeSize: i32,
    innerRadius: f32,
    outerRadius: f32,
    coverage: f32,
    softness: f32,
    density: f32,
    absorption: f32,
    silverLining: f32,
    bgAlpha: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
    cloudColor: vec3<f32>,
    _pad0: f32,
    shadowColor: vec3<f32>,
    _pad1: f32,
    lightDirection: vec3<f32>,
    _pad2: f32,
    bgColor: vec3<f32>,
    _pad3: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> cubeBasis: mat3x3<f32>;
@group(0) @binding(2) var volumeCache: texture_2d<f32>;

struct FragmentOutput {
    @location(0) color: vec4<f32>,
    @location(1) geoOut: vec4<f32>,
}

fn volumeToAtlas(x: i32, y: i32, z: i32, volSize: i32) -> vec2<i32> {
    return vec2<i32>(x, y + z * volSize);
}

fn shellSteps() -> i32 {
    if (QUALITY == 0) { return 32; }
    if (QUALITY == 2) { return 96; }
    return 64;
}

fn sampleVolume(worldPos: vec3<f32>) -> vec4<f32> {
    let volSize = u.volumeSize;
    let volSizeF = f32(volSize);
    var uvw = clamp(worldPos * 0.5 + 0.5, vec3<f32>(0.0), vec3<f32>(1.0));
    let texelPos = uvw * (volSizeF - 1.0);
    let texelFloor = floor(texelPos);
    let frac = texelPos - texelFloor;

    let i0 = vec3<i32>(texelFloor);
    let i1 = min(i0 + 1, vec3<i32>(volSize - 1));

    let c000 = textureLoad(volumeCache, volumeToAtlas(i0.x, i0.y, i0.z, volSize), 0);
    let c100 = textureLoad(volumeCache, volumeToAtlas(i1.x, i0.y, i0.z, volSize), 0);
    let c010 = textureLoad(volumeCache, volumeToAtlas(i0.x, i1.y, i0.z, volSize), 0);
    let c110 = textureLoad(volumeCache, volumeToAtlas(i1.x, i1.y, i0.z, volSize), 0);
    let c001 = textureLoad(volumeCache, volumeToAtlas(i0.x, i0.y, i1.z, volSize), 0);
    let c101 = textureLoad(volumeCache, volumeToAtlas(i1.x, i0.y, i1.z, volSize), 0);
    let c011 = textureLoad(volumeCache, volumeToAtlas(i0.x, i1.y, i1.z, volSize), 0);
    let c111 = textureLoad(volumeCache, volumeToAtlas(i1.x, i1.y, i1.z, volSize), 0);

    let c00 = mix(c000, c100, frac.x);
    let c10 = mix(c010, c110, frac.x);
    let c01 = mix(c001, c101, frac.x);
    let c11 = mix(c011, c111, frac.x);
    let c0 = mix(c00, c10, frac.y);
    let c1 = mix(c01, c11, frac.y);
    return mix(c0, c1, frac.z);
}

fn cloudField(s: vec4<f32>) -> f32 {
    return clamp(max(s.r, max(s.g, s.b)), 0.0, 1.0);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> FragmentOutput {
    let res = select(u.resolution, u.fullResolution, u.fullResolution.x > 0.0);
    let uv = ((position.xy + u.tileOffset) - 0.5 * res) / (0.5 * res.y);
    let rd = normalize(cubeBasis * vec3<f32>(uv.x, uv.y, 1.0));
    let normal = normalize(rd);
    let lightDir = normalize(u.lightDirection);

    let inner = max(0.001, min(u.innerRadius, u.outerRadius));
    let outer = max(inner + 0.001, max(u.innerRadius, u.outerRadius));
    let thickness = outer - inner;
    let c0 = clamp(u.coverage, 0.0, 0.999);
    let c1 = min(1.0, c0 + max(u.softness, 0.001));
    let steps = shellSteps();

    var premul = vec3<f32>(0.0);
    var outAlpha = 0.0;
    var trans = 1.0;
    let dt = thickness / f32(steps);
    var t = inner + dt * 0.5;

    for (var i = 0; i < 96; i = i + 1) {
        if (i >= steps) { break; }
        let layer = clamp((t - inner) / thickness, 0.0, 1.0);
        let radial = smoothstep(0.0, 0.22, layer) * (1.0 - smoothstep(0.78, 1.0, layer));
        let s = sampleVolume((rd * t) / outer);
        let field = cloudField(s);
        let mass = smoothstep(c0, c1, field) * radial;
        let a = 1.0 - exp(-mass * u.density * max(u.absorption, 0.001) / f32(steps));

        let diffuse = 0.35 + 0.65 * max(dot(normal, lightDir), 0.0);
        let rim = pow(max(1.0 - abs(dot(normal, lightDir)), 0.0), 3.0) * u.silverLining;
        var lit = mix(u.shadowColor, u.cloudColor, diffuse) + u.cloudColor * rim;
        lit = lit * mix(0.8, 1.15, field);

        premul = premul + trans * a * lit;
        outAlpha = outAlpha + trans * a;
        trans = trans * (1.0 - a);
        if (trans < 0.01) { break; }
        t = t + dt;
    }

    let finalAlpha = outAlpha + trans * u.bgAlpha;
    let finalPremul = premul + trans * u.bgAlpha * u.bgColor;
    let finalColor = select(u.bgColor, finalPremul / finalAlpha, finalAlpha > 0.0001);

    var output: FragmentOutput;
    output.color = vec4<f32>(clamp(finalColor, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(finalAlpha, 0.0, 1.0));
    output.geoOut = vec4<f32>(normal * 0.5 + 0.5, outAlpha);
    return output;
}
