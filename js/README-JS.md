# Noisemaker JavaScript Port

> **This is a short summary.** The full JavaScript API reference lives at
> **<https://noisemaker.readthedocs.io/en/latest/javascript.html>**. Each
> section heading below links to the corresponding section in the full docs.

This document covers the JS port of Noisemaker. See additional
[porter's notes](doc/VANILLA_JS_PORT_SPEC.md).

## [Cross-language parity tests](https://noisemaker.readthedocs.io/en/latest/javascript.html#cross-language-parity)

`npm test` runs the JavaScript suite, which invokes the Python reference
implementation in a subprocess and compares outputs directly. No fixture files
or canned images are used. Any difference between languages is treated as a
test failure—do not modify the Python reference implementation, and do not skip
or weaken tests to hide problems.

## [Command-line rendering](https://noisemaker.readthedocs.io/en/latest/javascript.html#command-line-rendering-experimental)

The experimental JavaScript build now includes a small Node-powered CLI for
rendering presets without opening the browser. After installing dependencies
(`npm install`), run the `noisemaker-js` command:

```bash
noisemaker-js generate basic --filename output.png --width 512 --height 512 --seed 123
```

Additional options include `--time`, `--speed`, `--with-alpha`, and `--debug`
to mirror the browser controls. The CLI writes a PNG file to the requested
location and creates parent directories as needed.

### Custom Presets

You can use your own presets file with the `--presets` option:

```bash
noisemaker-js generate my-preset --presets ./my-presets.dsl --filename custom.png
```

This allows you to define custom presets in a separate DSL file. Your custom
file should follow the same syntax as the built-in `share/dsl/presets.dsl`.

## [Vanilla JS effects registry](https://noisemaker.readthedocs.io/en/latest/javascript.html#effects-and-composition)

The Vanilla JavaScript port includes an `effectsRegistry` helper that tracks all
available post-processing effects along with their default parameters. After an
effect is registered the defaults can be inspected via `EFFECT_METADATA`.

```javascript
import { register, EFFECT_METADATA } from "./noisemaker/effectsRegistry.js";

function ripple(tensor, shape, time, speed, amount = 1.0) {
  // ...effect implementation...
}

register("ripple", ripple, { amount: 1.0 });

console.log(EFFECT_METADATA.ripple); // => { amount: 1.0 }
```

Effect callbacks must accept `(tensor, shape, time, speed, ...params)` in that
order. Any additional parameters require matching default values supplied in the
`defaults` object passed to `register`.

---

For installation, core modules, parity requirements, the Python ↔ JavaScript
quick reference, and full examples, see the
[full JavaScript API docs on Read the Docs](https://noisemaker.readthedocs.io/en/latest/javascript.html).
