@group(0) @binding(0) var orderTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> runLength: i32;

fn keyAt(index: i32, width: i32) -> vec2f {
    return textureLoad(orderTex, vec2i(index % width, index / width), 0).rg;
}
fn before(a: vec2f, b: vec2f) -> bool {
    return a.x < b.x || (a.x == b.x && a.y <= b.y);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let dims = vec2i(textureDimensions(orderTex, 0));
    let coord = vec2i(fragCoord.xy);
    let index = coord.y * dims.x + coord.x;
    let count = dims.x * dims.y;
    if (runLength >= count) { return textureLoad(orderTex, coord, 0); }
    let start = (index / (2 * runLength)) * (2 * runLength);
    let lengthA = min(runLength, count - start);
    let lengthB = min(runLength, count - start - lengthA);
    let diagonal = index - start;
    var low = max(0, diagonal - lengthB);
    var high = min(diagonal, lengthA);
    for (var step = 0; step < 22 && low < high; step++) {
        let mid = (low + high) / 2;
        let other = diagonal - mid;
        if (mid < lengthA && other > 0 && before(keyAt(start + mid, dims.x), keyAt(start + lengthA + other - 1, dims.x))) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    let other = diagonal - low;
    var a = vec2f(3.402823466e38);
    var b = vec2f(3.402823466e38);
    if (low < lengthA) { a = keyAt(start + low, dims.x); }
    if (other < lengthB) { b = keyAt(start + lengthA + other, dims.x); }
    return vec4f(select(b, a, before(a, b)), 0.0, 1.0);
}
