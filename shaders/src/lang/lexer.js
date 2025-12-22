/**
 * Lexer for the live-coding DSL
 * Produces an array of tokens: {type, lexeme, line, col}
 * @param {string} src source code
 * @returns {Array}
 */
export function lex(src) {
    const tokens = []
    let i = 0
    let line = 1
    let col = 1

    function add(type, lexeme, line, col) {
        tokens.push({type, lexeme, line, col})
    }

    const isDigit = c => c >= '0' && c <= '9'
    const isLetter = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
    const keywords = {
        let: 'LET',
        render: 'RENDER',
        write: 'WRITE',
        write3d: 'WRITE3D',
        true: 'TRUE',
        false: 'FALSE',
        if: 'IF',
        elif: 'ELIF',
        else: 'ELSE',
        break: 'BREAK',
        continue: 'CONTINUE',
        return: 'RETURN',
        search: 'SEARCH'
    }

    while (i < src.length) {
        let ch = src[i]

        if (ch === ' ' || ch === '\t' || ch === '\r') { i++; col++; continue }
        if (ch === '\n') { i++; line++; col = 1; continue }

        const startLine = line
        const startCol = col

        // line comments
        if (ch === '/' && src[i + 1] === '/') {
            i += 2
            col += 2
            while (i < src.length && src[i] !== '\n') { i++; col++ }
            continue
        }

        // block comments
        if (ch === '/' && src[i + 1] === '*') {
            i += 2
            col += 2
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
                if (src[i] === '\n') { i++; line++; col = 1; continue }
                i++
                col++
            }
            if (i >= src.length) throw new SyntaxError(`Unterminated comment at line ${startLine} col ${startCol}`)
            i += 2
            col += 2
            continue
        }

        // output or source reference
        if ((ch === 'o' || ch === 's') && isDigit(src[i + 1])) {
            let j = i + 1
            while (j < src.length && isDigit(src[j])) j++
            const lexeme = src.slice(i, j)
            const tokenType = ch === 'o' ? 'OUTPUT_REF' : 'SOURCE_REF'
            add(tokenType, lexeme, startLine, startCol)
            col += j - i
            i = j
            continue
        }

        // volume reference (vol0-vol7)
        if (ch === 'v' && src[i + 1] === 'o' && src[i + 2] === 'l' && isDigit(src[i + 3])) {
            let j = i + 3
            while (j < src.length && isDigit(src[j])) j++
            const lexeme = src.slice(i, j)
            add('VOL_REF', lexeme, startLine, startCol)
            col += j - i
            i = j
            continue
        }

        // geometry reference (geo0-geo7)
        if (ch === 'g' && src[i + 1] === 'e' && src[i + 2] === 'o' && isDigit(src[i + 3])) {
            let j = i + 3
            while (j < src.length && isDigit(src[j])) j++
            const lexeme = src.slice(i, j)
            add('GEO_REF', lexeme, startLine, startCol)
            col += j - i
            i = j
            continue
        }

        // xyz reference (xyz0-xyz7) - agent position surfaces
        if (ch === 'x' && src[i + 1] === 'y' && src[i + 2] === 'z' && isDigit(src[i + 3])) {
            let j = i + 3
            while (j < src.length && isDigit(src[j])) j++
            const lexeme = src.slice(i, j)
            add('XYZ_REF', lexeme, startLine, startCol)
            col += j - i
            i = j
            continue
        }

        // vel reference (vel0-vel7) - agent velocity surfaces
        if (ch === 'v' && src[i + 1] === 'e' && src[i + 2] === 'l' && isDigit(src[i + 3])) {
            let j = i + 3
            while (j < src.length && isDigit(src[j])) j++
            const lexeme = src.slice(i, j)
            add('VEL_REF', lexeme, startLine, startCol)
            col += j - i
            i = j
            continue
        }

        // rgba reference (rgba0-rgba7) - agent color surfaces
        if (ch === 'r' && src[i + 1] === 'g' && src[i + 2] === 'b' && src[i + 3] === 'a' && isDigit(src[i + 4])) {
            let j = i + 4
            while (j < src.length && isDigit(src[j])) j++
            const lexeme = src.slice(i, j)
            add('RGBA_REF', lexeme, startLine, startCol)
            col += j - i
            i = j
            continue
        }

        // html hex color literal
        if (ch === '#') {
            let j = i + 1
            while (j < src.length && /[0-9a-fA-F]/.test(src[j])) j++
            const len = j - i
            if (len === 4 || len === 7 || len === 9) {
                const lexeme = src.slice(i, j)
                add('HEX', lexeme, startLine, startCol)
                col += len
                i = j
                continue
            }
        }

        // arrow function expression (() => expr)
        if (ch === '(' && src[i + 1] === ')') {
            let j = i + 2
            while (j < src.length && (src[j] === ' ' || src[j] === '\t')) j++
            if (src[j] === '=' && src[j + 1] === '>') {
                j += 2
                while (j < src.length && (src[j] === ' ' || src[j] === '\t')) j++
                let depth = 0
                const exprStart = j
                while (j < src.length) {
                    const c = src[j]
                    if (c === '(') depth++
                    else if (c === ')') {
                        if (depth === 0) break
                        depth--
                    } else if (depth === 0) {
                        if (c === ',' || c === ';' || c === '\n' || c === '}') break
                    }
                    j++
                }
                const expr = src.slice(exprStart, j).trim()
                add('FUNC', expr, startLine, startCol)
                col += j - i
                i = j
                continue
            }
        }

        if (ch === '.' && isDigit(src[i + 1])) {
            let j = i + 1
            while (j < src.length && isDigit(src[j])) j++
            const lexeme = src.slice(i, j)
            add('NUMBER', lexeme, startLine, startCol)
            col += j - i
            i = j
            continue
        }
        if (ch === '.') { add('DOT', '.', startLine, startCol); i++; col++; continue }
        if (ch === '(') { add('LPAREN', '(', startLine, startCol); i++; col++; continue }
        if (ch === ')') { add('RPAREN', ')', startLine, startCol); i++; col++; continue }
        if (ch === '{') { add('LBRACE', '{', startLine, startCol); i++; col++; continue }
        if (ch === '}') { add('RBRACE', '}', startLine, startCol); i++; col++; continue }
        if (ch === ',') { add('COMMA', ',', startLine, startCol); i++; col++; continue }
        if (ch === ':') { add('COLON', ':', startLine, startCol); i++; col++; continue }
        if (ch === '=') { add('EQUAL', '=', startLine, startCol); i++; col++; continue }
        if (ch === ';') { add('SEMICOLON', ';', startLine, startCol); i++; col++; continue }
        if (ch === '+') { add('PLUS', '+', startLine, startCol); i++; col++; continue }
        if (ch === '-') { add('MINUS', '-', startLine, startCol); i++; col++; continue }
        if (ch === '*') { add('STAR', '*', startLine, startCol); i++; col++; continue }
        if (ch === '/') { add('SLASH', '/', startLine, startCol); i++; col++; continue }

        if (ch === '"' || ch === '\'') {
            const quote = ch
            let j = i + 1
            while (j < src.length && src[j] !== quote && src[j] !== '\n') {
                // Handle escape sequences
                if (src[j] === '\\' && j + 1 < src.length) {
                    j += 2
                } else {
                    j++
                }
            }
            if (j >= src.length || src[j] === '\n') {
                throw new SyntaxError(`Unterminated string literal at line ${line} col ${col}`)
            }
            // Extract string content without quotes
            const content = src.slice(i + 1, j)
            add('STRING', content, startLine, startCol)
            col += j - i + 1
            i = j + 1
            continue
        }

        if (isDigit(ch)) {
            let j = i
            while (j < src.length && isDigit(src[j])) j++
            if (src[j] === '.' && isDigit(src[j + 1])) {
                j++
                while (j < src.length && isDigit(src[j])) j++
            }
            const lexeme = src.slice(i, j)
            add('NUMBER', lexeme, startLine, startCol)
            col += j - i
            i = j
            continue
        }

        if (isLetter(ch) || ch === '_') {
            let j = i
            while (j < src.length && (isLetter(src[j]) || isDigit(src[j]) || src[j] === '_')) j++
            const lexeme = src.slice(i, j)
            if (keywords[lexeme]) {
                add(keywords[lexeme], lexeme, startLine, startCol)
            } else {
                add('IDENT', lexeme, startLine, startCol)
            }
            col += j - i
            i = j
            continue
        }

        throw new SyntaxError(`Unexpected character '${ch}' at line ${line} col ${col}`)
    }

    add('EOF', '', line, col)
    return tokens
}
