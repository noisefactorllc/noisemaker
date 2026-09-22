#version 300 es
precision highp float;
precision highp int;

uniform sampler2D volumeCache;
uniform sampler2D analyticalGeo;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int volumeSize;
uniform float threshold;
uniform float zoom;
uniform float panX;
uniform float panY;
uniform vec3 lightDirection;
uniform float ambient;
uniform float diffuseIntensity;
uniform float specularIntensity;
uniform vec3 bgColor;
uniform float bgAlpha;
#ifndef FILTERING
#define FILTERING 1
#endif
#ifndef VIEW_MODE
#define VIEW_MODE 1
#endif
uniform float rotateX;
uniform float rotateY;
uniform float rotateZ;
uniform float viewScale;
uniform float posX;
uniform float posY;
uniform float posZ;
uniform float fieldOfView;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

vec3 lighting(vec3 color, vec3 normal, vec3 viewDirection) {
    vec3 light = vec3(0.0, 1.0, 0.0);
    if (dot(lightDirection, lightDirection) > 0.000001) light = normalize(lightDirection);
    vec3 halfVector = light + viewDirection;
    float specular = 0.0;
    if (dot(halfVector, halfVector) > 0.000001) {
        specular = pow(max(dot(normal, normalize(halfVector)), 0.0), 32.0) * specularIntensity;
    }
    return color * (ambient + max(dot(normal, light), 0.0) * diffuseIntensity) + specular;
}

// The landscape lattice stores samples at voxel centers. Filter the 3D
// coordinates explicitly so interpolation never crosses unrelated atlas rows.
vec4 sampleAtlasTexel(sampler2D atlas, ivec3 p, bool material) {
    ivec2 coord = ivec2(p.x, p.y + p.z * volumeSize);
    vec4 value = texelFetch(atlas, coord, 0);
    if (material) {
        // Geometry defines empty samples. Volume alpha can hold unrelated data.
        float present = texelFetch(analyticalGeo, coord, 0).a > 0.0 ? 1.0 : 0.0;
        return vec4(value.rgb * present, present);
    }
    return value;
}

// Preserve constant fields exactly so flat surfaces have zero tangential gradient.
vec4 interpolateAtlas(vec4 a, vec4 b, float weight) {
    return a + (b - a) * weight;
}

struct AtlasCoords {
    ivec3 lo;
    vec3 fraction;
};

AtlasCoords atlasCoords(vec3 p) {
    vec3 texel = clamp(p - 0.5, vec3(0.0), vec3(float(volumeSize - 1)));
    return AtlasCoords(ivec3(floor(texel)), fract(texel));
}

vec4 sampleAtlasCoords(sampler2D atlas, AtlasCoords coords, bool material) {
    ivec3 lo = coords.lo;
    ivec3 hi = min(lo + 1, ivec3(volumeSize - 1));
    vec3 f = coords.fraction;
    vec4 c00 = interpolateAtlas(sampleAtlasTexel(atlas, ivec3(lo.x, lo.y, lo.z), material),
                   sampleAtlasTexel(atlas, ivec3(hi.x, lo.y, lo.z), material), f.x);
    vec4 c10 = interpolateAtlas(sampleAtlasTexel(atlas, ivec3(lo.x, hi.y, lo.z), material),
                   sampleAtlasTexel(atlas, ivec3(hi.x, hi.y, lo.z), material), f.x);
    vec4 c01 = interpolateAtlas(sampleAtlasTexel(atlas, ivec3(lo.x, lo.y, hi.z), material),
                   sampleAtlasTexel(atlas, ivec3(hi.x, lo.y, hi.z), material), f.x);
    vec4 c11 = interpolateAtlas(sampleAtlasTexel(atlas, ivec3(lo.x, hi.y, hi.z), material),
                   sampleAtlasTexel(atlas, ivec3(hi.x, hi.y, hi.z), material), f.x);
    vec4 value = interpolateAtlas(interpolateAtlas(c00, c10, f.y), interpolateAtlas(c01, c11, f.y), f.z);
    if (material && value.a > 0.0) value.rgb /= value.a;
    return value;
}

