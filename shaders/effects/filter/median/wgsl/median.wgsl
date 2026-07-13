// Exact dense whole-color Median / Dust & Scratches.
// RADIUS == 1 -> REAL_COUNT 9
// RADIUS == 2 -> REAL_COUNT 25
// RADIUS == 3 -> REAL_COUNT 49
// RADIUS is injected as an i32 compile-time constant by the runtime.

const REAL_COUNT: u32 = u32((2 * RADIUS + 1) * (2 * RADIUS + 1));

struct Uniforms {
    threshold: f32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

fn less_record(a: vec2<u32>, blue_a: u32, b: vec2<u32>, blue_b: u32) -> bool {
    if (a.x != b.x) { return a.x < b.x; }
    if (a.y != b.y) { return a.y < b.y; }
    return blue_a < blue_b;
}

fn pack_record_major(color: vec4<f32>) -> vec2<u32> {
    let brightness = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    let packed_rg = pack2x16float(color.rg);
    let ordered_rg = ((packed_rg & 0xffffu) << 16u) | (packed_rg >> 16u);
    return vec2<u32>(bitcast<u32>(brightness), ordered_rg);
}

fn pack_record_blue(color: vec4<f32>) -> u32 {
    return pack2x16float(vec2<f32>(color.b, 0.0)) & 0xffffu;
}

fn unpack_record_rgb(major: vec2<u32>, blue: u32) -> vec3<f32> {
    let packed_rg = (major.y << 16u) | (major.y >> 16u);
    let rg = unpack2x16float(packed_rg);
    let b = unpack2x16float(blue).x;
    return vec3<f32>(rg, b);
}

fn read_record(center: vec2<i32>, dimensions: vec2<i32>, x: i32, y: i32) -> vec4<f32> {
    let coord = clamp(center + vec2<i32>(x, y), vec2<i32>(0), dimensions - vec2<i32>(1));
    return textureLoad(inputTex, coord, 0);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    var major_records: array<vec2<u32>, REAL_COUNT>;
    var blue_records: array<u32, REAL_COUNT>;
    let dimensions = vec2<i32>(textureDimensions(inputTex));
    let center = vec2<i32>(position.xy);
    var original_rgb = vec3<f32>(0.0);
    var center_alpha = 1.0;
    var index = 0;
    for (var y = -RADIUS; y <= RADIUS; y++) {
        for (var x = -RADIUS; x <= RADIUS; x++) {
            let sample = read_record(center, dimensions, x, y);
            major_records[index] = pack_record_major(sample);
            blue_records[index] = pack_record_blue(sample);
            if (x == 0 && y == 0) {
                original_rgb = sample.rgb;
                center_alpha = sample.a;
            }
            index++;
        }
    }

    let median_index = i32(REAL_COUNT) / 2;
    var left = 0;
    var right = i32(REAL_COUNT) - 1;
    while (left < right) {
        let pivot_major = major_records[median_index];
        let pivot_blue = blue_records[median_index];
        var scan_left = left;
        var scan_right = right;
        while (scan_left <= scan_right) {
            while (less_record(major_records[scan_left], blue_records[scan_left], pivot_major, pivot_blue)) { scan_left++; }
            while (less_record(pivot_major, pivot_blue, major_records[scan_right], blue_records[scan_right])) { scan_right--; }
            if (scan_left <= scan_right) {
                let temporary_major = major_records[scan_left];
                major_records[scan_left] = major_records[scan_right];
                major_records[scan_right] = temporary_major;
                let temporary_blue = blue_records[scan_left];
                blue_records[scan_left] = blue_records[scan_right];
                blue_records[scan_right] = temporary_blue;
                scan_left++;
                scan_right--;
            }
        }
        if (scan_right < median_index) { left = scan_left; }
        if (median_index < scan_left) { right = scan_right; }
    }

    let median_rgb = unpack_record_rgb(major_records[median_index], blue_records[median_index]);
    let difference = abs(original_rgb - median_rgb);
    let max_difference = max(max(difference.r, difference.g), difference.b);
    let replace_center = uniforms.threshold <= 0.0 || max_difference >= uniforms.threshold / 100.0;
    return vec4<f32>(select(original_rgb, median_rgb, replace_center), center_alpha);
}
