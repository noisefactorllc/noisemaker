import { type Page } from 'playwright';
import type { Backend } from '../config.js';
import type { BrowserSessionOptions, ViewerGlobals, EffectSelectionResult } from './types.js';
interface ConsoleEntry {
    type: string;
    text: string;
}
/**
 * GPU-less machines usually have no system Vulkan driver either, so Dawn's
 * WebGPU backend finds no ICD: adapter enumeration is erratic and device
 * requests die with Dawn's "A valid external Instance reference no longer
 * exists". Chromium ships its own SwiftShader Vulkan ICD next to the browser
 * binary — point the Vulkan loader at it so WebGPU renders deterministically.
 */
export declare function swiftshaderVulkanEnv(): Record<string, string>;
/**
 * Whether a page-reported backend name is the requested backend. Names come
 * in two conventions: `pipeline.backend.getName()` ('WebGL2'/'WebGPU' in
 * noisemaker) and the `currentBackend` viewer global ('glsl'/'wgsl').
 */
export declare function backendNameMatches(actual: string | null | undefined, requested: Backend): boolean;
/**
 * Returns a human-readable problem when a selection outcome does not match
 * the request — selection failure, wrong effect, wrong backend — or null
 * when the page confirmed the requested effect on the requested backend.
 * The verbs surface this as a `status: 'error'` result instead of silently
 * measuring whatever the page happens to hold (issue #34).
 */
export declare function effectSelectionProblem(selection: EffectSelectionResult, effectId: string, requestedBackend: Backend): string | null;
export declare class BrowserSession {
    private options;
    private viewerPath;
    /** Ceiling for every page operation this session performs. */
    readonly timeoutMs: number;
    private browser;
    private context;
    page: Page | null;
    globals: ViewerGlobals;
    private baseUrl;
    private consoleMessages;
    private _isSetup;
    private _serverAcquired;
    private _slotAcquired;
    constructor(opts: BrowserSessionOptions);
    setup(): Promise<void>;
    /**
     * Hands back the server ref and browser slot exactly once. Tools call
     * teardown() from a finally block that also runs after a failed setup, so
     * releasing unconditionally would hand back another session's resources.
     */
    private releaseShared;
    teardown(): Promise<void>;
    /**
     * Puts the viewer on the requested backend and verifies the switch took
     * effect: rejects when the page backend never reaches the target within
     * `timeoutMs` (issue #34) instead of returning silently while every verb
     * keeps measuring on the previous backend.
     */
    setBackend(backend: Backend): Promise<void>;
    clearConsoleMessages(): void;
    getConsoleMessages(): ConsoleEntry[];
    runWithConsoleCapture<T>(fn: () => Promise<T>): Promise<T & {
        console_errors?: string[];
    }>;
    get backend(): Backend;
    /**
     * Selects an effect in the viewer and waits until the page actually built
     * it (issue #34): the wait resolves only when the viewer's current effect
     * is the requested id — or the pipeline provably rebuilt after this
     * selection AND the page confirms the id — and the graph finished
     * compiling. Status text is NOT a readiness signal: right after a
     * selection it still describes the previous effect, which is how verbs
     * ended up measuring the old graph.
     *
     * Returns the page-confirmed outcome: status 'error' when the wait timed
     * out, the viewer reported a compile failure bound to this selection, the
     * page ended up showing a different effect than the one requested, or the
     * page does not expose the current effect's identity at all (fail closed —
     * an unbound result is never reported as ok).
     */
    selectEffect(effectId: string): Promise<EffectSelectionResult>;
    /**
     * The page's current effect identity and backend name, without any
     * selection. Used to bind even failure results to what the page actually
     * holds (issue #34): values the page does not expose come back null.
     */
    readPageIdentity(): Promise<{
        effectId: string | null;
        backend: string | null;
    }>;
    getEffectGlobals(): Promise<Record<string, any>>;
    resetUniformsToDefaults(): Promise<void>;
}
export {};
//# sourceMappingURL=browser-session.d.ts.map