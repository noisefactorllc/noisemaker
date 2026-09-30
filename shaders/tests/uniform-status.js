/**
 * Truthful aggregation for `testUniformResponsiveness()` results.
 *
 * The upstream Shade MCP tool (vendor/shade-mcp/harness/index.js,
 * `testUniformResponsiveness()`, originally `src/tools/browser/uniforms.ts`)
 * reports its outer `status` as `ok` when **any** tested uniform moved the
 * output, even when other entries in `tested_uniforms` end in `:fail` or
 * `:error`. A caller that trusts the outer status silently accepts uniforms
 * that do not affect output (GAP-010).
 *
 * This module is the repository-side truth source: it reclassifies an
 * upstream result from every `tested_uniforms` entry, so callers (including
 * the harness's `--strict-uniforms` gate) never have to parse the entries
 * themselves. The upstream tool itself is unchanged — a vendor refresh
 * cannot remove this aggregation.
 */

/**
 * Entry suffixes recognized in `tested_uniforms` strings.
 * Anything else is treated as an error entry, never silently accepted.
 */
const PASS_SUFFIX = ':pass'
const FAIL_SUFFIX = ':fail'
const ERROR_SUFFIX = ':error'

/**
 * The harness's `--strict-uniforms` gate, mirrored so the opt-in contract is
 * testable without a browser: the default gate keeps the upstream outer
 * status, and only the explicit opt-in consumes the truthful per-entry
 * aggregate — so previously accepted effects are only newly rejected behind
 * the opt-in.
 *
 * @param {boolean} strictUniforms - `options.strictUniforms` opt-in.
 * @param {string} upstreamStatus - The upstream result's outer `status`.
 * @param {string} aggregateStatus - `aggregateUniformResponsiveness().status`.
 * @returns {string} The gated uniform status.
 */
export function resolveUniformGateStatus(strictUniforms, upstreamStatus, aggregateStatus) {
    return strictUniforms ? aggregateStatus : upstreamStatus
}

/**
 * Reclassify a `testUniformResponsiveness()` result so the outer status is
 * derived from every `tested_uniforms` entry instead of "any passed".
 *
 * @param {object|null|undefined} result - The upstream tool result:
 *   `{ status, tested_uniforms, details }`.
 * @returns {{status: string, tested_uniforms: string[], details: string}}
 *   `status` is one of:
 *   - `'ok'`      — at least one entry and every entry ends in `:pass`;
 *   - `'fail'`    — no `:error` entries but at least one `:fail`;
 *   - `'error'`   — any `:error` (or unrecognized) entry, a missing/malformed
 *                   result, or no entries at all;
 *   - `'skipped'` — the upstream result was `skipped` (no testable uniforms).
 *   `tested_uniforms` and `details` pass through unchanged.
 */
export function aggregateUniformResponsiveness(result) {
    if (!result || !Array.isArray(result.tested_uniforms)) {
        return {
            status: 'error',
            tested_uniforms: [],
            details: result && result.details ? result.details : 'Missing or malformed uniform responsiveness result',
        }
    }

    if (result.status === 'skipped') {
        return { status: 'skipped', tested_uniforms: result.tested_uniforms, details: result.details ?? '' }
    }

    // The upstream schema emits only `ok`, `error`, or `skipped` as the
    // outer status (vendor/shade-mcp/harness/index.js,
    // `testUniformResponsiveness()`); anything else — including a missing
    // or non-string status — is an error entry set, never silently ok.
    if (result.status !== 'ok' && result.status !== 'error') {
        return { status: 'error', tested_uniforms: result.tested_uniforms, details: result.details ?? '' }
    }

    let sawFail = false
    let sawError = false
    for (const entry of result.tested_uniforms) {
        if (typeof entry !== 'string' || !(entry.endsWith(PASS_SUFFIX) || entry.endsWith(FAIL_SUFFIX) || entry.endsWith(ERROR_SUFFIX))) {
            sawError = true
            continue
        }
        if (entry.endsWith(FAIL_SUFFIX)) sawFail = true
        else if (!entry.endsWith(PASS_SUFFIX)) sawError = true
    }

    if (sawError) {
        return { status: 'error', tested_uniforms: result.tested_uniforms, details: result.details ?? '' }
    }
    if (result.tested_uniforms.length === 0) {
        return { status: 'error', tested_uniforms: result.tested_uniforms, details: result.details ?? '' }
    }
    // With entries present, the entries are the truth: an upstream outer
    // `error` ("No uniforms affected output") with all-`:fail` entries is a
    // fail, and all-`:pass` entries are ok regardless of the outer status.
    if (sawFail) {
        return { status: 'fail', tested_uniforms: result.tested_uniforms, details: result.details ?? '' }
    }
    return { status: 'ok', tested_uniforms: result.tested_uniforms, details: result.details ?? '' }
}
