/*
 * Light Leak: Voronoi-based colored light leak with wormhole distortion,
 * bloom approximation, screen blend, center mask, and vaseline blur.
 */

const TAU : f32 = 6.28318530717958647692;
const POINT_COUNT : u32 = 6u;

struct Uniforms {
    alpha: f32,
    speed: f32,
    seed: i32,
    _pad0: f32,
    color: vec3<f32>,
    _pad1: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> time: f32;

fn pcg(seed: vec3<u32>) -> vec3<u32> {
    var v = seed * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn hash31(p : vec3<f32>) -> f32 {
    let v = pcg(vec3<u32>(
        u32(select(-p.x * 2.0 + 1.0, p.x * 2.0, p.x >= 0.0)),
        u32(select(-p.y * 2.0 + 1.0, p.y * 2.0, p.y >= 0.0)),
        u32(select(-p.z * 2.0 + 1.0, p.z * 2.0, p.z >= 0.0)),
    ));
    return f32(v.x) / f32(0xffffffffu);
}

fn hash33(p : vec3<f32>) -> vec3<f32> {
    let v = pcg(vec3<u32>(
        u32(select(-p.x * 2.0 + 1.0, p.x * 2.0, p.x >= 0.0)),
        u32(select(-p.y * 2.0 + 1.0, p.y * 2.0, p.y >= 0.0)),
        u32(select(-p.z * 2.0 + 1.0, p.z * 2.0, p.z >= 0.0)),
    ));
    return vec3<f32>(
        f32(v.x) / f32(0xffffffffu),
        f32(v.y) / f32(0xffffffffu),
        f32(v.z) / f32(0xffffffffu),
    );
}

fn luminance(c : vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}

// Voronoi: find nearest of 6 seed-based points
// Returns cell color in rgb and squared distance in w
fn voronoiCell(uv : vec2<f32>, seed_f : f32, t : f32, user_color : vec3<f32>) -> vec4<f32> {
    var best_dist : f32 = 1e9;
    var best_index : u32 = 0u;
    let drift : f32 = 0.05;

    var i : u32 = 0u;
    loop {
        if (i >= POINT_COUNT) {
            break;
        }
        let s : vec3<f32> = vec3<f32>(seed_f, f32(i) * 7.31, 0.0);
        let base : vec2<f32> = hash33(s).xy;
        let osc : vec2<f32> = vec2<f32>(
            sin(t * 0.7 + f32(i) * 1.618),
            cos(t * 0.5 + f32(i) * 2.236),
        ) * drift;
        let pt : vec2<f32> = fract(base + osc);
        let delta : vec2<f32> = abs(uv - pt);
        let wd : vec2<f32> = min(delta, 1.0 - delta);
        let dist : f32 = dot(wd, wd);
        if (dist < best_dist) {
            best_dist = dist;
            best_index = i;
        }
        i = i + 1u;
    }

    let cs : vec3<f32> = vec3<f32>(seed_f + 100.0, f32(best_index) * 13.37, 5.0);
    let cell_color : vec3<f32> = mix(hash33(cs), user_color, 0.6);
    return vec4<f32>(cell_color, best_dist);
}

fn centerMask(uv : vec2<f32>) -> f32 {
    let centered : vec2<f32> = abs(uv - 0.5);
    let dist : f32 = max(centered.x, centered.y);
    return clamp(dist * 2.0, 0.0, 1.0);
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let texSize : vec2<f32> = vec2<f32>(textureDimensions(inputTex));
    let uv : vec2<f32> = pos.xy / texSize;
    let coords : vec2<i32> = vec2<i32>(i32(pos.x), i32(pos.y));
    let dims : vec2<i32> = vec2<i32>(textureDimensions(inputTex));

    let base : vec4<f32> = textureSample(inputTex, inputSampler, uv);
    let blend_alpha : f32 = clamp(uniforms.alpha, 0.0, 1.0);
    if (blend_alpha <= 0.0) {
        return base;
    }

    let seed_f : f32 = f32(uniforms.seed);
    let t : f32 = time * uniforms.speed;
    let user_color : vec3<f32> = uniforms.color;

    // Voronoi at current position (for wormhole direction)
    let base_vor : vec4<f32> = voronoiCell(uv, seed_f, t, user_color);

    // Wormhole distortion
    let luma : f32 = luminance(base_vor.rgb);
    let angle : f32 = luma * TAU + t * uniforms.speed * 0.5;
    let warp : vec2<f32> = vec2<f32>(cos(angle), sin(angle)) * 0.25;
    let warped_uv : vec2<f32> = fract(uv + warp);

    // Voronoi at warped position
    let warp_vor : vec4<f32> = voronoiCell(warped_uv, seed_f, t, user_color);

    // Approximate bloom using distance falloff
    let glow : f32 = exp(-warp_vor.w * 12.0);
    let bloom_color : vec3<f32> = mix(warp_vor.rgb, warp_vor.rgb * 1.3, glow);

    // Mix wormhole result with bloom
    let leak : vec3<f32> = clamp(
        mix(sqrt(clamp(warp_vor.rgb, vec3<f32>(0.0), vec3<f32>(1.0))), bloom_color, 0.55),
        vec3<f32>(0.0), vec3<f32>(1.0),
    );

    // Screen blend: 1 - (1 - base) * (1 - leak)
    let screened : vec3<f32> = vec3<f32>(1.0) - (vec3<f32>(1.0) - base.rgb) * (vec3<f32>(1.0) - leak);

    // Center mask: leak is stronger away from center
    let mask : f32 = pow(centerMask(uv), 4.0);
    let masked : vec3<f32> = mix(base.rgb, screened, mask);

    // Vaseline-style soft blur via neighbor texel loads
    var soft_accum : vec3<f32> = masked * 4.0;
    var soft_w : f32 = 4.0;
    let max_coord : vec2<i32> = dims - vec2<i32>(1);
    let nb0 : vec2<i32> = clamp(coords + vec2<i32>(2, 0), vec2<i32>(0), max_coord);
    let nb1 : vec2<i32> = clamp(coords + vec2<i32>(-2, 0), vec2<i32>(0), max_coord);
    let nb2 : vec2<i32> = clamp(coords + vec2<i32>(0, 2), vec2<i32>(0), max_coord);
    let nb3 : vec2<i32> = clamp(coords + vec2<i32>(0, -2), vec2<i32>(0), max_coord);
    soft_accum = soft_accum + textureLoad(inputTex, nb0, 0).rgb;
    soft_accum = soft_accum + textureLoad(inputTex, nb1, 0).rgb;
    soft_accum = soft_accum + textureLoad(inputTex, nb2, 0).rgb;
    soft_accum = soft_accum + textureLoad(inputTex, nb3, 0).rgb;
    soft_w = soft_w + 4.0;
    let vaseline : vec3<f32> = soft_accum / soft_w;

    // Final blend with alpha
    let final_color : vec3<f32> = mix(base.rgb, mix(masked, vaseline, blend_alpha), blend_alpha);
    let clamped : vec3<f32> = clamp(final_color, vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(clamped, base.a);
}
