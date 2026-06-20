# palette3d

Apply cosine color palettes to a 3D volume based on luminance.

3D port of `palette`: recolors a volume per-voxel using the same 55 cosine
palettes and RGB/HSV/OkLab colorspace modes. The volume's shape (geometry) is
preserved — only its color changes.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x64 | x16/x32/x64/x128 | Volume size (inherited from upstream) |
| index | member | palette.brushedMetal | - | Palette |
| rotation | int | none | none/fwd/back | Rotation |
| offset | float | 0 | 0-100 | Offset |
| repeat | int | 1 | 1-10 | Repeat |
| alpha | float | 1 | 0-1 | Alpha |
