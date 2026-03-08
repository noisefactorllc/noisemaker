#version 300 es
precision highp float;
precision highp int;

uniform sampler2D shadedTex;
uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform float speed;
uniform float scale;

out vec4 fragColor;

const uint CHANNEL_COUNT = 4u;

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

int wrap_index(int value, int limit) {
    if (limit <= 0) {
        return 0;
    }
    int wrapped = value % limit;
    if (wrapped < 0) {
        wrapped = wrapped + limit;
    }
    return wrapped;
}

float read_channel(ivec2 coord, ivec2 size, uint channel) {
    int width = max(size.x, 1);
    int height = max(size.y, 1);
    int safe_x = wrap_index(coord.x, width);
    int safe_y = wrap_index(coord.y, height);
    
    vec4 val = texelFetch(shadedTex, ivec2(safe_x, safe_y), 0);
    if (channel == 0u) return val.r;
    if (channel == 1u) return val.g;
    if (channel == 2u) return val.b;
    return val.a;
}

float cubic_interpolate_scalar(float a, float b, float c, float d, float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    float a0 = d - c - a + b;
    float a1 = a - b - a0;
    float a2 = c - a;
    float a3 = b;
    return a0 * t3 + a1 * t2 + a2 * t + a3;
}

float sample_channel_bicubic(vec2 uv, ivec2 size, uint channel) {
    int width = max(size.x, 1);
    int height = max(size.y, 1);
    vec2 scale = vec2(float(width), float(height));
    vec2 base_coord = uv * scale - vec2(0.5, 0.5);

    int ix = int(floor(base_coord.x));
    int iy = int(floor(base_coord.y));
    float fx = clamp(base_coord.x - floor(base_coord.x), 0.0, 1.0);
    float fy = clamp(base_coord.y - floor(base_coord.y), 0.0, 1.0);

    float column[4];
    float row[4];

    for (int m = -1; m <= 2; m++) {
        for (int n = -1; n <= 2; n++) {
            ivec2 sample_coord = ivec2(
                wrap_index(ix + n, width),
                wrap_index(iy + m, height)
            );
            row[n + 1] = read_channel(sample_coord, size, channel);
        }
        column[m + 1] = cubic_interpolate_scalar(row[0], row[1], row[2], row[3], fx);
    }

    float value = cubic_interpolate_scalar(column[0], column[1], column[2], column[3], fy);
    return clamp(value, 0.0, 1.0);
}

vec4 sample_texture_bilinear(vec2 uv, ivec2 tex_size) {
    float width = float(tex_size.x);
    float height = float(tex_size.y);
    
    vec2 coord = vec2(uv.x * width - 0.5, uv.y * height - 0.5);
    ivec2 coord_floor = ivec2(floor(coord.x), floor(coord.y));
    vec2 fract_part = vec2(coord.x - floor(coord.x), coord.y - floor(coord.y));
    
    int x0 = wrap_index(coord_floor.x, tex_size.x);
    int y0 = wrap_index(coord_floor.y, tex_size.y);
    int x1 = wrap_index(coord_floor.x + 1, tex_size.x);
    int y1 = wrap_index(coord_floor.y + 1, tex_size.y);
    
    vec4 p00 = texelFetch(inputTex, ivec2(x0, y0), 0);
    vec4 p10 = texelFetch(inputTex, ivec2(x1, y0), 0);
    vec4 p01 = texelFetch(inputTex, ivec2(x0, y1), 0);
    vec4 p11 = texelFetch(inputTex, ivec2(x1, y1), 0);
    
    vec4 p0 = mix(p00, p10, fract_part.x);
    vec4 p1 = mix(p01, p11, fract_part.x);
    
    return mix(p0, p1, fract_part.y);
}

