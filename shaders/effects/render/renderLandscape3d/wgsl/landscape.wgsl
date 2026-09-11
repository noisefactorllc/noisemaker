struct Uniforms {
    resolution: vec2f,
    tileOffset: vec2f,
    fullResolution: vec2f,
    volumeSize: i32,
    threshold: f32,
    zoom: f32,
    panX: f32,
    panY: f32,
    ambient: f32,
    lightDirection: vec3f,
    diffuseIntensity: f32,
    bgColor: vec3f,
    specularIntensity: f32,
    bgAlpha: f32,
    densitySource: i32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var volumeCache: texture_2d<f32>;
@group(0) @binding(2) var analyticalGeo: texture_2d<f32>;

struct FragmentOutput {
    @location(0) fragColor: vec4f,
    @location(1) geoOut: vec4f,
}

fn lighting(color: vec3f, normal: vec3f) -> vec3f {
    var light = vec3f(0.0, 1.0, 0.0);
    if (dot(u.lightDirection, u.lightDirection) > 0.000001) { light = normalize(u.lightDirection); }
    let halfVector = light + vec3f(0.5773502692);
    var specular = 0.0;
    if (dot(halfVector, halfVector) > 0.000001) {
        specular = pow(max(dot(normal, normalize(halfVector)), 0.0), 32.0) * u.specularIntensity;
    }
    return color * (u.ambient + max(dot(normal, light), 0.0) * u.diffuseIntensity) + specular;
}

@fragment
fn main(@builtin(position) position: vec4f) -> FragmentOutput {
    var out: FragmentOutput;
    out.fragColor = vec4f(u.bgColor, u.bgAlpha);
    out.geoOut = vec4f(0.5, 0.5, 1.0, 1.0);
    let fullRes = select(u.resolution, u.fullResolution, u.fullResolution.x > 0.0);
    let uv = (position.xy + u.tileOffset - fullRes * 0.5) / fullRes.y;
    let size = f32(u.volumeSize);
    let aspect = fullRes.x / fullRes.y;
    let span = max(1.6329931619, 1.4142135624 / aspect) * size * 1.08 / max(u.zoom, 0.001);
    let right = vec3f(0.7071067812, 0.0, -0.7071067812);
    let up = vec3f(-0.4082482905, 0.8164965809, -0.4082482905);
    let origin = vec3f(size * 2.5) + right * (uv.x + u.panX) * span + up * (uv.y + u.panY) * span;

    let nearT = origin - size;
    let enter = max(max(nearT.x, nearT.y), nearT.z);
    let leave = min(min(origin.x, origin.y), origin.z);
    if (enter >= leave) { return out; }
    var distance = max(enter, 0.0);
    var cell = clamp(vec3i(floor(origin - (distance + 0.0001))), vec3i(0), vec3i(u.volumeSize - 1));
    var nextT = origin - vec3f(cell);
    var normal = vec3f(0.0, 0.0, 1.0);
    if (nearT.y >= nearT.x && nearT.y >= nearT.z) { normal = vec3f(0.0, 1.0, 0.0); }
    else if (nearT.x >= nearT.z) { normal = vec3f(1.0, 0.0, 0.0); }

    for (var step = 0; step < u.volumeSize * 3; step++) {
        if (any(cell < vec3i(0)) || distance >= leave) { break; }
        let atlas = vec2i(cell.x, cell.y + cell.z * u.volumeSize);
        var density = textureLoad(analyticalGeo, atlas, 0).a;
        if (u.densitySource == 1) { density = textureLoad(volumeCache, atlas, 0).r; }
        if (density > 0.0 && density >= u.threshold) {
            let color = textureLoad(volumeCache, atlas, 0).rgb;
            out.fragColor = vec4f(lighting(color, normal), 1.0);
            out.geoOut = vec4f(normal * 0.5 + 0.5, clamp(distance / (size * 4.0), 0.0, 1.0));
            return out;
        }
        distance = min(min(nextT.x, nextT.y), nextT.z);
        let crossed = nextT <= vec3f(distance);
        if (crossed.y) { normal = vec3f(0.0, 1.0, 0.0); }
        else if (crossed.x) { normal = vec3f(1.0, 0.0, 0.0); }
        else { normal = vec3f(0.0, 0.0, 1.0); }
        cell -= select(vec3i(0), vec3i(1), crossed);
        nextT += select(vec3f(0.0), vec3f(1.0), crossed);
    }
    return out;
}
