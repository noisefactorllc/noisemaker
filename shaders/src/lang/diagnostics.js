/**
 * Diagnostic codes and default messages for the Live Coding DSL.
 * This list is a clean-room description of user-facing behavior.
 */
const diagnostics = {
  L001: { stage: 'lexer', severity: 'error', message: 'Unexpected character' },
  L002: { stage: 'lexer', severity: 'error', message: 'Unterminated string literal' },
  P001: { stage: 'parser', severity: 'error', message: 'Unexpected token' },
  P002: { stage: 'parser', severity: 'error', message: 'Expected closing parenthesis' },
  S001: { stage: 'semantic', severity: 'error', message: 'Unknown identifier' },
  S002: { stage: 'semantic', severity: 'warning', message: 'Argument out of range' },
  S003: { stage: 'semantic', severity: 'error', message: 'Variable used before assignment' },
  S004: { stage: 'semantic', severity: 'error', message: 'Cannot assign null or undefined' },
  S005: { stage: 'semantic', severity: 'error', message: 'Illegal chain structure' },
  S006: { stage: 'semantic', severity: 'error', message: 'Starter chain missing write() call' },
  S007: { stage: 'semantic', severity: 'warning', message: 'Deprecated parameter alias' },
  R001: { stage: 'runtime', severity: 'error', message: 'Runtime error' }
}

export default diagnostics
