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
    rotateX: f32,
    rotateY: f32,
    rotateZ: f32,
    viewScale: f32,
    posX: f32,
    posY: f32,
    posZ: f32,
    fieldOfView: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var volumeCache: texture_2d<f32>;
@group(0) @binding(2) var analyticalGeo: texture_2d<f32>;

struct FragmentOutput {
    @location(0) fragColor: vec4f,
    @location(1) geoOut: vec4f,
}

fn lighting(color: vec3f, normal: vec3f, viewDirection: vec3f) -> vec3f {
    var light = vec3f(0.0, 1.0, 0.0);
    if (dot(u.lightDirection, u.lightDirection) > 0.000001) { light = normalize(u.lightDirection); }
    let halfVector = light + viewDirection;
    var specular = 0.0;
    if (dot(halfVector, halfVector) > 0.000001) {
        specular = pow(max(dot(normal, normalize(halfVector)), 0.0), 32.0) * u.specularIntensity;
    }
    return color * (u.ambient + max(dot(normal, light), 0.0) * u.diffuseIntensity) + specular;
}

// Filter voxel-center coordinates explicitly, avoiding unrelated atlas rows.
fn sampleAtlasTexel(atlas: texture_2d<f32>, p: vec3i, material: bool) -> vec4f {
    let coord = vec2i(p.x, p.y + p.z * u.volumeSize);
    let value = textureLoad(atlas, coord, 0);
    if (material) {
        // Geometry defines empty samples. Volume alpha can hold unrelated data.
        let present = select(0.0, 1.0, textureLoad(analyticalGeo, coord, 0).a > 0.0);
        return vec4f(value.rgb * present, present);
    }
    return value;
}

// Preserve constant fields exactly so flat surfaces have zero tangential gradient.
fn interpolateAtlas(a: vec4f, b: vec4f, weight: f32) -> vec4f {
    return a + (b - a) * weight;
}

fn sampleAtlas(atlas: texture_2d<f32>, p: vec3f, material: bool) -> vec4f {
    let texel = clamp(p - 0.5, vec3f(0.0), vec3f(f32(u.volumeSize - 1)));
    let lo = vec3i(floor(texel));
    let hi = min(lo + 1, vec3i(u.volumeSize - 1));
    let f = fract(texel);
    let c00 = interpolateAtlas(sampleAtlasTexel(atlas, vec3i(lo.x, lo.y, lo.z), material),
                  sampleAtlasTexel(atlas, vec3i(hi.x, lo.y, lo.z), material), f.x);
    let c10 = interpolateAtlas(sampleAtlasTexel(atlas, vec3i(lo.x, hi.y, lo.z), material),
                  sampleAtlasTexel(atlas, vec3i(hi.x, hi.y, lo.z), material), f.x);
    let c01 = interpolateAtlas(sampleAtlasTexel(atlas, vec3i(lo.x, lo.y, hi.z), material),
                  sampleAtlasTexel(atlas, vec3i(hi.x, lo.y, hi.z), material), f.x);
    let c11 = interpolateAtlas(sampleAtlasTexel(atlas, vec3i(lo.x, hi.y, hi.z), material),
                  sampleAtlasTexel(atlas, vec3i(hi.x, hi.y, hi.z), material), f.x);
    let value = interpolateAtlas(interpolateAtlas(c00, c10, f.y), interpolateAtlas(c01, c11, f.y), f.z);
    if (material && value.a > 0.0) { return vec4f(value.rgb / value.a, value.a); }
    return value;
}

fn isSolid(p: vec3f) -> bool {
    let density = sampleAtlas(analyticalGeo, p, false).a;
    return density > 0.0 && density >= u.threshold;
}

fn isosurfaceDistance(origin: vec3f, direction: vec3f, start: f32, leave: f32) -> f32 {
    if (isSolid(origin + direction * start)) { return start; }
    // Half-voxel steps cover the entire box, including long diagonal rays.
    let stepSize = 0.5 / length(direction);
    var previous = start;
    for (var step = 0; step < u.volumeSize * 4; step++) {
        let distance = min(previous + stepSize, leave);
        if (isSolid(origin + direction * distance)) {
            var lo = previous;
            var hi = distance;
            for (var refine = 0; refine < 8; refine++) {
                let mid = (lo + hi) * 0.5;
                if (isSolid(origin + direction * mid)) { hi = mid; }
                else { lo = mid; }
            }
            // Keep the hit on the solid side, including threshold zero where
            // the midpoint can still have no contributing material samples.
            return hi;
        }
        if (distance >= leave) { break; }
        previous = distance;
    }
    return -1.0;
}

