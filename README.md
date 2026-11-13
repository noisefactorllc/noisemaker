# Noisemaker

Noisemaker is a composable shader art engine for web, desktop, and mobile. It renders real-time generative art and visual effects on WebGL2, WebGPU, and [more](https://demos.noisemaker.app). It includes 100+ composable effects and a compact declarative DSL to connect them. It requires no build step or dependencies.

## Noisedeck

[Noisedeck](https://noisedeck.app) is a shader art studio built on Noisemaker.

## Getting Started

The [documentation index](https://docs.noisemaker.app/) covers all usage, including a quick start for the shader engine.

To learn more about the individual effects you'll find in Noisemaker, visit the [Book of Polymorphic DSL](https://polymorphic.noisedeck.app/book/).

## Features

- 100+ shader effects. Generators, filters, mixers, particles, and simulations; composable into free-form chains
- Polymorphic DSL: compact, declarative programs that compile to a GPU render graph
- Dual rendering backends: WebGL2 and WebGPU
- Runs straight from a CDN bundle and embeds in any page, no frontend framework required
- External media, audio, and MIDI inputs
- Portable effect packages carrying definitions, help docs, and shaders for both backends
- Python and JavaScript pipelines for offline CPU workflows (CLI, Docker, Colab notebook)
- Multiple ports for running on other target platforms

## Contributing

Contributions follow the Noise Factor [contributing policy](https://github.com/noisefactorllc/.github/blob/main/CONTRIBUTING.md) and [Code of Conduct](https://github.com/noisefactorllc/.github/blob/main/CODE_OF_CONDUCT.md).

## Target Platforms

Additional platform-specific guides:

- [Shaders](https://docs.noisemaker.app/shaders/) for the WebGL2 and WebGPU engine
- [Shaders Ports](https://demos.noisemaker.app/#ports) for additional target platforms

Older code, but it still checks out:

- [Classic Composer (Python, JS)](https://docs.noisemaker.app/composer-api/) CPU-based presets ("old" Noisemaker)
- Container workflows for Composer appear in the [Docker README](README-DOCKER.md)

## Bring your coding agent

Coding agents can read the documentation in machine-readable form: [llms.txt](https://noisemaker.app/llms.txt) and [llms-full.txt](https://noisemaker.app/llms-full.txt). Every effect includes a structured definition and a manifest entry. These resources cover DSL composition and custom GLSL and WGSL effects in the [Portable Effects](https://github.com/noisefactorllc/portable) format.

[shade-mcp](https://github.com/noisefactorllc/shade-mcp) drives a real browser to compile effects, render frames, check each uniform's effect, and compare WebGL2 with WebGPU. See [Building with coding agents](https://docs.noisemaker.app/coding-agents/) for the full workflow.

## Credits

Noisemaker's shader effects build on work shared by the creative coding community. See [CREDITS.md](CREDITS.md) for attributions.

## License

Noisemaker is released under the [MIT License](LICENSE). Use of name in derivative products is subject to the [Trademark Policy](TRADEMARK.md).

Copyright © 2017–2026 Noise Factor LLC