vec4 sampleAtlas(sampler2D atlas, vec3 p, bool material) {
    return sampleAtlasCoords(atlas, atlasCoords(p), material);
}

bool isSolid(AtlasCoords coords) {
    float density = sampleAtlasCoords(analyticalGeo, coords, false).a;
    return density > 0.0 && density >= threshold;
}

struct IsoHit {
    float distance;
    vec3 position;
    AtlasCoords coords;
};

IsoHit traceIsosurface(vec3 origin, vec3 direction, float start, float leave) {
    vec3 position = origin + direction * start;
    AtlasCoords coords = atlasCoords(position);
    if (isSolid(coords)) return IsoHit(start, position, coords);
    // Half-voxel steps cover the entire box, including long diagonal rays.
    float stepSize = 0.5 / length(direction);
    float previous = start;
    for (int step = 0; step < volumeSize * 4; step++) {
        float distance = min(previous + stepSize, leave);
        position = origin + direction * distance;
        coords = atlasCoords(position);
        if (isSolid(coords)) {
            float lo = previous;
            float hi = distance;
            for (int refine = 0; refine < 8; refine++) {
                float mid = (lo + hi) * 0.5;
                vec3 candidate = origin + direction * mid;
                AtlasCoords candidateCoords = atlasCoords(candidate);
                if (isSolid(candidateCoords)) {
                    hi = mid;
                    position = candidate;
                    coords = candidateCoords;
                } else lo = mid;
            }
            // Reuse the tested interpolation coordinates for material sampling.
            // Recomputing them from position can round onto the empty boundary.
            return IsoHit(hi, position, coords);
        }
        if (distance >= leave) break;
        previous = distance;
    }
    return IsoHit(-1.0, vec3(0.0), AtlasCoords(ivec3(0), vec3(0.0)));
}

vec3 isosurfaceNormal(vec3 p, vec3 fallback) {
    vec3 gradient = vec3(
        sampleAtlas(analyticalGeo, p - vec3(0.5, 0.0, 0.0), false).a - sampleAtlas(analyticalGeo, p + vec3(0.5, 0.0, 0.0), false).a,
        sampleAtlas(analyticalGeo, p - vec3(0.0, 0.5, 0.0), false).a - sampleAtlas(analyticalGeo, p + vec3(0.0, 0.5, 0.0), false).a,
        sampleAtlas(analyticalGeo, p - vec3(0.0, 0.0, 0.5), false).a - sampleAtlas(analyticalGeo, p + vec3(0.0, 0.0, 0.5), false).a);
    if (dot(gradient, gradient) > 1e-12) return normalize(gradient);
    return fallback;
}

#if VIEW_MODE == 2
// Inverse of the billboard renderer's X -> Y -> Z rotation.
vec3 inverseRotation(vec3 p) {
    vec3 c = cos(vec3(rotateX, rotateY, rotateZ));
    vec3 s = sin(vec3(rotateX, rotateY, rotateZ));
    p = vec3(p.x * c.z + p.y * s.z, -p.x * s.z + p.y * c.z, p.z);
    p = vec3(p.x * c.y - p.z * s.y, p.y, p.x * s.y + p.z * c.y);
    return vec3(p.x, p.y * c.x + p.z * s.x, -p.y * s.x + p.z * c.x);
}

vec3 forwardRotation(vec3 p) {
    vec3 c = cos(vec3(rotateX, rotateY, rotateZ));
    vec3 s = sin(vec3(rotateX, rotateY, rotateZ));
    p = vec3(p.x, p.y * c.x - p.z * s.x, p.y * s.x + p.z * c.x);
    p = vec3(p.x * c.y + p.z * s.y, p.y, -p.x * s.y + p.z * c.y);
    return vec3(p.x * c.z - p.y * s.z, p.x * s.z + p.y * c.z, p.z);
}

