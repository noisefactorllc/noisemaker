struct Uniforms {
    volumeSize: i32,
    heightScale: f32,
    baseHeight: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var heightTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct FragmentOutput {
    @location(0) fragColor: vec4f,
    @location(1) geoOut: vec4f,
}

// Native atlases and 2D surfaces use the same logical texel coordinates on both backends.
fn imageTexel(column: vec2i, size: vec2i) -> vec2i {
    return clamp(((column * 2 + 1) * size) / (u.volumeSize * 2), vec2i(0), size - 1);
}

fn columnHeight(column: vec2i) -> f32 {
    let rgb = textureLoad(heightTex, imageTexel(column, vec2i(textureDimensions(heightTex))), 0).rgb;
    let luminance = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
    return floor(clamp(luminance * u.heightScale + u.baseHeight, 0.0, 1.0) * f32(u.volumeSize) + 0.5);
}

fn density(p: vec3i) -> f32 {
    if (any(p < vec3i(0)) || any(p >= vec3i(u.volumeSize))) { return 0.0; }
    return select(0.0, 1.0, f32(p.y) < columnHeight(p.xz));
}

@fragment
fn main(@builtin(position) position: vec4f) -> FragmentOutput {
    let atlas = vec2i(position.xy);
    let p = vec3i(atlas.x, atlas.y % u.volumeSize, atlas.y / u.volumeSize);
    let occupied = density(p);
    var out: FragmentOutput;
    out.fragColor = vec4f(0.0);
    out.geoOut = vec4f(0.5, 1.0, 0.5, 0.0);
    if (occupied == 0.0) { return out; }

    let color = textureLoad(tex, imageTexel(p.xz, vec2i(textureDimensions(tex))), 0).rgb;
    out.fragColor = vec4f(color, occupied);
    var normal = vec3f(
        density(p - vec3i(1, 0, 0)) - density(p + vec3i(1, 0, 0)),
        density(p - vec3i(0, 1, 0)) - density(p + vec3i(0, 1, 0)),
        density(p - vec3i(0, 0, 1)) - density(p + vec3i(0, 0, 1))
    );
    if (dot(normal, normal) > 0.0) { normal = normalize(normal); }
    else { normal = vec3f(0.0, 1.0, 0.0); }
    out.geoOut = vec4f(normal * 0.5 + 0.5, occupied);
    return out;
}
