// Clouds effect pass 3: Upsample and composite onto input image
// Input: shadedTex (R=combined, G=shaded), inputTex (original image)
// Output: Final cloud-covered image with shadow effect

@group(0) @binding(0) var shadedTex: texture_2d<f32>;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;

fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn wrap_index(value: i32, limit: i32) -> i32 {
    if (limit <= 0) {
        return 0;
    }
    var wrapped: i32 = value % limit;
    if (wrapped < 0) {
        wrapped = wrapped + limit;
    }
    return wrapped;
}

fn read_shaded_channel(coord: vec2<i32>, size: vec2<i32>, channel: u32) -> f32 {
    let width: i32 = max(size.x, 1);
    let height: i32 = max(size.y, 1);
    let safeX: i32 = wrap_index(coord.x, width);
    let safeY: i32 = wrap_index(coord.y, height);
    
    let val: vec4<f32> = textureLoad(shadedTex, vec2<i32>(safeX, safeY), 0);
    if (channel == 0u) { return val.r; }
    if (channel == 1u) { return val.g; }
    if (channel == 2u) { return val.b; }
    return val.a;
}

fn cubic_interpolate(a: f32, b: f32, c: f32, d: f32, t: f32) -> f32 {
    let t2: f32 = t * t;
    let t3: f32 = t2 * t;
    let a0: f32 = d - c - a + b;
    let a1: f32 = a - b - a0;
    let a2: f32 = c - a;
    let a3: f32 = b;
    return a0 * t3 + a1 * t2 + a2 * t + a3;
}

fn sample_channel_bicubic(uv: vec2<f32>, size: vec2<i32>, channel: u32) -> f32 {
    let width: i32 = max(size.x, 1);
    let height: i32 = max(size.y, 1);
    let scaleVec: vec2<f32> = vec2<f32>(f32(width), f32(height));
    let baseCoord: vec2<f32> = uv * scaleVec - vec2<f32>(0.5, 0.5);

    let ix: i32 = i32(floor(baseCoord.x));
    let iy: i32 = i32(floor(baseCoord.y));
    let fx: f32 = clamp(baseCoord.x - floor(baseCoord.x), 0.0, 1.0);
    let fy: f32 = clamp(baseCoord.y - floor(baseCoord.y), 0.0, 1.0);

    var column: array<f32, 4>;

    for (var m: i32 = -1; m <= 2; m = m + 1) {
        var row: array<f32, 4>;
        for (var n: i32 = -1; n <= 2; n = n + 1) {
            let sampleCoord: vec2<i32> = vec2<i32>(
                wrap_index(ix + n, width),
                wrap_index(iy + m, height)
            );
            row[n + 1] = read_shaded_channel(sampleCoord, size, channel);
        }
        column[m + 1] = cubic_interpolate(row[0], row[1], row[2], row[3], fx);
    }

    let value: f32 = cubic_interpolate(column[0], column[1], column[2], column[3], fy);
    return clamp(value, 0.0, 1.0);
}

fn sample_input_bilinear(uv: vec2<f32>, texSize: vec2<i32>) -> vec4<f32> {
    let width: f32 = f32(texSize.x);
    let height: f32 = f32(texSize.y);
    
    let coord: vec2<f32> = vec2<f32>(uv.x * width - 0.5, uv.y * height - 0.5);
    let coordFloor: vec2<i32> = vec2<i32>(i32(floor(coord.x)), i32(floor(coord.y)));
    let fractPart: vec2<f32> = vec2<f32>(coord.x - floor(coord.x), coord.y - floor(coord.y));
    
    let x0: i32 = wrap_index(coordFloor.x, texSize.x);
    let y0: i32 = wrap_index(coordFloor.y, texSize.y);
    let x1: i32 = wrap_index(coordFloor.x + 1, texSize.x);
    let y1: i32 = wrap_index(coordFloor.y + 1, texSize.y);
    
    let p00: vec4<f32> = textureLoad(inputTex, vec2<i32>(x0, y0), 0);
    let p10: vec4<f32> = textureLoad(inputTex, vec2<i32>(x1, y0), 0);
    let p01: vec4<f32> = textureLoad(inputTex, vec2<i32>(x0, y1), 0);
    let p11: vec4<f32> = textureLoad(inputTex, vec2<i32>(x1, y1), 0);
    
    let p0: vec4<f32> = mix(p00, p10, fractPart.x);
    let p1: vec4<f32> = mix(p01, p11, fractPart.x);
    
    return mix(p0, p1, fractPart.y);
}

