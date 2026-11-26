# Portable Block 3D

A colored eight-voxel-wide block stored in Noisemaker's cubic volume atlas.
The second render target carries encoded normals and independent density.

The default program renders the volume with the built-in voxel renderer at
16³. The effect's default resolution is 32³; the explicit program argument
demonstrates that program values take precedence over control defaults.

Open `viewer/?effect=../examples/portableBlock3d/` from the project server.
Switch between WebGL and WebGPU to compare the rendered output.

Volume-atlas shaders use native integer pixel coordinates on both backends.
Do not apply the screen-space Y flip from a 2D image shader to voxel addresses.