void renderPerspective(vec2 uv) {
    float size = float(volumeSize);
    float focalLength = 1.0 / tan(clamp(fieldOfView, 10.0, 150.0) * 0.00872664626);
    // The native volume spans [-40,40] in billboard world units. Position
    // follows rotation; the camera looks down -Z from (0,0,80).
    vec3 origin = (inverseRotation(vec3(-posX, -posY, 80.0 - posZ)) / 80.0 + 0.5) * size;
    vec2 framedUv = (uv + vec2(panX, panY)) / max(zoom, 0.001);
    vec3 cameraRay = vec3(framedUv * 2.0 / (focalLength * max(viewScale, 0.001)), -1.0);
    vec3 direction = inverseRotation(cameraRay) * (size / 80.0);
    vec3 nearT = vec3(-1e30);
    vec3 farT = vec3(1e30);
    vec3 delta = vec3(1e30);
    ivec3 stepDir = ivec3(0);
    for (int axis = 0; axis < 3; axis++) {
        if (abs(direction[axis]) < 1e-8) {
            if (origin[axis] < 0.0 || origin[axis] >= size) return;
        } else {
            float a = -origin[axis] / direction[axis];
            float b = (size - origin[axis]) / direction[axis];
            nearT[axis] = min(a, b);
            farT[axis] = max(a, b);
            delta[axis] = 1.0 / abs(direction[axis]);
            stepDir[axis] = direction[axis] > 0.0 ? 1 : -1;
        }
    }
    float enter = max(max(nearT.x, nearT.y), nearT.z);
    float leave = min(min(farT.x, farT.y), farT.z);
    // The ray parameter is camera depth in world units, matching billboard clipping.
    float distance = max(enter, 0.1);
    if (distance >= leave) return;
    ivec3 cell = clamp(ivec3(floor(origin + direction * distance + vec3(stepDir) * 0.0001)), ivec3(0), ivec3(volumeSize - 1));
    vec3 nextT = vec3(1e30);
    for (int axis = 0; axis < 3; axis++) {
        if (stepDir[axis] != 0) {
            float boundary = float(cell[axis]) + (stepDir[axis] > 0 ? 1.0 : 0.0);
            nextT[axis] = (boundary - origin[axis]) / direction[axis];
        }
    }
    vec3 viewDirection = normalize(-cameraRay);
    vec3 normal = normalize(-direction);
    if (enter >= 0.1) {
        normal = vec3(0.0);
        if (nearT.y >= nearT.x && nearT.y >= nearT.z) normal.y = -float(stepDir.y);
        else if (nearT.x >= nearT.z) normal.x = -float(stepDir.x);
        else normal.z = -float(stepDir.z);
    }
    // FILTERING is injected as a constant when the runtime compiles a variant.
    if (FILTERING == 0) {
        IsoHit hit = traceIsosurface(origin, direction, distance, leave);
        if (hit.distance < 0.0) return;
        vec3 p = hit.position;
        if (hit.distance > distance) normal = isosurfaceNormal(p, normal);
        vec3 worldNormal = forwardRotation(normal);
        fragColor = vec4(lighting(sampleAtlasCoords(volumeCache, hit.coords, true).rgb, worldNormal, viewDirection), 1.0);
        geoOut = vec4(worldNormal * 0.5 + 0.5, clamp(hit.distance / 320.0, 0.0, 1.0));
        return;
    }
    for (int step = 0; step < volumeSize * 3; step++) {
        if (any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, ivec3(volumeSize))) || distance >= leave) break;
        ivec2 atlas = ivec2(cell.x, cell.y + cell.z * volumeSize);
        float density = texelFetch(analyticalGeo, atlas, 0).a;
        if (density > 0.0 && density >= threshold) {
            vec3 worldNormal = forwardRotation(normal);
            fragColor = vec4(lighting(texelFetch(volumeCache, atlas, 0).rgb, worldNormal, viewDirection), 1.0);
            geoOut = vec4(worldNormal * 0.5 + 0.5, clamp(distance / 320.0, 0.0, 1.0));
            return;
        }
        distance = min(min(nextT.x, nextT.y), nextT.z);
        bvec3 crossed = lessThanEqual(nextT, vec3(distance));
        normal = vec3(0.0);
        if (crossed.y) normal.y = -float(stepDir.y);
        else if (crossed.x) normal.x = -float(stepDir.x);
        else normal.z = -float(stepDir.z);
        cell += ivec3(crossed) * stepDir;
        nextT += vec3(crossed) * delta;
    }
}