fn sobel_gradient(uv: vec2<f32>, size: vec2<i32>) -> vec2<f32> {
    let width: i32 = max(size.x, 1);
    let height: i32 = max(size.y, 1);

    var gx: f32 = 0.0;
    var gy: f32 = 0.0;

    for (var i: i32 = -1; i <= 1; i = i + 1) {
        for (var j: i32 = -1; j <= 1; j = j + 1) {
            let sampleUv: vec2<f32> = uv + vec2<f32>(f32(j) / f32(width), f32(i) / f32(height));
            let texel: vec4<f32> = sample_input_bilinear(sampleUv, size);
            let value: f32 = (texel.r + texel.g + texel.b) / 3.0;

            // Sobel kernels
            var kx: f32;
            if (j == -1) {
                if (i == -1) { kx = -1.0; }
                else if (i == 0) { kx = -2.0; }
                else { kx = -1.0; }
            } else if (j == 0) {
                kx = 0.0;
            } else {
                if (i == -1) { kx = 1.0; }
                else if (i == 0) { kx = 2.0; }
                else { kx = 1.0; }
            }
            
            var ky: f32;
            if (i == -1) {
                if (j == -1) { ky = -1.0; }
                else if (j == 0) { ky = -2.0; }
                else { ky = -1.0; }
            } else if (i == 0) {
                ky = 0.0;
            } else {
                if (j == -1) { ky = 1.0; }
                else if (j == 0) { ky = 2.0; }
                else { ky = 1.0; }
            }

            gx = gx + value * kx;
            gy = gy + value * ky;
        }
    }

    return vec2<f32>(gx, gy);
}

fn shadow_effect(originalTexel: vec4<f32>, uv: vec2<f32>, size: vec2<i32>, alpha: f32) -> vec4<f32> {
    let gradient: vec2<f32> = sobel_gradient(uv, size);
    
    let distance: f32 = sqrt(gradient.x * gradient.x + gradient.y * gradient.y);
    let normalizedDistance: f32 = clamp(distance, 0.0, 1.0);
    
    var shade: f32 = normalizedDistance;
    shade = clamp((shade - 0.5) * 1.5 + 0.5, 0.0, 1.0);
    
    let highlight: f32 = shade * shade;
    
    let shadowed: vec3<f32> = (vec3<f32>(1.0) - ((vec3<f32>(1.0) - originalTexel.rgb) * (1.0 - highlight))) * shade;
    
    return vec4<f32>(mix(originalTexel.rgb, shadowed, alpha), originalTexel.a);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let widthF: f32 = resolution.x;
    let heightF: f32 = resolution.y;
    let width: i32 = i32(round(widthF));
    let height: i32 = i32(round(heightF));
    
    let shadedDims: vec2<u32> = textureDimensions(shadedTex, 0);
    let downSizeI: vec2<i32> = vec2<i32>(i32(shadedDims.x), i32(shadedDims.y));

    let uv: vec2<f32> = vec2<f32>(
        pos.x / max(widthF, 1.0),
        pos.y / max(heightF, 1.0)
    );

    // Sample combined and shade with bicubic upsampling
    let combinedValue: f32 = clamp01(sample_channel_bicubic(uv, downSizeI, 0u));
    
    let shadeMask: f32 = sample_channel_bicubic(uv, downSizeI, 1u);
    let shadeFactor: f32 = smoothstep(0.0, 0.5, shadeMask * 0.75);

    // Sample input texture
    let inputSize: vec2<u32> = textureDimensions(inputTex, 0);
    let texel: vec4<f32> = sample_input_bilinear(uv, vec2<i32>(i32(inputSize.x), i32(inputSize.y)));

    // Python: tensor = blend(tensor, zeros, shaded * 0.75) -> mix toward black
    let shadedColor: vec3<f32> = mix(texel.xyz, vec3<f32>(0.0), vec3<f32>(shadeFactor));
    
    // Python: tensor = blend(tensor, ones, combined) -> mix toward white
    let litColor: vec4<f32> = vec4<f32>(
        mix(shadedColor, vec3<f32>(1.0), vec3<f32>(combinedValue)),
        clamp(mix(texel.w, 1.0, combinedValue), 0.0, 1.0)
    );

    // Apply shadow effect
    let finalTexel: vec4<f32> = shadow_effect(litColor, uv, vec2<i32>(width, height), 0.5);

    return finalTexel;
}
