// OSD: Procedural on-screen display overlay.
// Renders hash-based pseudo-glyph block patterns at bottom-right,
// matching the spirit of the Python on_screen_display effect.

const TAU : f32 = 6.283185307179586;
const GLYPH_COLS : i32 = 3;
const GLYPH_ROWS : i32 = 5;

struct OsdParams {
    width : f32,
    height : f32,
    channels : f32,
    alpha : f32,
    seed : f32,
    speed : f32,
    time : f32,
    _pad0 : f32,
};

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output_buffer : array<f32>;
@group(0) @binding(2) var<uniform> params : OsdParams;

fn as_u32(value : f32) -> u32 {
    return u32(max(round(value), 0.0));
}

fn clamp01(value : f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn pcg(v_in : u32) -> u32 {
    let state : u32 = v_in * 747796405u + 2891336453u;
    let word : u32 = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash2(a : u32, b : u32) -> u32 {
    return pcg(a ^ (b * 0x9e3779b9u + 0x632be59bu));
}

fn hash3(a : u32, b : u32, c : u32) -> u32 {
    return pcg(hash2(a, b) ^ (c * 0x94d049bbu + 0x5bf03635u));
}

fn glyph_cell(glyph_seed : u32, row : i32, col : i32) -> f32 {
    let h : u32 = hash3(glyph_seed, u32(row), u32(col));
    let is_edge_row : bool = (row == 0 || row == 2 || row == GLYPH_ROWS - 1);
    let is_edge_col : bool = (col == 0 || col == GLYPH_COLS - 1);
    var threshold : f32;
    if (is_edge_row && !is_edge_col) {
        threshold = 0.45;
    } else if (is_edge_col && !is_edge_row) {
        threshold = 0.55;
    } else if (is_edge_row && is_edge_col) {
        threshold = 0.7;
    } else {
        threshold = 0.85;
    }
    let val : f32 = f32(h) / 4294967296.0;
    if (val < threshold) {
        return 1.0;
    }
    return 0.0;
}

fn get_glyph_seed(base_seed : u32, glyph_index : i32, time_value : f32, speed_value : f32) -> u32 {
    let angle : f32 = TAU * time_value;
    let z : f32 = cos(angle) * speed_value;
    let z_cell : i32 = i32(floor(z));
    return hash3(base_seed, u32(glyph_index), u32(z_cell));
}

fn write_pixel(base_index : u32, rgba : vec4<f32>) {
    output_buffer[base_index + 0u] = rgba.x;
    output_buffer[base_index + 1u] = rgba.y;
    output_buffer[base_index + 2u] = rgba.z;
    output_buffer[base_index + 3u] = rgba.w;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let w : u32 = max(as_u32(params.width), 1u);
    let h : u32 = max(as_u32(params.height), 1u);
    if (gid.x >= w || gid.y >= h) {
        return;
    }

    let coord : vec2<i32> = vec2<i32>(i32(gid.x), i32(gid.y));
    let texel : vec4<f32> = textureLoad(inputTex, coord, 0);
    let pixel_index : u32 = gid.y * w + gid.x;
    let base_index : u32 = pixel_index * 4u;

    let blend_alpha : f32 = clamp(params.alpha, 0.0, 1.0);
    if (blend_alpha <= 0.0) {
        write_pixel(base_index, texel);
        return;
    }

    let base_seed : u32 = u32(max(params.seed, 1.0));
    let width : i32 = i32(w);
    let height : i32 = i32(h);

    let glyph_count : i32 = 3 + i32(hash2(base_seed, 42u) % 4u);

    let base_segment : i32 = width / 24;
    if (base_segment < GLYPH_COLS) {
        write_pixel(base_index, texel);
        return;
    }
    let scale : i32 = max(base_segment / GLYPH_COLS, 1);

    let glyph_pixel_w : i32 = GLYPH_COLS * scale;
    let glyph_pixel_h : i32 = GLYPH_ROWS * scale;
    let gap : i32 = scale;
    let overlay_w : i32 = glyph_count * glyph_pixel_w + (glyph_count - 1) * gap;
    let overlay_h : i32 = glyph_pixel_h;
    let padding : i32 = 25;

    var origin_x : i32 = width - overlay_w - padding;
    var origin_y : i32 = height - overlay_h - padding;
    if (origin_x < 0) {
        origin_x = 0;
    }
    if (origin_y < 0) {
        origin_y = 0;
    }

    let lx : i32 = coord.x - origin_x;
    let ly : i32 = coord.y - origin_y;
    if (lx < 0 || lx >= overlay_w || ly < 0 || ly >= overlay_h) {
        write_pixel(base_index, texel);
        return;
    }

    let cell_stride : i32 = glyph_pixel_w + gap;
    let glyph_idx : i32 = lx / cell_stride;
    let within_glyph_x : i32 = lx - glyph_idx * cell_stride;

    if (within_glyph_x >= glyph_pixel_w || glyph_idx >= glyph_count) {
        write_pixel(base_index, texel);
        return;
    }

    let cell_col : i32 = within_glyph_x / scale;
    let cell_row_raw : i32 = ly / scale;
    let cell_row : i32 = (GLYPH_ROWS - 1) - cell_row_raw;

    if (cell_col < 0 || cell_col >= GLYPH_COLS || cell_row < 0 || cell_row >= GLYPH_ROWS) {
        write_pixel(base_index, texel);
        return;
    }

    let glyph_seed : u32 = get_glyph_seed(base_seed, glyph_idx, params.time, params.speed);
    let cell_on : f32 = glyph_cell(glyph_seed, cell_row, cell_col);

    if (cell_on < 0.5) {
        write_pixel(base_index, texel);
        return;
    }

    let highlight : vec3<f32> = max(texel.rgb, vec3<f32>(cell_on));
    let blended : vec3<f32> = mix(texel.rgb, highlight, blend_alpha);
    write_pixel(base_index, vec4<f32>(
        clamp01(blended.x),
        clamp01(blended.y),
        clamp01(blended.z),
        texel.a,
    ));
}
