#!/usr/bin/env python3
import json, math, colorsys
from pathlib import Path
import tensorflow as tf
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

from noisemaker.effects import (
    posterize,
    adjust_hue,
    ridge,
    sine,
    blur,
    ripple,
    sketch,
    vhs,
    crt,
    snow,
    grime,
    nebula,
    false_color,
    fibers,
    scratches,
    stray_hair,
    palette,
    vignette,
)
from noisemaker import value, points
from noisemaker import rng
import noisemaker.generators as generators
from noisemaker import simplex

def worms_params(shape, density=4.0, stride=1.0, stride_deviation=0.05):
    """The worm starts, strides and obedient headings that effects.worms draws, in its RNG order."""
    height, width = shape[0], shape[1]
    count = int(max(width, height) * density)
    worms_y = rng.uniform([count]) * (height - 1)
    worms_x = rng.uniform([count]) * (width - 1)
    worms_stride = rng.normal([count], mean=stride, stddev=stride_deviation) * (max(width, height) / 1024.0)
    worms_rot = tf.ones([count], dtype=tf.float32) * rng.random() * math.tau
    return {
        'x': worms_x.numpy().tolist(),
        'y': worms_y.numpy().tolist(),
        'stride': worms_stride.numpy().tolist(),
        'rot': worms_rot.numpy().tolist(),
    }

fixtures_dir = root / 'test' / 'fixtures'
fixtures_dir.mkdir(parents=True, exist_ok=True)

# RNG fixtures
rng_dir = fixtures_dir / 'rng'
rng_dir.mkdir(exist_ok=True)
for seed in (1, 2, 3):
    rng.set_seed(seed)
    vals = [rng.random() for _ in range(1000)]
    with open(rng_dir / f'seed_{seed}.json', 'w') as f:
        json.dump(vals, f)

# Value noise fixture
value_dir = fixtures_dir / 'value'
value_dir.mkdir(exist_ok=True)
value.set_seed(1)
val_samples = value.value_noise(64).numpy().flatten().tolist()
with open(value_dir / 'seed_1.json', 'w') as f:
    json.dump(val_samples, f)

# Point cloud fixture
points_dir = fixtures_dir / 'points'
points_dir.mkdir(exist_ok=True)
rng.set_seed(1)
x, y = points.cloud_points(4)
with open(points_dir / 'seed_1_freq4.json', 'w') as f:
    json.dump({'x': x, 'y': y}, f)

# Effect parameter fixture
effects_dir = fixtures_dir / 'effects'
effects_dir.mkdir(exist_ok=True)
value.set_seed(1)
worm_params = worms_params([4, 4, 1])
with open(effects_dir / 'worms.json', 'w') as f:
    json.dump(worm_params, f)

# Posterize fixture
poster_vals = [0.1, 0.5, 0.9, 0.3]
tex = tf.constant(poster_vals, shape=[2,2,1], dtype=tf.float32)
poster_out = posterize(tex, [2,2,1], levels=4).numpy().flatten().tolist()
with open(fixtures_dir / 'posterize.json', 'w') as f:
    json.dump(poster_out, f)

# Palette fixture
pal_vals = [0.0, 0.0, 0.0, 0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 0.25, 0.25, 0.25]
pal_tex = tf.constant(pal_vals, shape=[2,2,3], dtype=tf.float32)
pal_out = palette(pal_tex, [2,2,3], name='grayscale').numpy().flatten().tolist()
with open(fixtures_dir / 'palette.json', 'w') as f:
    json.dump(pal_out, f)

# Vignette fixture
vig_vals = [0.1, 0.5, 0.3, 0.8]
vig_tex = tf.constant(vig_vals, shape=[2,2,1], dtype=tf.float32)
vig_out = vignette(vig_tex, [2,2,1], brightness=0.25, alpha=0.5).numpy().flatten().tolist()
with open(fixtures_dir / 'vignette.json', 'w') as f:
    json.dump(vig_out, f)

