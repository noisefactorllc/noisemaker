import type { Backend } from '../config.js';
export interface ViewerGlobals {
    canvasRenderer: string;
    renderingPipeline: string;
    currentBackend: string;
    currentEffect: string;
    setPaused: string;
    setPausedTime: string;
    frameCount: string;
    /**
     * Optional compile generation counter (`${prefix}PipelineGeneration`, e.g.
     * `__noisemakerPipelineGeneration`): viewers that publish it bump the number
     * after every successful compile. Used to bind readiness to a selection —
     * absent, the selection wait falls back to graph-swap / isCompiling signals.
     */
    pipelineGeneration?: string;
}
export declare const DEFAULT_GLOBALS: ViewerGlobals;
export declare function globalsFromPrefix(prefix: string): ViewerGlobals;
export interface BrowserSessionOptions {
    backend: Backend;
    blankPage?: boolean;
    headless?: boolean;
    viewerPort?: number;
    viewerRoot?: string;
    viewerPath?: string;
    effectsDir?: string;
    globals?: ViewerGlobals;
    timeoutMs?: number;
}
export interface ImageMetrics {
    mean_rgb: [number, number, number];
    mean_alpha: number;
    std_rgb: [number, number, number];
    luma_variance: number;
    unique_sampled_colors: number;
    is_all_zero: boolean;
    is_all_transparent: boolean;
    is_essentially_blank: boolean;
    is_monochrome: boolean;
}
export interface CompileResult {
    status: 'ok' | 'error';
    backend: string;
    passes: Array<{
        id: string;
        status: 'ok' | 'error';
        errors?: string[];
    }>;
    message: string;
    console_errors?: string[];
    effect_id?: string;
}
export interface RenderResult {
    status: 'ok' | 'error';
    backend: string;
    error?: string;
    effect_id?: string;
    requested_resolution?: [number, number];
    warning?: string;
    frame?: {
        image_uri?: string;
        width: number;
        height: number;
    };
    metrics?: ImageMetrics;
    console_errors?: string[];
}
export interface BenchmarkResult {
    status: 'ok' | 'error';
    backend: string;
    achieved_fps: number;
    effect_id?: string;
    meets_target: boolean;
    requested_resolution?: [number, number];
    warning?: string;
    frame?: {
        width: number;
        height: number;
    };
    error?: string;
    stats: {
        frame_count: number;
        avg_frame_time_ms: number;
        jitter_ms: number;
        min_frame_time_ms: number;
        max_frame_time_ms: number;
    };
    console_errors?: string[];
}
export interface ParityResult {
    status: 'ok' | 'error' | 'mismatch';
    maxDiff: number;
    meanDiff: number;
    mismatchCount: number;
    mismatchPercent: number;
    resolution: [number, number];
    details: string;
    console_errors?: string[];
    effect_id?: string;
    backend?: string;
    glslSolid?: boolean;
    wgslSolid?: boolean;
    glslVariance?: number[];
    wgslVariance?: number[];
    yFlipDetected?: boolean;
    yFlipCleanFlip?: boolean;
    yFlipMismatchPercent?: number;
    yFlipMeanDiff?: number;
    yFlipRatio?: number;
    issues?: string[];
}
/**
 * Outcome of a bound effect selection (`BrowserSession.selectEffect`): the
 * wait resolves only when the page finished building the requested effect
 * after the selection (issue #34) — never on viewer status text alone, which
 * still describes the previous effect right after a selection.
 */
export interface EffectSelectionResult {
    status: 'ok' | 'error';
    /** Viewer status text; on 'error' this is the failure message. */
    message?: string;
    /**
     * Effect id the page reports as current (from the `currentEffect` viewer
     * global) once the wait resolved; null when the viewer does not expose it.
     */
    effectId: string | null;
    /** Backend reported by `pipeline.backend.getName()`, or 'unknown'. */
    backend: string;
    /**
     * Passes of the graph that finished building; error entries when the
     * viewer reported a compile failure; null when no graph was readable.
     */
    passes: Array<{
        id: string;
        status: 'ok' | 'error';
    }> | null;
}
//# sourceMappingURL=types.d.ts.map