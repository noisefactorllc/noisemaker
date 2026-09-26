/**
 * One structured diagnostic union for backend shader/compiler failures.
 *
 * Before this module the WebGL2 and WebGPU backends threw ad-hoc plain
 * object literals (`{ code, detail, ... }`) from their compile/link paths
 * and the WebGPU bind-group retry re-parsed raw browser error strings with
 * inline regexes. Every backend shader/compiler failure is now a
 * `ShaderDiagnostic` (a real `Error`) carrying:
 *
 *   - `code`     legacy machine code ('ERR_SHADER_COMPILE', 'ERR_SHADER_LINK',
 *                'ERR_SHADER_MISSING', 'ERR_NO_WGSL_SOURCE');
 *   - `backend`  'webgl2' | 'webgpu';
 *   - `stage`    'compile' | 'link' | 'missing-source' | 'bind';
 *   - `program`  program/pass id, when known;
 *   - `detail`   the raw browser/compiler string, byte-identical to the
 *                legacy thrown shape so `err.detail || err.message`
 *                consumers keep their output;
 *   - `messages` the parsed diagnostic union — one entry per compiler
 *                message with `severity` ('error' | 'warning' | 'info'),
 *                `line`, `column` (when the browser reports one) and
 *                `message` — so retry logic and tooling never re-parse the
 *                browser string themselves;
 *   - `source`   the offending shader source for compile diagnostics;
 *   - `bindingIndex` the parsed problem binding for bind-stage diagnostics.
 *
 * The legacy observable surface (`code`, `detail`, `program`, `source` as
 * enumerable own properties) is preserved, so existing consumers —
 * `formatError()` in compiler.js, the `err.detail || err.message ||
 * JSON.stringify(err)` fallbacks in pipeline.js/canvas.js, and the Shade
 * browser tool wrappers — keep working unchanged.
 */

export const DIAGNOSTIC_CODES = Object.freeze({
    COMPILE: 'ERR_SHADER_COMPILE',
    LINK: 'ERR_SHADER_LINK',
    MISSING_SOURCE: 'ERR_SHADER_MISSING',
    NO_SOURCE: 'ERR_NO_WGSL_SOURCE'
})

/**
 * A single normalized compiler message.
 * @typedef {Object} DiagnosticMessage
 * @property {'error'|'warning'|'info'} severity
 * @property {number|undefined} line
 * @property {number|undefined} column
 * @property {string} message
 */

/**
 * A structured diagnostic thrown by backend compile/link/bind paths.
 * `code`, `detail`, `program` and `source` stay enumerable own properties
 * to preserve the legacy thrown-object serialization shape.
 */
export class ShaderDiagnostic extends Error {
    /**
     * @param {Object} spec
     * @param {string} spec.code legacy machine code (see DIAGNOSTIC_CODES)
     * @param {string} spec.backend 'webgl2' | 'webgpu'
     * @param {string} spec.stage 'compile' | 'link' | 'missing-source' | 'bind'
     * @param {string} [spec.detail] raw browser/compiler string
     * @param {DiagnosticMessage[]} [spec.messages] parsed compiler messages
     * @param {string} [spec.program] program/pass id
     * @param {string} [spec.source] offending shader source
     * @param {number} [spec.bindingIndex] parsed problem binding index
     */
    constructor(spec) {
        const detail = spec.detail !== undefined && spec.detail !== null
            ? String(spec.detail)
            : ''
        super(detail)

        this.name = 'ShaderDiagnostic'
        if (spec.code !== undefined) this.code = spec.code
        this.backend = spec.backend
        this.stage = spec.stage
        this.detail = detail
        this.messages = spec.messages || []

        if (spec.program !== undefined) this.program = spec.program
        if (spec.source !== undefined) this.source = spec.source
        if (spec.bindingIndex !== undefined) this.bindingIndex = spec.bindingIndex
    }
}

/**
 * Parse a GLSL info log (browser/compiler string) into the structured
 * diagnostic union. Handles the ubiquitous `ERROR: 0:LINE: message` /
 * `WARNING: 0:LINE: message` forms; unprefixed driver prose is kept as an
 * info entry so nothing is lost.
 * @param {string} log
 * @returns {DiagnosticMessage[]}
 */
export function parseGLSLInfoLog(log) {
    if (typeof log !== 'string' || log.length === 0) return []

    const messages = []
    for (const line of log.split('\n')) {
        if (line.length === 0) continue
        const match = /^(ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/.exec(line)
        if (match) {
            messages.push({
                severity: match[1].toLowerCase(),
                line: parseInt(match[2], 10),
                column: undefined,
                message: match[3]
            })
        } else {
            messages.push({
                severity: 'info',
                line: undefined,
                column: undefined,
                message: line
            })
        }
    }
    return messages
}

/**
 * Parse WebGPU `getCompilationInfo()` entries into the structured
 * diagnostic union.
 * @param {Array<{type: string, lineNum?: number, linePos?: number, message: string}>} entries
 * @returns {DiagnosticMessage[]}
 */
export function parseWebGPUCompilationMessages(entries) {
    if (!Array.isArray(entries)) return []

    return entries.map(entry => ({
        severity: entry.type,
        line: typeof entry.lineNum === 'number' ? entry.lineNum : undefined,
        column: typeof entry.linePos === 'number' ? entry.linePos : undefined,
        message: entry.message
    }))
}

/**
 * Parse a generic browser/compiler error string into the pieces retry logic
 * needs. Currently the only string-form contract the backends retry on is
 * the WebGPU "binding index N not present in the bind group layout"
 * validation error; the parsed `bindingIndex` replaces inline regex
 * matching in the retry loop.
 * @param {string} text
 * @returns {{ stage: string|undefined, bindingIndex: number|undefined, messages: DiagnosticMessage[] }}
 */
export function parseDiagnosticText(text) {
    const parsed = { stage: undefined, bindingIndex: undefined, messages: [] }
    if (typeof text !== 'string' || text.length === 0) return parsed

    const bindingMatch = /binding index (\d+) not present/.exec(text)
    if (bindingMatch) {
        parsed.stage = 'bind'
        parsed.bindingIndex = parseInt(bindingMatch[1], 10)
    }

    parsed.messages = parseGLSLInfoLog(text)
    return parsed
}

/**
 * Normalize any thrown value into a `ShaderDiagnostic`. `ShaderDiagnostic`
 * instances pass through unchanged; plain objects and `Error`s from the
 * browser are wrapped with their message/detail parsed as a
 * browser/compiler string.
 * @param {unknown} err
 * @param {{ backend: string, stage: string, program?: string }} context
 * @returns {ShaderDiagnostic}
 */
export function toDiagnostic(err, context) {
    if (err instanceof ShaderDiagnostic) return err

    const detail = err && typeof err === 'object' && typeof err.message === 'string'
        ? err.message
        : String(err)
    const parsed = parseDiagnosticText(detail)

    return new ShaderDiagnostic({
        code: undefined,
        backend: context.backend,
        stage: context.stage,
        detail,
        messages: parsed.messages,
        program: context.program,
        bindingIndex: parsed.bindingIndex
    })
}
