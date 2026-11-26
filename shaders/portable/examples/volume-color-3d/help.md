# Volume Color 3D

This filter accepts an existing Noisemaker 3D chain. It inherits the upstream
volume size, changes green and blue, and preserves red-channel density, alpha,
and the upstream geometry texture. `amount: 0` is a color passthrough.

The complete default program supplies `shape3d` as input and uses the built-in
voxel renderer. Open `viewer/?effect=../examples/volumeColor3d/` from the project
server. The filter's volume size is deliberately not a user control.
