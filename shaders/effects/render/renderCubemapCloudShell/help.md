# RenderCubemapCloudShell

Renders an upstream 3D volume as a transparent spherical cloud shell across six
seamless cubemap faces. It uses the same cube camera and face order as the other
cubemap renderers, but samples only the atmospheric band between `innerRadius`
and `outerRadius`.

```dsl
search synth3d, render

noise3d(volumeSize: x64, octaves: 4, ridges: true, colorMode: rgb)
  .renderCubemapCloudShell()
  .write(o0)

render(o0)
```

The output is straight-alpha RGBA: RGB contains baked cloud color and alpha
contains cloud opacity. `bg opacity` defaults to `0` so the faces can be used as
a transparent cloud layer over terrain or ocean.

- **inner radius / outer radius** — the atmospheric band to march.
- **coverage** — threshold where cloud density starts.
- **softness** — feathering around the coverage threshold.
- **density / absorption** — opacity and attenuation through the shell.
- **quality** — compile-time march tier: low, medium, or high.
- **cloud color / shadow color** — lit and shaded cloud colors.
- **light dir / silver lining** — directional baked lighting controls.
- **bg color / bg opacity** — inspection background behind transparent clouds.