vec2 sobel_gradient(vec2 uv, ivec2 size) {
    int width = max(size.x, 1);
    int height = max(size.y, 1);

    // First, blur the input (matching Python's sobel_operator)
    float blurred_value = 0.0;
    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            vec2 sample_uv = uv + vec2(float(j) / float(width), float(i) / float(height));
            vec4 texel = sample_texture_bilinear(sample_uv, size);
            float luminance = (texel.r + texel.g + texel.b) / 3.0;
            blurred_value = blurred_value + luminance;
        }
    }
    blurred_value = blurred_value / 9.0;

    // Sobel kernels
    mat3 x_kernel = mat3(
        -1.0, 0.0, 1.0,
        -2.0, 0.0, 2.0,
        -1.0, 0.0, 1.0
    );

    mat3 y_kernel = mat3(
        -1.0, -2.0, -1.0,
        0.0, 0.0, 0.0,
        1.0, 2.0, 1.0
    );

    float gx = 0.0;
    float gy = 0.0;

    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            vec2 sample_uv = uv + vec2(float(j) / float(width), float(i) / float(height));
            vec4 texel = sample_texture_bilinear(sample_uv, size);
            float value = (texel.r + texel.g + texel.b) / 3.0;

            // Note: GLSL mat3 is column-major, so index is [col][row]
            // But here we use [i+1][j+1] which is row-major in C-style array
            // Let's just use the values directly
            float kx = (j == -1) ? ((i == -1) ? -1.0 : (i == 0) ? -2.0 : -1.0) :
                       (j == 0) ? 0.0 :
                       ((i == -1) ? 1.0 : (i == 0) ? 2.0 : 1.0);
            
            float ky = (i == -1) ? ((j == -1) ? -1.0 : (j == 0) ? -2.0 : -1.0) :
                       (i == 0) ? 0.0 :
                       ((j == -1) ? 1.0 : (j == 0) ? 2.0 : 1.0);

            gx = gx + value * kx;
            gy = gy + value * ky;
        }
    }

    return vec2(gx, gy);
}

vec4 shadow(vec4 original_texel, vec2 uv, ivec2 size, float alpha) {
    // Get Sobel gradients
    vec2 gradient = sobel_gradient(uv, size);
    
    // Calculate Euclidean distance and normalize (simplified - no global normalization)
    float distance = sqrt(gradient.x * gradient.x + gradient.y * gradient.y);
    float normalized_distance = clamp(distance, 0.0, 1.0);
    
    // Apply sharpen effect (simplified - just boost the contrast)
    float shade = normalized_distance;
    shade = clamp((shade - 0.5) * 1.5 + 0.5, 0.0, 1.0);
    
    // Create highlight by squaring
    float highlight = shade * shade;
    
    // Apply shadow formula: shade = (1.0 - ((1.0 - tensor) * (1.0 - highlight))) * shade
    vec3 shadowed = (vec3(1.0) - ((vec3(1.0) - original_texel.rgb) * (1.0 - highlight))) * shade;
    
    // Blend with original
    return vec4(mix(original_texel.rgb, shadowed, alpha), original_texel.a);
}

void main() {
    float width_f = resolution.x;
    float height_f = resolution.y;
    int width = int(round(width_f));
    int height = int(round(height_f));
    
    // Get actual shaded texture dimensions instead of calculating from scale
    ivec2 shaded_size = textureSize(shadedTex, 0);
    ivec2 down_size_i = shaded_size;

    vec2 uv = vec2(
        (gl_FragCoord.x) / max(width_f, 1.0),
        (gl_FragCoord.y) / max(height_f, 1.0)
    );

    // Combined and shade from shade pass
    float combined_value = clamp01(sample_channel_bicubic(uv, down_size_i, 0u));
    float shade_mask = sample_channel_bicubic(uv, down_size_i, 1u);
    float shade_factor = clamp01(shade_mask * 0.75);

    // Sample input
    vec4 texel = texture(inputTex, uv);

    // Python: tensor = blend(tensor, zeros, shaded * 0.75) -> darken
    vec3 shaded_color = mix(texel.xyz, vec3(0.0), vec3(shade_factor));
    
    // Python: tensor = blend(tensor, ones, combined) -> lighten toward white
    vec4 lit_color = vec4(
        mix(shaded_color, vec3(1.0), vec3(combined_value)),
        clamp(mix(texel.w, 1.0, combined_value), 0.0, 1.0)
    );

    // Apply shadow effect
    vec4 final_texel = shadow(lit_color, uv, ivec2(width, height), 0.5);

    fragColor = final_texel;
}
