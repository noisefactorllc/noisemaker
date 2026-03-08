// Reindex Pass 2 (Reduce): collapse tile statistics to a global min/max pair.
const TILE_SIZE : i32 = 8;
const MAX_TILE_DIM : i32 = 512;
const F32_MAX : f32 = 3.402823466e38;
const F32_MIN : f32 = -3.402823466e38;

@group(0) @binding(0) var stats_texture : texture_2d<f32>;
@group(0) @binding(1) var<uniform> resolution : vec2<f32>;

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    if (i32(position.x) != 0 || i32(position.y) != 0) {
        return vec4<f32>(0.0);
    }

    let dims : vec2<u32> = textureDimensions(stats_texture, 0);
    if (dims.x == 0u || dims.y == 0u) {
        return vec4<f32>(0.0);
    }

    let width_px : i32 = max(i32(round(resolution.x)), 0);
    let height_px : i32 = max(i32(round(resolution.y)), 0);
    let tile_count : vec2<i32> = vec2<i32>(
        (width_px + TILE_SIZE - 1) / TILE_SIZE,
        (height_px + TILE_SIZE - 1) / TILE_SIZE
    );

    var global_min : f32 = F32_MAX;
    var global_max : f32 = F32_MIN;
    let tex_width : i32 = i32(dims.x);
    let tex_height : i32 = i32(dims.y);

    for (var ty : i32 = 0; ty < MAX_TILE_DIM; ty = ty + 1) {
        if (ty >= tile_count.y) {
            break;
        }
        for (var tx : i32 = 0; tx < MAX_TILE_DIM; tx = tx + 1) {
            if (tx >= tile_count.x) {
                break;
            }
            let sample_coord : vec2<i32> = vec2<i32>(tx * TILE_SIZE, ty * TILE_SIZE);
            if (sample_coord.x >= tex_width || sample_coord.y >= tex_height) {
                continue;
            }
            let tile_stats : vec2<f32> = textureLoad(stats_texture, sample_coord, 0).xy;
            global_min = min(global_min, tile_stats.x);
            global_max = max(global_max, tile_stats.y);
        }
    }

    return vec4<f32>(global_min, global_max, 0.0, 1.0);
}
