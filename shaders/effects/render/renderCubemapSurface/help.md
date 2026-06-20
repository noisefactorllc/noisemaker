# RenderCubemapSurface

Samples a 3D volume into seamless cubemap faces, showing the **raw, true color**
of the field exactly as sampled — front-to-back emission/absorption with no
lighting and no gamma. The camera sits at the volume center and looks out through
a 90-degree frustum per face (`cubeBasis`), so adjacent faces share edge
directions and tile without seams. The volume's red channel drives per-step
opacity; RGB is the emitted color.

For a lit isosurface/voxel "blob in space," use `renderCubemap3D`.

- **density** — scales the field's contribution to per-step opacity (`1 - exp(-field·density·absorption·dt)`). Higher is thicker.
- **absorption** — further scales how strongly the medium attenuates along the ray.
- **emission** — scales how much each sample contributes as emitted color.
- **bg color / bg opacity** — background behind the volume.