fn isosurfaceNormal(p: vec3f, fallback: vec3f) -> vec3f {
    let gradient = vec3f(
        sampleAtlas(analyticalGeo, p - vec3f(0.5, 0.0, 0.0), false).a - sampleAtlas(analyticalGeo, p + vec3f(0.5, 0.0, 0.0), false).a,
        sampleAtlas(analyticalGeo, p - vec3f(0.0, 0.5, 0.0), false).a - sampleAtlas(analyticalGeo, p + vec3f(0.0, 0.5, 0.0), false).a,
        sampleAtlas(analyticalGeo, p - vec3f(0.0, 0.0, 0.5), false).a - sampleAtlas(analyticalGeo, p + vec3f(0.0, 0.0, 0.5), false).a);
    if (dot(gradient, gradient) > 1e-12) { return normalize(gradient); }
    return fallback;
}

// Inverse of the billboard renderer's X -> Y -> Z rotation.
fn inverseRotation(input: vec3f) -> vec3f {
    let c = cos(vec3f(u.rotateX, u.rotateY, u.rotateZ));
    let s = sin(vec3f(u.rotateX, u.rotateY, u.rotateZ));
    var p = vec3f(input.x * c.z + input.y * s.z, -input.x * s.z + input.y * c.z, input.z);
    p = vec3f(p.x * c.y - p.z * s.y, p.y, p.x * s.y + p.z * c.y);
    return vec3f(p.x, p.y * c.x + p.z * s.x, -p.y * s.x + p.z * c.x);
}

fn forwardRotation(input: vec3f) -> vec3f {
    let c = cos(vec3f(u.rotateX, u.rotateY, u.rotateZ));
    let s = sin(vec3f(u.rotateX, u.rotateY, u.rotateZ));
    var p = vec3f(input.x, input.y * c.x - input.z * s.x, input.y * s.x + input.z * c.x);
    p = vec3f(p.x * c.y + p.z * s.y, p.y, -p.x * s.y + p.z * c.y);
    return vec3f(p.x * c.z - p.y * s.z, p.x * s.z + p.y * c.z, p.z);
}

