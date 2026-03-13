import { B as BrowserSession, C as CompileResult, R as RenderResult, a as BenchmarkResult, P as ParityResult } from '../browser-session-ZRj1tPM6.js';
export { b as BrowserSessionOptions, D as DEFAULT_GLOBALS, I as ImageMetrics, V as ViewerGlobals, g as globalsFromPrefix } from '../browser-session-ZRj1tPM6.js';
import 'playwright';

declare function acquireServer(port: number, viewerRoot: string, effectsDir: string): Promise<string>;
declare function releaseServer(): void;
declare function getServerUrl(): string;
declare function getRefCount(): number;

/**
 * Async semaphore for pipelining browser sessions.
 * Prevents CPU contention when multiple tool calls arrive concurrently.
 */
declare function setMaxBrowsers(n: number): void;
declare function getMaxBrowsers(): number;
declare function getActiveBrowsers(): number;
declare function getQueueDepth(): number;
declare function resetBrowserQueue(): void;

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
    time?: number;
    resolution?: [number, number];
}): Promise<RenderResult>;

declare function benchmarkEffectFPS(session: BrowserSession, effectId: string, options?: {
    targetFps?: number;
    durationSeconds?: number;
    resolution?: [number, number];
}): Promise<BenchmarkResult>;

declare function testNoPassthrough(session: BrowserSession, effectId: string): Promise<any>;

declare function testPixelParity(session: BrowserSession, effectId: string, options?: {
    epsilon?: number;
    seed?: number;
}): Promise<ParityResult>;

declare function testUniformResponsiveness(session: BrowserSession, effectId: string): Promise<any>;

declare function runDslProgram(session: BrowserSession, dsl: string, options?: {
    warmupFrames?: number;
    captureImage?: boolean;
    uniforms?: Record<string, number>;
}): Promise<any>;

declare function checkEffectStructure(effectId: string): Promise<any>;

declare function compareShaders(effectId: string): Promise<any>;

declare function resolveEffectIds(args: {
    effect_id?: string;
    effects?: string;
}, effectsDir: string): string[];
declare function resolveEffectDir(effectId: string, effectsDir: string): string;
declare function matchEffects(allEffects: string[], pattern: string): string[];

export { BenchmarkResult, BrowserSession, CompileResult, ParityResult, RenderResult, acquireServer, benchmarkEffectFPS, checkEffectStructure, compareShaders, compileEffect, computeImageMetrics, getActiveBrowsers, getMaxBrowsers, getQueueDepth, getRefCount, getServerUrl, matchEffects, releaseServer, renderEffectFrame, resetBrowserQueue, resolveEffectDir, resolveEffectIds, runDslProgram, setMaxBrowsers, testNoPassthrough, testPixelParity, testUniformResponsiveness };
