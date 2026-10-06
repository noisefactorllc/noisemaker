/**
 * Image statistics shared by every verb (`renderEffectFrame`,
 * `runDslProgram`) and the library export. Each field has one definition.
 * About 1000 pixels are sampled with a fixed stride over the RGBA buffer in
 * screen order; all values are over those samples, with channels in 0..1.
 */
export interface ImageMetrics {
    /** Mean R, G, B. */
    mean_rgb: [number, number, number];
    /** Mean alpha. */
    mean_alpha: number;
    /** Standard deviation of R, G, B. */
    std_rgb: [number, number, number];
    /** Variance of Rec. 601 luma (0.299 R + 0.587 G + 0.114 B). */
    luma_variance: number;
    /** Distinct exact 8-bit RGB triples among the samples. */
    unique_sampled_colors: number;
    /** Every sample has R, G and B at or below 0.001. */
    is_all_zero: boolean;
    /** Every sample has alpha at or below 0.001. */
    is_all_transparent: boolean;
    /** The frame is flat: luma variance below 1e-4, at any brightness. */
    is_essentially_blank: boolean;
    /** At most one distinct exact RGB triple. */
    is_monochrome: boolean;
}
/**
 * Compute statistical metrics from RGBA pixel data.
 * Handles both Uint8Array (0-255) and Float32Array (0-1) input.
 *
 * This is the only implementation of `ImageMetrics`. The browser verbs read
 * the frame back to Node and call it, so a field means the same thing for
 * every verb and for library callers (issue #29).
 */
export declare function computeImageMetrics(data: Uint8Array | Float32Array, width: number, height: number): ImageMetrics;
//# sourceMappingURL=pixel-reader.d.ts.map