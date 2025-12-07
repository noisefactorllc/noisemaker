/**
 * Simple GLSL/WGSL shader minifier.
 *
 * - Removes line and block comments
 * - Collapses unnecessary whitespace
 * - Preserves preprocessor directives (#version, #define, etc.)
 * - Does NOT rename any identifiers, so uniform names remain unchanged
 */

const OPS3 = new Set(['<<=', '>>='])

const OPS2 = new Set([
    '++', '--',
    '+=', '-=', '*=', '/=', '%=',
    '==', '!=', '<=', '>=',
    '&&', '||',
    '<<', '>>',
    '&=', '|=', '^=',
    '->', '::'
])

const OPS1 = new Set('+-*/%<>=!&|^~?:.,;()[]{}')

/**
 * Remove // and /* comments while preserving strings and newlines.
 * @param {string} src - Source code
 * @returns {string} Source without comments
 */
function stripComments(src) {
    const out = []
    let i = 0
    const n = src.length
    let state = 'NORMAL' // NORMAL, SLASH_LINE, SLASH_BLOCK, STRING

    while (i < n) {
        const ch = src[i]

        if (state === 'NORMAL') {
            if (ch === '"') {
                state = 'STRING'
                out.push(ch)
                i++
                continue
            }

            if (ch === '/' && i + 1 < n) {
                const nxt = src[i + 1]
                if (nxt === '/') {
                    state = 'SLASH_LINE'
                    i += 2
                    continue
                }
                if (nxt === '*') {
                    state = 'SLASH_BLOCK'
                    i += 2
                    continue
                }
            }

            out.push(ch)
            i++
        } else if (state === 'STRING') {
            out.push(ch)

            if (ch === '\\' && i + 1 < n) {
                out.push(src[i + 1])
                i += 2
                continue
            }

            if (ch === '"') {
                state = 'NORMAL'
            }

            i++
        } else if (state === 'SLASH_LINE') {
            if (ch === '\n') {
                out.push('\n')
                state = 'NORMAL'
            }
            i++
        } else if (state === 'SLASH_BLOCK') {
            if (ch === '*' && i + 1 < n && src[i + 1] === '/') {
                i += 2
                state = 'NORMAL'
                continue
            }
            if (ch === '\n') {
                out.push('\n')
            }
            i++
        }
    }

    return out.join('')
}

/**
 * Tokenize comment-free GLSL/WGSL source into tokens.
 * @param {string} src - Source code without comments
 * @returns {Array<[string, string]>} Array of [type, value] tokens
 */
function tokenize(src) {
    const tokens = []
    let i = 0
    const n = src.length
    let startOfLine = true

    while (i < n) {
        const ch = src[i]

        // Skip whitespace (but not newlines)
        if (ch === ' ' || ch === '\t' || ch === '\r') {
            i++
            continue
        }

        // Newline
        if (ch === '\n') {
            startOfLine = true
            i++
            continue
        }

        // Preprocessor directive
        if (startOfLine && ch === '#') {
            let j = i + 1
            while (j < n && src[j] !== '\n') {
                j++
            }
            if (j < n && src[j] === '\n') {
                j++
            }
            let text = src.slice(i, j)
            if (!text.endsWith('\n')) {
                text += '\n'
            }
            tokens.push(['PREPROC', text])
            startOfLine = true
            i = j
            continue
        }

        startOfLine = false

        // String literal
        if (ch === '"') {
            let j = i + 1
            while (j < n) {
                const c = src[j]
                if (c === '\\' && j + 1 < n) {
                    j += 2
                    continue
                }
                if (c === '"') {
                    j++
                    break
                }
                j++
            }
            tokens.push(['STRING', src.slice(i, j)])
            i = j
            continue
        }

        // Identifier
        if (/[a-zA-Z_]/.test(ch)) {
            let j = i + 1
            while (j < n && /[a-zA-Z0-9_]/.test(src[j])) {
                j++
            }
            tokens.push(['IDENT', src.slice(i, j)])
            i = j
            continue
        }

        // Number literal
        if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < n && /[0-9]/.test(src[i + 1]))) {
            let j = i

            // Hex, binary, octal
            if (ch === '0' && i + 1 < n && /[xXbBoO]/.test(src[i + 1])) {
                j += 2
                while (j < n && /[0-9a-fA-F]/.test(src[j])) {
                    j++
                }
            } else {
                // Decimal/float
                let seenDot = false
                let seenExp = false
                while (j < n) {
                    const c = src[j]
                    if (/[0-9]/.test(c)) {
                        j++
                    } else if (c === '.' && !seenDot && !seenExp) {
                        seenDot = true
                        j++
                    } else if (/[eE]/.test(c) && !seenExp) {
                        seenExp = true
                        j++
                        if (j < n && /[+-]/.test(src[j])) {
                            j++
                        }
                    } else {
                        break
                    }
                }
            }

            // Suffix (u, l, f, etc.)
            while (j < n && /[uUlLfF]/.test(src[j])) {
                j++
            }

            tokens.push(['NUMBER', src.slice(i, j)])
            i = j
            continue
        }

        // 3-char operators
        if (i + 3 <= n && OPS3.has(src.slice(i, i + 3))) {
            tokens.push(['OP', src.slice(i, i + 3)])
            i += 3
            continue
        }

        // 2-char operators
        if (i + 2 <= n && OPS2.has(src.slice(i, i + 2))) {
            tokens.push(['OP', src.slice(i, i + 2)])
            i += 2
            continue
        }

        // 1-char operators
        if (OPS1.has(ch)) {
            tokens.push(['OP', ch])
            i++
            continue
        }

        // Unknown character - pass through
        tokens.push(['OP', ch])
        i++
    }

    return tokens
}

/**
 * Reconstruct source from tokens with minimal safe whitespace.
 * @param {Array<[string, string]>} tokens - Token array
 * @returns {string} Minified source
 */
function minifyTokens(tokens) {
    const outParts = []
    let prevType = null
    let prevVal = null
    const wordTypes = new Set(['IDENT', 'NUMBER', 'STRING'])

    for (const [ttype, val] of tokens) {
        if (ttype === 'PREPROC') {
            // Preprocessor directives need their own line
            if (outParts.length > 0 && !outParts[outParts.length - 1].endsWith('\n')) {
                outParts.push('\n')
            }
            outParts.push(val.trimEnd() + '\n')
            prevType = null
            prevVal = null
            continue
        }

        // Add space between adjacent word-like tokens
        if (wordTypes.has(prevType) && wordTypes.has(ttype)) {
            outParts.push(' ')
        }
        // WGSL: Add space after closing generic '>' when followed by identifier
        // This preserves "var<uniform> name" instead of "var<uniform>name"
        else if (prevType === 'OP' && prevVal === '>' && ttype === 'IDENT') {
            outParts.push(' ')
        }

        outParts.push(val)

        // Add newline after semicolons and opening braces to preserve line-based parsing
        // This is critical for WebGPU uniform parsing which uses [^\n] patterns
        if (ttype === 'OP' && (val === ';' || val === '{')) {
            outParts.push('\n')
        }

        prevType = ttype
        prevVal = val
    }

    let result = outParts.join('')
    if (!result.endsWith('\n')) {
        result += '\n'
    }
    return result
}

/**
 * Minify GLSL or WGSL shader source code.
 * @param {string} src - Shader source code
 * @returns {string} Minified shader source
 */
export function minifyShader(src) {
    const withoutComments = stripComments(src)
    const tokens = tokenize(withoutComments)
    return minifyTokens(tokens)
}

export default minifyShader
