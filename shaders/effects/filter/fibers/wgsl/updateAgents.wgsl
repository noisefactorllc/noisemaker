struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    frame: i32,
    density: f32,
    speed: f32,
    seed: f32,
    _pad: f32,
};

@group(0) @binding(0) var agentTex: texture_2d<f32>;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var inputSampler: sampler;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let agentDims = vec2<f32>(textureDimensions(agentTex));
    let uv = (fragCoord.xy - 0.5) / agentDims;
    let agent = textureSampleLevel(agentTex, inputSampler, uv, 0.0);

    // agent.xy = position, agent.z = heading angle, agent.w = lifetime
    var pos = agent.xy;
    var heading = agent.z;
    var life = agent.w;

    let seedF = f32(uniforms.seed);

    if (uniforms.frame == 0 || life <= 0.0) {
        // Initialize or respawn
        let h = hash12(uv * 137.0 + vec2<f32>(seedF, uniforms.time * 0.1));
        pos = vec2<f32>(hash12(vec2<f32>(h, 1.0 + seedF)), hash12(vec2<f32>(h, 2.0 + seedF)));
        heading = hash12(vec2<f32>(h, 3.0 + seedF)) * 6.283185;

        // Sparse activation based on density
        let activationChance = uniforms.density * 0.5;
        let roll = hash12(vec2<f32>(h, 4.0 + seedF + uniforms.time * 0.01));
        // Short lifetime: 5-15 steps
        if (roll < activationChance) {
            life = 5.0 + hash12(vec2<f32>(h, 5.0 + seedF)) * 10.0;
        } else {
            life = 0.0;
        }
    } else {
        // Chaotic movement: high kink
        let noise = hash12(pos * 200.0 + vec2<f32>(uniforms.time * 0.37, seedF)) - 0.5;
        heading += noise * 4.0;

        // Move with short stride
        let strideVar = hash12(pos * 50.0 + vec2<f32>(seedF, uniforms.time)) - 0.5;
        var strideLen = 0.75 + strideVar * 0.25;
        strideLen *= uniforms.speed;
        let stepSize = strideLen / max(uniforms.resolution.x, uniforms.resolution.y);
        pos += vec2<f32>(cos(heading), sin(heading)) * stepSize;

        // Wrap
        pos = fract(pos);
        life -= 1.0;
    }

    return vec4<f32>(pos, heading, life);
}
