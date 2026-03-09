#version 300 es
precision highp float;

uniform sampler2D agentTex;
uniform sampler2D inputTex;
uniform float time;
uniform int frame;
uniform vec2 resolution;

uniform float density;
uniform float speed;
uniform float seed;

out vec4 fragColor;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 agentDims = vec2(textureSize(agentTex, 0));
    vec2 uv = (gl_FragCoord.xy - 0.5) / agentDims;
    vec4 agent = texture(agentTex, uv);

    // agent.xy = position, agent.z = heading angle, agent.w = lifetime
    vec2 pos = agent.xy;
    float heading = agent.z;
    float life = agent.w;

    float seedF = float(seed);

    if (frame == 0 || life <= 0.0) {
        // Initialize or respawn
        float h = hash12(uv * 137.0 + vec2(seedF, time * 0.1));
        pos = vec2(hash12(vec2(h, 1.0 + seedF)), hash12(vec2(h, 2.0 + seedF)));
        heading = hash12(vec2(h, 3.0 + seedF)) * 6.283185;

        // Sparse activation based on density (Python: density=0.05)
        float activationChance = density * 0.5;
        float roll = hash12(vec2(h, 4.0 + seedF + time * 0.01));
        // Short lifetime: 5-15 steps (Python: duration=1 with stride ~0.75)
        life = (roll < activationChance) ? 5.0 + hash12(vec2(h, 5.0 + seedF)) * 10.0 : 0.0;
    } else {
        // Chaotic movement: high kink (Python: kink=random_int(5,10))
        // Large random angle changes each step for chaotic/fibrous look
        float noise = hash12(pos * 200.0 + vec2(time * 0.37, seedF)) - 0.5;
        // kink equivalent: large angle perturbation (1.5-3.0 radians per step)
        heading += noise * 4.0;

        // Move with short stride (Python: stride=0.75, stride_deviation=0.125)
        float strideLen = (0.75 + (hash12(pos * 50.0 + vec2(seedF, time)) - 0.5) * 0.25);
        strideLen *= speed;
        float step = strideLen / max(resolution.x, resolution.y);
        pos += vec2(cos(heading), sin(heading)) * step;

        // Wrap
        pos = fract(pos);
        life -= 1.0;
    }

    fragColor = vec4(pos, heading, life);
}
