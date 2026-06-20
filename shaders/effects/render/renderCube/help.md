# RenderCube

Renders a 3D volume into seamless cubemap faces. The camera sits at the volume
center and looks out through a 90-degree frustum per face, so adjacent faces
share edge directions and tile without seams. The volume's red channel supplies
the density / SDF field.

- **mode** — `isosurface` (raymarch to a threshold crossing, refined by bisection) or `volumetric` (front-to-back emission/absorption integration, nebula look).
- **density** — volumetric mode: scales the field's contribution to per-step opacity (`1 - exp(-field·density·absorption·dt)`). Higher is thicker.
- **absorption** — volumetric mode: further scales how strongly the medium attenuates along the ray.
- **emission** — volumetric mode: scales how much each sample contributes as emitted light.
- **threshold** — isosurface mode: the field cutoff the surface is traced to.
- **invert thresh** — isosurface mode: flips the inside/outside test.
- **bg color / bg opacity** — background behind the volume.
