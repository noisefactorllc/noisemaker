struct Uniforms {
    rotateX: f32,
    rotateY: f32,
    posZ: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let coord = vec2i(fragCoord.xy);
    let dims = vec2i(textureDimensions(xyzTex, 0));
    let pos = textureLoad(xyzTex, coord, 0);
    var p = pos.xyz;
    if (VIEW_MODE == 1 && abs(p.z) < 1.0 && p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0) {
        p = vec3f(p.xy - 0.5, 0.0);
    }
    p = vec3f(p.x, p.y * cos(u.rotateX) - p.z * sin(u.rotateX), p.y * sin(u.rotateX) + p.z * cos(u.rotateX));
    p = vec3f(p.x * cos(u.rotateY) + p.z * sin(u.rotateY), p.y, -p.x * sin(u.rotateY) + p.z * cos(u.rotateY));
    let depth = p.z + u.posZ - 80.0;
    let key = select(3.402823466e38, depth, pos.w >= 0.5 && abs(depth) <= 3.402823466e38);
    return vec4f(key, f32(coord.y * dims.x + coord.x), 0.0, 1.0);
}