#endif

void main() {
    fragColor = vec4(bgColor * bgAlpha, bgAlpha);
    geoOut = vec4(0.5, 0.5, 1.0, 1.0);
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : resolution;
    vec2 uv = (gl_FragCoord.xy + tileOffset - fullRes * 0.5) / fullRes.y;
#if VIEW_MODE == 2
    renderPerspective(uv);
#else
    float size = float(volumeSize);
    float aspect = fullRes.x / fullRes.y;
    // Fit the projected cube in either viewport orientation, with a small margin.
    float span = max(1.6329931619, 1.4142135624 / aspect) * size * 1.08 / max(zoom, 0.001);
    vec3 right = vec3(0.7071067812, 0.0, -0.7071067812);
    vec3 up = vec3(-0.4082482905, 0.8164965809, -0.4082482905);
    vec3 origin = vec3(size * 2.5) + right * (uv.x + panX) * span + up * (uv.y + panY) * span;

    // The fixed isometric ray is (-1,-1,-1). Keeping it unnormalized gives unit DDA steps.
    vec3 nearT = origin - size;
    float enter = max(max(nearT.x, nearT.y), nearT.z);
    float leave = min(min(origin.x, origin.y), origin.z);
    if (enter >= leave) return;
    float distance = max(enter, 0.0);
    ivec3 cell = clamp(ivec3(floor(origin - (distance + 0.0001))), ivec3(0), ivec3(volumeSize - 1));
    vec3 nextT = origin - vec3(cell);
    vec3 normal = vec3(0.0, 0.0, 1.0);
    if (nearT.y >= nearT.x && nearT.y >= nearT.z) normal = vec3(0.0, 1.0, 0.0);
    else if (nearT.x >= nearT.z) normal = vec3(1.0, 0.0, 0.0);

    if (FILTERING == 0) {
        IsoHit hit = traceIsosurface(origin, vec3(-1.0), distance, leave);
        if (hit.distance < 0.0) return;
        vec3 p = hit.position;
        if (hit.distance > distance) normal = isosurfaceNormal(p, normal);
        fragColor = vec4(lighting(sampleAtlasCoords(volumeCache, hit.coords, true).rgb, normal, vec3(0.5773502692)), 1.0);
        geoOut = vec4(normal * 0.5 + 0.5, clamp(hit.distance / (size * 4.0), 0.0, 1.0));
        return;
    }
    // A ray crosses at most 3*N cells, including tied boundaries.
    for (int step = 0; step < volumeSize * 3; step++) {
        if (any(lessThan(cell, ivec3(0))) || distance >= leave) break;
        ivec2 atlas = ivec2(cell.x, cell.y + cell.z * volumeSize);
        float density = texelFetch(analyticalGeo, atlas, 0).a;
        if (density > 0.0 && density >= threshold) {
            vec3 color = texelFetch(volumeCache, atlas, 0).rgb;
            fragColor = vec4(lighting(color, normal, vec3(0.5773502692)), 1.0);
            geoOut = vec4(normal * 0.5 + 0.5, clamp(distance / (size * 4.0), 0.0, 1.0));
            return;
        }
        distance = min(min(nextT.x, nextT.y), nextT.z);
        // Advance every tied axis so edge-only contacts cannot create stray voxels.
        bvec3 crossed = lessThanEqual(nextT, vec3(distance));
        if (crossed.y) normal = vec3(0.0, 1.0, 0.0);
        else if (crossed.x) normal = vec3(1.0, 0.0, 0.0);
        else normal = vec3(0.0, 0.0, 1.0);
        cell -= ivec3(crossed);
        nextT += vec3(crossed);
    }
#endif
}
