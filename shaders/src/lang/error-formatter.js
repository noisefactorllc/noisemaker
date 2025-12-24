/**
 * Error formatter for DSL syntax errors.
 * Provides nicely formatted error messages with source context.
 */

/**
 * Parse line and column from a SyntaxError message.
 * Matches patterns like "at line 8 col 28" or "at line 8 column 28"
 * @param {string} message - Error message
 * @returns {{line: number, col: number}|null}
 */
function parseLocation(message) {
    const match = message.match(/at line (\d+) col(?:umn)? (\d+)/)
    if (match) {
        return {
            line: parseInt(match[1], 10),
            col: parseInt(match[2], 10)
        }
    }
    return null
}

/**
 * Extract the core error message (without location suffix).
 * @param {string} message - Full error message
 * @returns {string}
 */
function extractMessage(message) {
    return message.replace(/\s+at line \d+ col(?:umn)? \d+$/, '').trim()
}

/**
 * Format a DSL syntax error with source context.
 * @param {string} source - The DSL source code
 * @param {Error} error - The SyntaxError
 * @param {object} [options] - Formatting options
 * @param {number} [options.contextLines=2] - Number of context lines before/after error
 * @returns {string} Formatted error string
 */
export function formatDslError(source, error, options = {}) {
    const { contextLines = 2 } = options

    if (!error || typeof error.message !== 'string') {
        return error ? String(error) : 'Unknown error'
    }

    const loc = parseLocation(error.message)
    const coreMessage = extractMessage(error.message)

    if (!loc || !source) {
        // No location info, just return the message without stack
        return `SyntaxError: ${coreMessage}`
    }

    const lines = source.split('\n')
    const errorLine = loc.line
    const errorCol = loc.col

    // Calculate line number width for padding
    const lastLineNum = Math.min(errorLine + contextLines, lines.length)
    const lineNumWidth = String(lastLineNum).length

    // Build the formatted output
    const parts = []

    // Header
    parts.push(`SyntaxError: ${coreMessage}`)
    parts.push(`  --> line ${errorLine}, column ${errorCol}`)
    parts.push('')

    // Context lines before
    const startLine = Math.max(1, errorLine - contextLines)
    for (let i = startLine; i < errorLine; i++) {
        const lineNum = String(i).padStart(lineNumWidth, ' ')
        parts.push(`  ${lineNum} | ${lines[i - 1]}`)
    }

    // Error line
    const errorLineNum = String(errorLine).padStart(lineNumWidth, ' ')
    const errorLineContent = lines[errorLine - 1] || ''
    parts.push(`  ${errorLineNum} | ${errorLineContent}`)

    // Pointer line
    const pointerPadding = ' '.repeat(lineNumWidth + 3) // "  N | " prefix
    const colPadding = ' '.repeat(Math.max(0, errorCol - 1))
    parts.push(`${pointerPadding}${colPadding}^-- error here`)

    // Context lines after
    const endLine = Math.min(lines.length, errorLine + contextLines)
    for (let i = errorLine + 1; i <= endLine; i++) {
        const lineNum = String(i).padStart(lineNumWidth, ' ')
        parts.push(`  ${lineNum} | ${lines[i - 1]}`)
    }

    return parts.join('\n')
}

/**
 * Check if an error is a DSL syntax error with location information.
 * @param {Error} error
 * @returns {boolean}
 */
export function isDslSyntaxError(error) {
    return error instanceof SyntaxError &&
           typeof error.message === 'string' &&
           parseLocation(error.message) !== null
}