fn renderPerspective(uv: vec2f) -> FragmentOutput {
    var out: FragmentOutput;
    out.fragColor = vec4f(u.bgColor * u.bgAlpha, u.bgAlpha);
    out.geoOut = vec4f(0.5, 0.5, 1.0, 1.0);
    let size = f32(u.volumeSize);
    let focalLength = 1.0 / tan(clamp(u.fieldOfView, 10.0, 150.0) * 0.00872664626);
    // The volume spans [-40,40]. Position follows rotation; camera Z is 80.
    let origin = (inverseRotation(vec3f(-u.posX, -u.posY, 80.0 - u.posZ)) / 80.0 + 0.5) * size;
    let framedUv = (uv + vec2f(u.panX, u.panY)) / max(u.zoom, 0.001);
    let cameraRay = vec3f(framedUv * 2.0 / (focalLength * max(u.viewScale, 0.001)), -1.0);
    let direction = inverseRotation(cameraRay) * (size / 80.0);
    var nearT = vec3f(-1e30);
    var farT = vec3f(1e30);
    var delta = vec3f(1e30);
    var stepDir = vec3i(0);
    for (var axis = 0; axis < 3; axis++) {
        if (abs(direction[axis]) < 1e-8) {
            if (origin[axis] < 0.0 || origin[axis] >= size) { return out; }
        } else {
            let a = -origin[axis] / direction[axis];
            let b = (size - origin[axis]) / direction[axis];
            nearT[axis] = min(a, b);
            farT[axis] = max(a, b);
            delta[axis] = 1.0 / abs(direction[axis]);
            stepDir[axis] = select(-1, 1, direction[axis] > 0.0);
        }
    }
    let enter = max(max(nearT.x, nearT.y), nearT.z);
    let leave = min(min(farT.x, farT.y), farT.z);
    var distance = max(enter, 0.1);
    if (distance >= leave) { return out; }
    var cell = clamp(vec3i(floor(origin + direction * distance + vec3f(stepDir) * 0.0001)), vec3i(0), vec3i(u.volumeSize - 1));
    var nextT = vec3f(1e30);
    for (var axis = 0; axis < 3; axis++) {
        if (stepDir[axis] != 0) {
            let boundary = f32(cell[axis]) + select(0.0, 1.0, stepDir[axis] > 0);
            nextT[axis] = (boundary - origin[axis]) / direction[axis];
        }
    }
    let viewDirection = normalize(-cameraRay);
    var normal = normalize(-direction);
    if (enter >= 0.1) {
        normal = vec3f(0.0);
        if (nearT.y >= nearT.x && nearT.y >= nearT.z) { normal.y = -f32(stepDir.y); }
        else if (nearT.x >= nearT.z) { normal.x = -f32(stepDir.x); }
        else { normal.z = -f32(stepDir.z); }
    }
    // FILTERING is a module constant; the compiler removes the inactive path.
    if (FILTERING == 0) {
        let hit = isosurfaceDistance(origin, direction, distance, leave);
        if (hit < 0.0) { return out; }
        let p = origin + direction * hit;
        if (hit > distance) { normal = isosurfaceNormal(p, normal); }
        let worldNormal = forwardRotation(normal);
        out.fragColor = vec4f(lighting(sampleAtlas(volumeCache, p, true).rgb, worldNormal, viewDirection), 1.0);
        out.geoOut = vec4f(worldNormal * 0.5 + 0.5, clamp(hit / 320.0, 0.0, 1.0));
        return out;
    }
    for (var step = 0; step < u.volumeSize * 3; step++) {
        if (any(cell < vec3i(0)) || any(cell >= vec3i(u.volumeSize)) || distance >= leave) { break; }
        let atlas = vec2i(cell.x, cell.y + cell.z * u.volumeSize);
        let density = textureLoad(analyticalGeo, atlas, 0).a;
        if (density > 0.0 && density >= u.threshold) {
            let worldNormal = forwardRotation(normal);
            out.fragColor = vec4f(lighting(textureLoad(volumeCache, atlas, 0).rgb, worldNormal, viewDirection), 1.0);
            out.geoOut = vec4f(worldNormal * 0.5 + 0.5, clamp(distance / 320.0, 0.0, 1.0));
            return out;
        }
        distance = min(min(nextT.x, nextT.y), nextT.z);
        let crossed = nextT <= vec3f(distance);
        normal = vec3f(0.0);
        if (crossed.y) { normal.y = -f32(stepDir.y); }
        else if (crossed.x) { normal.x = -f32(stepDir.x); }
        else { normal.z = -f32(stepDir.z); }
        cell += select(vec3i(0), vec3i(1), crossed) * stepDir;
        nextT += select(vec3f(0.0), vec3f(1.0), crossed) * delta;
    }
    return out;
}

@fragment
fn main(@builtin(position) position: vec4f) -> FragmentOutput {
    var out: FragmentOutput;
    out.fragColor = vec4f(u.bgColor * u.bgAlpha, u.bgAlpha);
    out.geoOut = vec4f(0.5, 0.5, 1.0, 1.0);
    let fullRes = select(u.resolution, u.fullResolution, u.fullResolution.x > 0.0);
    let uv = (position.xy + u.tileOffset - fullRes * 0.5) / fullRes.y;
    // VIEW_MODE is a module constant; the compiler removes the inactive path.
    if (VIEW_MODE == 2) { return renderPerspective(uv); }
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

    if (FILTERING == 0) {
        let hit = isosurfaceDistance(origin, vec3f(-1.0), distance, leave);
        if (hit < 0.0) { return out; }
        let p = origin - hit;
        if (hit > distance) { normal = isosurfaceNormal(p, normal); }
        out.fragColor = vec4f(lighting(sampleAtlas(volumeCache, p, true).rgb, normal, vec3f(0.5773502692)), 1.0);
        out.geoOut = vec4f(normal * 0.5 + 0.5, clamp(hit / (size * 4.0), 0.0, 1.0));
        return out;
    }
    for (var step = 0; step < u.volumeSize * 3; step++) {
        if (any(cell < vec3i(0)) || distance >= leave) { break; }
        let atlas = vec2i(cell.x, cell.y + cell.z * u.volumeSize);
        let density = textureLoad(analyticalGeo, atlas, 0).a;
        if (density > 0.0 && density >= u.threshold) {
            let color = textureLoad(volumeCache, atlas, 0).rgb;
            out.fragColor = vec4f(lighting(color, normal, vec3f(0.5773502692)), 1.0);
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
