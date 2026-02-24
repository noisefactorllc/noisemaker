# Design: Round-trip `let` Statements Through Compile/Unparse

**Date:** 2026-02-24

## Problem

The compiler parses `let` declarations and stores them in `compiled.vars`, but `substitute()` fully inlines variable values into `compiled.plans` (no trace of variable names remains), and `unparse()` ignores `compiled.vars` entirely. After a compile/unparse round-trip, all let bindings and variable references are destroyed.

This blocks Noisedeck's UI for managing automation sources as named let-bound variables, since `dslMutator` relies on compile/unparse for structural mutations.

## Approach: Annotate During Substitution

Two files change: `validator.js` and `unparser.js`.

### 1. Validator — `_varRef` markers

In `substitute()`, when an `Ident` node is replaced with its symbol value, tag the cloned result with `_varRef: variableName`. The substituted value still works exactly as before for execution — `_varRef` is metadata for the unparser.

### 2. Unparser — emit let declarations + honor `_varRef`

**Emit let declarations** from `compiled.vars` between the `search` directive and the first chain. Each var's expression is formatted back to DSL via a new `formatLetExpr()` that dispatches to existing formatters (`formatValue` for literals/automation nodes, `unparseCall` for calls, `unparseChain` for chains).

**Variable references in parameters** are already handled: `formatValue()` (line 168) checks for `_varRef` and returns the variable name. No change needed — just needs the markers to be set.

### Round-trip example

Input:
```
let wobble = osc(type: oscKind.sine, min: 0, max: 360)
noise(rotation: wobble).write(o0)
```

After compile: `compiled.vars` has the VarAssign node; `rotation` param value has `_varRef: 'wobble'`.

After unparse: `formatLetExpr` reconstructs the osc() call; `formatValue` on rotation returns `wobble`.

### Edge cases

- Chained let refs (`let b = a`) — substitute is recursive, markers propagate
- Non-automation lets (`let pattern = noise(scale: 3)`) — formatLetExpr dispatches Call to unparseCall
- Comments on let statements — preserved via leadingComments
- Unused let vars — still emitted
- Primitive values — formatValue handles Number/String/Boolean nodes

### What does NOT change

- Runtime behavior (`_varRef` ignored by renderer)
- `transform.js` (transparent to `_varRef` properties)
- Parser (already correct)
- `dslMutator` (benefits automatically)
