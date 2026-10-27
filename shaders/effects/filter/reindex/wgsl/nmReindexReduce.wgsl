// Reindex Pass 2 (Reduce): collapse tile statistics to a global min/max pair.
const TILE_SIZE : i32 = 8;
const MAX_TILE_DIM : i32 = 512;
const F32_MAX : f32 = 3.402823466e38;
const F32_MIN : f32 = -3.402823466e38;

@group(0) @binding(0) var statsTex : texture_2d<f32>;

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    if (i32(position.x) != 0 || i32(position.y) != 0) {
        return vec4<f32>(0.0);
    }

    let stats_tex_size : vec2<i32> = vec2<i32>(textureDimensions(statsTex, 0));
    let tile_count : vec2<i32> = vec2<i32>(
        (stats_tex_size.x + TILE_SIZE - 1) / TILE_SIZE,
        (stats_tex_size.y + TILE_SIZE - 1) / TILE_SIZE
    );

    var global_min : f32 = F32_MAX;
    var global_max : f32 = F32_MIN;

    for (var ty : i32 = 0; ty < MAX_TILE_DIM; ty = ty + 1) {
        if (ty >= tile_count.y) {
            break;
        }
        for (var tx : i32 = 0; tx < MAX_TILE_DIM; tx = tx + 1) {
            if (tx >= tile_count.x) {
                break;
            }
            let sample_coord : vec2<i32> = vec2<i32>(tx * TILE_SIZE, ty * TILE_SIZE);
            let tile_stats : vec2<f32> = textureLoad(statsTex, sample_coord, 0).xy;
            global_min = min(global_min, tile_stats.x);
            global_max = max(global_max, tile_stats.y);
        }
    }

    return vec4<f32>(global_min, global_max, 0.0, 1.0);
}
