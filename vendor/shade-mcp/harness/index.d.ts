import { Page } from 'playwright';

type Backend = 'webgl2' | 'webgpu';

interface ViewerGlobals {
    canvasRenderer: string;
    renderingPipeline: string;
    currentBackend: string;
    currentEffect: string;
    setPaused: string;
    setPausedTime: string;
    frameCount: string;
}
declare const DEFAULT_GLOBALS: ViewerGlobals;
interface BrowserSessionOptions {
    backend: Backend;
    headless?: boolean;
    viewerPort?: number;
    viewerRoot?: string;
    viewerPath?: string;
    effectsDir?: string;
    globals?: ViewerGlobals;
}
interface ImageMetrics$1 {
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
interface CompileResult {
    status: 'ok' | 'error';
    backend: string;
    passes: Array<{
        id: string;
        status: 'ok' | 'error';
        errors?: string[];
    }>;
    message: string;
    console_errors?: string[];
}
interface RenderResult {
    status: 'ok' | 'error';
    backend: string;
    frame?: {
        image_uri?: string;
        width: number;
        height: number;
    };
    metrics?: ImageMetrics$1;
    console_errors?: string[];
}
interface BenchmarkResult {
    status: 'ok' | 'error';
    backend: string;
    achieved_fps: number;
    meets_target: boolean;
    stats: {
        frame_count: number;
        avg_frame_time_ms: number;
        jitter_ms: number;
        min_frame_time_ms: number;
        max_frame_time_ms: number;
    };
    console_errors?: string[];
}
interface ParityResult {
    status: 'ok' | 'error' | 'mismatch';
    maxDiff: number;
    meanDiff: number;
    mismatchCount: number;
    mismatchPercent: number;
    resolution: [number, number];
    details: string;
    console_errors?: string[];
}

interface ConsoleEntry {
    type: string;
    text: string;
}
declare class BrowserSession {
    private options;
    private viewerPath;
    private browser;
    private context;
    page: Page | null;
    globals: ViewerGlobals;
    private baseUrl;
    private consoleMessages;
    private _isSetup;
    constructor(opts: BrowserSessionOptions);
    setup(): Promise<void>;
    teardown(): Promise<void>;
    setBackend(backend: Backend): Promise<void>;
    clearConsoleMessages(): void;
    getConsoleMessages(): ConsoleEntry[];
    runWithConsoleCapture<T>(fn: () => Promise<T>): Promise<T & {
        console_errors?: string[];
    }>;
    get backend(): Backend;
    selectEffect(effectId: string): Promise<void>;
    getEffectGlobals(): Promise<Record<string, any>>;
    resetUniformsToDefaults(): Promise<void>;
}

declare function acquireServer(port: number, viewerRoot: string, effectsDir: string): Promise<string>;
declare function releaseServer(): void;
declare function getServerUrl(): string;
declare function getRefCount(): number;

interface ImageMetrics {
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
/**
 * Compute statistical metrics from RGBA pixel data.
 * Handles both Uint8Array (0-255) and Float32Array (0-1) input.
 * Samples ~1000 pixels via strided iteration for performance.
 */
declare function computeImageMetrics(data: Uint8Array | Float32Array, width: number, height: number): ImageMetrics;

declare function compileEffect(session: BrowserSession, effectId: string): Promise<CompileResult>;

declare function renderEffectFrame(session: BrowserSession, effectId: string, options?: {
    warmupFrames?: number;
    captureImage?: boolean;
    uniforms?: Record<string, number>;
}): Promise<RenderResult>;

declare function benchmarkEffectFPS(session: BrowserSession, effectId: string, options?: {
    targetFps?: number;
    durationSeconds?: number;
}): Promise<BenchmarkResult>;

declare function testNoPassthrough(session: BrowserSession, effectId: string): Promise<any>;

declare function testPixelParity(session: BrowserSession, effectId: string, options?: {
    epsilon?: number;
}): Promise<ParityResult>;

declare function testUniformResponsiveness(session: BrowserSession, effectId: string): Promise<any>;

declare function checkEffectStructure(effectId: string): Promise<any>;

declare function resolveEffectIds(args: {
    effect_id?: string;
    effects?: string;
}, effectsDir: string): string[];
declare function matchEffects(allEffects: string[], pattern: string): string[];

export { type BenchmarkResult, BrowserSession, type BrowserSessionOptions, type CompileResult, DEFAULT_GLOBALS, type ImageMetrics$1 as ImageMetrics, type ParityResult, type RenderResult, type ViewerGlobals, acquireServer, benchmarkEffectFPS, checkEffectStructure, compileEffect, computeImageMetrics, getRefCount, getServerUrl, matchEffects, releaseServer, renderEffectFrame, resolveEffectIds, testNoPassthrough, testPixelParity, testUniformResponsiveness };