# Saturation fixture
sat_vals = [0.2,0.4,0.6,0.8,0.1,0.3]
sat_out = []
for i in range(0, len(sat_vals), 3):
    r, g, b = sat_vals[i:i+3]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    s = min(1, max(0, s * 0.5))
    r2, g2, b2 = colorsys.hsv_to_rgb(h, s, v)
    sat_out.extend([r2, g2, b2])
with open(fixtures_dir / 'saturation.json', 'w') as f:
    json.dump(sat_out, f)

# Random hue fixture
# random_hue shifts the hue by one RNG draw within +/- 0.05.
rh_vals = [0.1,0.2,0.3,0.4,0.5,0.6]
rh_tex = tf.constant(rh_vals, shape=[2,1,3], dtype=tf.float32)
rng.set_seed(5)
shift = rng.random() * 0.1 - 0.05
rh_out = adjust_hue(rh_tex, [2,1,3], amount=shift).numpy().flatten().tolist()
with open(fixtures_dir / 'randomHue.json', 'w') as f:
    json.dump(rh_out, f)

# Adjust hue fixture
ah_vals = [0.2, 0.4, 0.6, 0.8, 0.1, 0.3]
ah_tex = tf.constant(ah_vals, shape=[2,1,3], dtype=tf.float32)
ah_out = adjust_hue(ah_tex, [2,1,3], amount=0.25).numpy().flatten().tolist()
with open(fixtures_dir / 'adjustHue.json', 'w') as f:
    json.dump(ah_out, f)

# Ridge fixture
ridge_vals = [0.2, 0.8, 0.4, 0.6]
ridge_tex = tf.constant(ridge_vals, shape=[2,2,1], dtype=tf.float32)
ridge_out = ridge(ridge_tex, [2,2,1]).numpy().flatten().tolist()
with open(fixtures_dir / 'ridge.json', 'w') as f:
    json.dump(ridge_out, f)

# Sine fixture
sine_vals = [0.1,0.2,0.3,0.4,0.5,0.6]
sine_tex = tf.constant(sine_vals, shape=[2,1,3], dtype=tf.float32)
sine_out = sine(sine_tex, [2,1,3], amount=1.0, rgb=False).numpy().flatten().tolist()
with open(fixtures_dir / 'sine.json', 'w') as f:
    json.dump(sine_out, f)

# Blur fixture
blur_vals = [0.1,0.5,0.3,0.7]
blur_tex = tf.constant(blur_vals, shape=[2,2,1], dtype=tf.float32)
blur_out = blur(blur_tex, [2,2,1]).numpy().flatten().tolist()
with open(fixtures_dir / 'blur.json', 'w') as f:
    json.dump(blur_out, f)

# Ripple fixture
value.set_seed(10)
ripple_vals = [0.1, 0.2, 0.3, 0.4]
ripple_tex = tf.constant(ripple_vals, shape=[2,2,1], dtype=tf.float32)
ripple_out = ripple(ripple_tex, [2,2,1], freq=2, displacement=0.5, kink=1, time=0, speed=1).numpy().flatten().tolist()
with open(fixtures_dir / 'ripple.json', 'w') as f:
    json.dump(ripple_out, f)

# Sketch fixture
value.set_seed(1)
sketch_vals = [0.1, 0.5, 0.3, 0.8]
sketch_tex = tf.constant(sketch_vals, shape=[2,2,1], dtype=tf.float32)
sketch_out = sketch(sketch_tex, [2,2,1], time=0, speed=1).numpy().flatten().tolist()
with open(fixtures_dir / 'sketch.json', 'w') as f:
    json.dump(sketch_out, f)

# VHS fixture
value.set_seed(1)
vhs_vals = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1, 0.2, 0.3]
vhs_tex = tf.constant(vhs_vals, shape=[2,2,3], dtype=tf.float32)
vhs_out = vhs(vhs_tex, [2,2,3], time=0.25, speed=1).numpy().flatten().tolist()
with open(fixtures_dir / 'vhs.json', 'w') as f:
    json.dump(vhs_out, f)

