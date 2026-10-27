# Noisemaker

Noisemaker is an extendable shader art engine for the browser. It renders real-time generative art and visual effects on WebGL2 and WebGPU. It includes 100+ composable effects and a compact declarative DSL to connect them. It requires no build step or dependencies.

## Noisedeck

[Noisedeck](https://noisedeck.app) is a real-time shader video synth built on Noisemaker — 100+ effects, free-form routing, runs in the browser. No install required. [Try it free.](https://noisedeck.app)

## Documentation

Full documentation, including the complete API reference and preset guide, is available at [docs.noisemaker.app](https://docs.noisemaker.app/).

## Features

- 100+ shader effects — generators, filters, mixers, particles, and simulations — composable into free-form chains
- Polymorphic DSL: compact, declarative programs that compile to a GPU render graph
- 3D scene graph (preview): cameras, lights, meshes, volumes and PBR materials described in the same DSL, rendered by a deferred renderer into an ordinary surface so the 2D effects apply as post-processing
- Dual rendering backends: WebGL2 and WebGPU
- Runs straight from a CDN bundle and embeds in any page, no frontend framework required
- External media, audio, and MIDI inputs
- Portable effect packages carrying definitions, help docs, and shaders for both backends
- Python and JavaScript pipelines for offline CPU workflows (CLI, Docker, Colab notebook)

## Getting Started

The [documentation index](https://docs.noisemaker.app/) starts with a quick start for the browser shader engine. For the Python package, see the [CLI guide](https://docs.noisemaker.app/cli/) and the [API reference](https://docs.noisemaker.app/api/). For the browser modules, see the [JavaScript API](https://docs.noisemaker.app/javascript/). For containers, see the [Docker README](README-DOCKER.md). The `noisemaker animate` and `noisemaker magic-mashup` commands run `ffmpeg` to write their MP4 and GIF output, so `ffmpeg` must be on your `PATH`. The Docker image includes it. The dedicated READMEs below provide platform-specific guides.

## Bring your coding agent

Coding agents can read the documentation in machine-readable form: [llms.txt](https://noisemaker.app/llms.txt) and [llms-full.txt](https://noisemaker.app/llms-full.txt). Every effect includes a structured definition and a manifest entry. These resources cover DSL composition and custom GLSL and WGSL effects in the [Portable Effects](https://github.com/noisefactorllc/portable) format.

[shade-mcp](https://github.com/noisefactorllc/shade-mcp) drives a real browser to compile effects, render frames, check each uniform's effect, and compare WebGL2 with WebGPU. See [Building with coding agents](https://docs.noisemaker.app/coding-agents/) for the full workflow.

## Contributing

Contributions follow the Noise Factor [contributing policy](https://github.com/noisefactorllc/.github/blob/main/CONTRIBUTING.md) and [Code of Conduct](https://github.com/noisefactorllc/.github/blob/main/CODE_OF_CONDUCT.md).

## Ports

Additional platform-specific guides:

- Python development and API details live in the docs linked above
- The [JavaScript README](js/README-JS.md) covers the JavaScript presets port
- The [Shaders README](shaders/README-SHADERS.md) documents the shader effects port
- Container workflows appear in the [Docker README](README-DOCKER.md)

## Credits

Noisemaker's shader effects build on work shared by the creative coding community. See [CREDITS.md](CREDITS.md) for attributions.

## License

Noisemaker is released under the [MIT License](LICENSE). Use of name in derivative products is subject to the [Trademark Policy](TRADEMARK.md).

Copyright © 2017–2026 Noise Factor LLC
