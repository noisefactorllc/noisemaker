import {lex} from './lexer.js'
import {parse} from './parser.js'
import {validate} from './validator.js'
import {unparse, applyParameterUpdates, formatValue, unparseCall} from './unparser.js'
import {replaceEffect, listSteps, getCompatibleReplacements} from './transform.js'
import {formatDslError, isDslSyntaxError} from './error-formatter.js'

/**
 * Compiles source string into a validated AST (Planned Chain)
 * @param {string} src
 * @returns {object} {plans, diagnostics, render}
 */
export function compile(src) {
    const tokens = lex(src)
    const ast = parse(tokens)
    return validate(ast)
}

export { lex, parse, validate, unparse, applyParameterUpdates, formatValue, unparseCall, replaceEffect, listSteps, getCompatibleReplacements, formatDslError, isDslSyntaxError }