value.set_seed(1)
vhs_half_out = vhs(vhs_tex, [2,2,3], time=0.5, speed=1).numpy().flatten().tolist()
with open(fixtures_dir / 'vhsHalf.json', 'w') as f:
    json.dump(vhs_half_out, f)

# CRT fixture
value.set_seed(1)
crt_out = crt(vhs_tex, [2,2,3], time=0.25, speed=1).numpy().flatten().tolist()
with open(fixtures_dir / 'crt.json', 'w') as f:
    json.dump(crt_out, f)

# Snow fixture
value.set_seed(1)
snow_vals = [0.1, 0.2, 0.3, 0.4]
snow_tex = tf.constant(snow_vals, shape=[2,2,1], dtype=tf.float32)
snow_out = snow(snow_tex, [2,2,1], time=0, speed=1).numpy().flatten().tolist()
with open(fixtures_dir / 'snow.json', 'w') as f:
    json.dump(snow_out, f)

# Grime fixture
value.set_seed(1)
grime_out = grime(tf.zeros([8,8,1], dtype=tf.float32), [8,8,1], time=0, speed=1).numpy().flatten().tolist()
with open(fixtures_dir / 'grime.json', 'w') as f:
    json.dump(grime_out, f)

# Nebula fixture
value.set_seed(1)
nebula_out = nebula(tf.zeros([32,32,3], dtype=tf.float32), [32,32,3], time=0, speed=1).numpy().flatten().tolist()
with open(fixtures_dir / 'nebula.json', 'w') as f:
    json.dump(nebula_out, f)

# False color fixture
value.set_seed(1)
false_color_vals = [0.1, 0.1, 0.1, 0.2, 0.2, 0.2, 0.3, 0.3, 0.3, 0.4, 0.4, 0.4]
false_color_tex = tf.constant(false_color_vals, shape=[2,2,3], dtype=tf.float32)
false_color_out = false_color(false_color_tex, [2,2,3], time=0, speed=1).numpy().flatten().tolist()
with open(fixtures_dir / 'falseColor.json', 'w') as f:
    json.dump(false_color_out, f)

# Simplex fixture
shape = (2,2)
time = 0.25
seed = 12345
speed = 1.0
rows = simplex.simplex(shape, time=time, seed=seed, speed=speed, as_np=True)[:, :, 0].tolist()
rand = simplex.random(time, seed, speed)
with open(fixtures_dir / 'simplex.json', 'w') as f:
    json.dump({'tensor': rows, 'random': rand}, f)

# Fibers fixture
value.set_seed(1)
base = tf.zeros([4,4,1], dtype=tf.float32)
fib_out = fibers(base, [4,4,1]).numpy().flatten().tolist()
with open(fixtures_dir / 'fibers.json', 'w') as f:
    json.dump(fib_out, f)

# Scratches fixture
value.set_seed(1)
base = tf.zeros([4,4,1], dtype=tf.float32)
scr_out = scratches(base, [4,4,1]).numpy().flatten().tolist()
with open(fixtures_dir / 'scratches.json', 'w') as f:
    json.dump(scr_out, f)

# Stray hair fixture
value.set_seed(1)
base = tf.zeros([4,4,1], dtype=tf.float32)
sh_out = stray_hair(base, [4,4,1]).numpy().flatten().tolist()
with open(fixtures_dir / 'strayHair.json', 'w') as f:
    json.dump(sh_out, f)

# Generators basic fixture
generators_dir = fixtures_dir / 'generators'
generators_dir.mkdir(exist_ok=True)
rng.set_seed(1)
value.set_seed(1)
tensor = generators.basic(2, [4, 4, 3], hue_rotation=0)
with open(generators_dir / 'basic_seed_1.json', 'w') as f:
    json.dump(tensor.numpy().flatten().tolist(), f)

print(f'Wrote fixtures to {fixtures_dir}')
