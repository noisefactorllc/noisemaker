struct Uniforms {
    volumeSize: i32,
    heightScale: f32,
    baseHeight: f32,
    aspect: f32,
    aspectInv: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var heightTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct FragmentOutput {
    @location(0) fragColor: vec4f,
    @location(1) geoOut: vec4f,
}

// The terrain keeps the frame's proportions inside the square footprint of the
// volume. On a wide frame it spans the volume's width and a part of its depth,
// on a tall frame the depth and a part of the width, and on a square frame all
// of both. Each span is a whole, even count of columns, so the terrain is
// centered. aspect and aspectInv are the frame's width over its height and the
// inverse. They are computed outside the shader and the volume size is a power
// of two, so both backends get the same counts.
fn terrainSpan() -> vec2i {
    let halfSize = f32(u.volumeSize) * 0.5;
    return vec2i(
        select(u.volumeSize, max(2, 2 * i32(floor(halfSize * u.aspect + 0.5))), u.aspect < 1.0),
        select(u.volumeSize, max(2, 2 * i32(floor(halfSize * u.aspectInv + 0.5))), u.aspectInv < 1.0));
}

// The place of an XZ voxel column in the terrain, counted in columns from the
// terrain's own corner. Volume z = 0 is toward the image's top row, so a view
// from above along -Y, screen right on +X, shows the image as authored rather
// than mirrored.
fn terrainColumn(column: vec2i) -> vec2i {
    return vec2i(column.x, u.volumeSize - 1 - column.y) - (vec2i(u.volumeSize) - terrainSpan()) / 2;
}

fn inTerrain(column: vec2i) -> bool {
    let image = terrainColumn(column);
    return all(image >= vec2i(0)) && all(image < terrainSpan());
}

// Native atlases and 2D surfaces use the same logical texel coordinates on both backends.
// Sample each image independently at the center of the XZ voxel column.
fn imageTexel(column: vec2i, size: vec2i) -> vec2i {
    return clamp(((terrainColumn(column) * 2 + 1) * size) / (terrainSpan() * 2), vec2i(0), size - 1);
}

fn columnHeight(column: vec2i) -> f32 {
    if (!inTerrain(column)) { return 0.0; }
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
