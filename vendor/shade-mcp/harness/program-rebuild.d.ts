import type { ViewerGlobals } from './types.js';
/**
 * Page function (serialized by page.evaluate, so it stays self-contained):
 * give the page `window.__shadeRebuildProgram()`, which rebuilds the
 * renderer's current program into a fresh pipeline and resolves true, or
 * resolves false when the renderer cannot rebuild its program.
 *
 * A fresh pipeline holds no frame history and no feedback, temporal or
 * persistent texture contents, so a capture rendered from it starts from a
 * known state. The rebuild keeps what the page gave the old pipeline after
 * its own build:
 * - the uniform values that differ from the program's (the viewer's
 *   parameter values, a text or media size): global values through the
 *   pipeline's setUniform, which also resizes the textures a size value
 *   drives, then each pass's own values;
 * - the textures the page uploaded through the renderer (media and text
 *   inputs), recorded from here on and uploaded again from the same sources.
 * Install it before the selection whose uploads it must keep.
 */
export declare function installProgramRebuild({ globals, timeout }: {
    globals: ViewerGlobals;
    timeout: number;
}): boolean;
//# sourceMappingURL=program-rebuild.d.ts.map