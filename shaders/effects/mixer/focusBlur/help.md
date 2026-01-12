# Focus Blur

A mixer effect that simulates depth of field blur using one surface as a depth map to control blur intensity on the other surface.

## Parameters

- **source B**: The secondary input surface
- **focal distance**: The depth value (luminosity) that will be in sharp focus (1-100)
- **aperture**: Controls how quickly blur increases with distance from focal plane (1-10, higher = more blur)
- **sample spread**: Controls the spread of the blur samples (2-20, higher = wider blur)
- **depth source**: Which surface to use as the depth map
  - `sourceA`: Use the input surface as depth map, blur source B
  - `sourceB`: Use source B as depth map, blur the input surface

## How It Works

The effect uses the luminosity of the depth source texture as a proxy for depth. Pixels with luminosity values close to the focal distance remain sharp, while pixels with luminosity far from the focal distance become blurred.

## Usage Tips

- Use a gradient or noise texture as the depth map for interesting focus transitions
- Lower aperture values create more gradual focus falloff
- Higher sample spread values create softer, more diffuse blur but may impact performance
- The focal distance parameter maps luminosity (0-1) to a percentage, so 50 means pixels with ~0.5 luminosity will be in focus
