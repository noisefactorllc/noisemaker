# Noisemaker Preset DSL Specification

This document describes a domain‑specific language (DSL) for declaring
Noisemaker presets in the JavaScript demo.  The DSL allows users to edit and
evaluate preset formulas inside a `<textarea>` without executing arbitrary
JavaScript.  Programs are parsed into an abstract syntax tree (AST) and
evaluated against a whitelist of operations and surfaces.

When behaviour is unspecified, refer to the Python implementation for
clarification.

## 1. Goals

* Enable interactive editing of presets in `demo.html` via a form
  `<textarea>`.
* Provide an evaluation environment that mirrors the current preset
  declarations while preventing arbitrary code execution.
* Offer clear diagnostics with source spans for syntax and runtime problems.
* Maintain feature parity with the Python preset DSL where feasible.

## 2. Execution Model

1. **Tokenize** – convert the source string to a stream of tokens.
2. **Parse** – build an AST according to the grammar below.
3. **Evaluate** – execute the AST against the preset context and return its
   value.  For `share/dsl/presets.dsl` the value is an object of named
   presets.  Boolean literals evaluate to `true` and `false`.

There is no separate validation stage.  The evaluator never invokes `eval` or
`Function`.  A call runs a function only when its callee resolves to one in
the evaluation context: an `operations` entry, an `enumMethods` entry, or a
function-valued member of an enum or surface.  A call to any other plain name
returns an effect descriptor `{ op, args, input }`.  A member call whose callee
is not a function throws `Unsupported callee`.  Each stage reports an error by
throwing an exception (see Diagnostics).

## 3. Grammar

Extended EBNF describing the language.  It follows the Python reference
parser, `noisemaker/dsl/parser.py`:

```ebnf
Program        ::= Dict | Expr                  (* followed by end of input *)
Expr           ::= String | Color | Conditional
Conditional    ::= Comparison ( 'if' Conditional 'else' Conditional
                              | '?' Conditional ':' Conditional )?
Comparison     ::= Additive ( ( '<' | '>' ) Additive )*
Additive       ::= Multiplicative ( ( '+' | '-' ) Multiplicative )*
Multiplicative ::= Unary ( ( '*' | '/' ) Unary )*
Unary          ::= ( '+' | '-' ) Unary | Primary
Primary        ::= Number | Boolean | Null | 'Math.PI'
                 | '(' Conditional ')' | List | Dict
                 | CallChain | MemberCall | Member | Ident
CallChain      ::= Call ( '.' Call )*
Call           ::= Ident '(' ArgList ')'
MemberCall     ::= Member '(' ArgList ')' ( '.' Call )*
Member         ::= Ident ( '.' Ident )+
ArgList        ::= ( Arg ( ',' Arg )* ','? )?
Arg            ::= Ident ( ':' | '=' ) Expr | Expr
List           ::= '[' ( Expr ( ',' Expr )* ','? )? ']'
Dict           ::= '{' ( DictEntry ( ',' DictEntry )* ','? )? '}'
DictEntry      ::= ( String | Ident ) ':' Expr
Ident          ::= ( Letter | '_' ) ( Letter | Digit | '_' )*
Number         ::= Digit+ ( '.' Digit* )? | '.' Digit+
String         ::= '"' ( Escape | [^"\\\n] )* '"'
                 | "'" ( Escape | [^'\\\n] )* "'"
Escape         ::= '\' AnyChar
Digit          ::= '0'…'9'
Letter         ::= 'A'…'Z' | 'a'…'z'
Boolean        ::= 'true' | 'false'
Null           ::= 'null'
Color          ::= '#' HexDigit{3} | '#' HexDigit{6}
HexDigit       ::= Digit | 'A'…'F' | 'a'…'f'
```

* `true`, `false` and `null` are not identifiers.  `if` and `else` are
  ordinary identifiers that the conditional form reads by name.
* `b if a else c` and `a ? b : c` are the same conditional.  `<=`, `>=` and
  `==` do not exist.
* A named argument uses `:` or `=`.  One call uses only positional or only
  named arguments.  A repeated argument name is an error.
* `\n`, `\r`, `\t`, `\\`, `\"` and `\'` in a string are decoded.  Any other
  escaped character stands for itself.
* A number can start with `.`: `.5` reads as `0.5` and `.025` reads as
  `0.025`.  `1.` reads as `1`.  There is no exponent form, so `1e3` is a parser
  error.
* Trailing commas in lists, dictionaries and argument lists are allowed.  A
  repeated dictionary key is an error.
* `parse()` checks top-level dictionary keys by default and accepts only
  `layers`, `settings`, `generator`, `octaves`, `post`, `final` and `unique`.
  `parse_preset_dsl()` and `parsePresetDSL()` turn the check off, because the
  top-level keys of `share/dsl/presets.dsl` are preset names.
* An `Ident` resolves, in order, to an operation, a surface or an enum of the
  context.  Any other `Ident` evaluates to its own name as a string.  The enums
  are the exports of `constants.js` (Python: `noisemaker.constants`) and
  `PALETTES`.  `EnumType.Member` evaluates to the member value, for example
  `ColorSpace.rgb`.
* The JavaScript parser also accepts `String` and `Color` in `Primary`.  It
  therefore accepts a string or a color as an operand, inside parentheses or
  as a conditional branch, for example `true ? "a" : "b"`.  The Python parser
  rejects these with `Unexpected token`.  `share/dsl/presets.dsl` does not use
  them.
* Whitespace and comments are skipped between tokens.  The lexer recognises
  `//` single-line comments that run until the newline and `/* … */` block
  comments.  Block comments must be terminated before the end of the file;
  otherwise tokenisation fails with an "Unterminated multi-line comment"
  error.

## 4. Data Types

| Type        | Description |
|-------------|-------------|
| `Number`    | Supports inline arithmetic, `<` and `>` comparisons, conditionals, function/method results, and the `Math.PI` constant. |
| `String`    | Single‑ or double‑quoted strings with backslash escapes.  A string cannot contain a newline. |
| `Boolean`   | Keywords `true` and `false`.  They evaluate to booleans, which arithmetic treats as `1` and `0`. |
| `Null`      | Keyword `null`. |
| `Color`     | Hex colours `#RGB` or `#RRGGBB`.  A colour evaluates to its hex text as a string. |
| `Surface`   | `settings.<key>` evaluates to a function that reads `<key>` from the settings it receives. |
| `List`      | Ordered collection of `Expr` values. |
| `Dict`      | Mapping of string or identifier keys to `Expr` values. |
| `Enum`      | Enum access via `EnumType.Member` syntax. |

## 5. Functions and Arguments

Functions accept arguments **either** positionally **or** as named keywords;
mixing the two forms in a single call is a parser error.  Example:

```dsl
example(10, 0.1, 1)
example(foo: 10, bar: 0.1, baz: 1)
example(foo=10, bar=0.1, baz=1)
```

Identifiers resolve as section 3 describes.  An unknown identifier evaluates to
its own name and gives no error.  A call to a name that is not an operation
returns an effect descriptor and gives no error.  No stage clamps or checks
argument ranges.  Built-in operations raise an error when their argument count
or argument type is wrong.  Random operations such as `random_int(a, b)` are
deferred, so their error comes when the preset value is resolved, not when the
DSL is evaluated.

### Naming Conventions

* Preset names use **kebab-case**.
* Preset setting keys use **snake_case**.
* Function wrappers and argument keys use **snake_case**.
* Enum wrapper members use **snake_case**.
* Underlying implementations:
  * Python enums and functions use `snake_case`.
  * JavaScript enums and functions use `camelCase`.

## 6. Diagnostics

Each stage throws an exception at the first error.  The preset DSL has no
diagnostic codes and no source spans, and it does not report warnings.

| Stage     | Python exception | JavaScript exception | Messages |
|-----------|------------------|----------------------|----------|
| Tokenizer | `TokenizerError` with `line` and `column` attributes | `Error` with `line` and `column` properties | `Unexpected character '<c>'`, `Unterminated string literal`, `Unterminated multi-line comment`, `Invalid color`.  Each message ends with ` at line N column M`. |
| Parser    | `ValueError` | `Error` | `Unexpected token: <value> (line N, column M)`, `Unexpected token: EOF`, `Cannot mix positional and named arguments`, `Duplicate argument: <name>`, `Duplicate key: <key>`, `Unknown key: <key>` |
| Evaluator | `ValueError` | `Error` | `Unsupported callee`, `Unknown operator <op>`, `Unsupported node type: <type>`, and the argument errors of built-in operations |

Parser errors carry the line and column only in the message text.  In an
`Unexpected token` message, Python writes a number token as a float (`2.0`)
and JavaScript writes it as `2`.

## 7. Built‑In Variables and Enums

The preset context exposes read‑only surfaces and constants:

* Surfaces: `settings`.  `settings.<key>` reads a preset setting.
* Outputs: none.  `o1` is an ordinary identifier, and `.out(o1)` is an
  ordinary call that no operation implements.
* Enumerations mirroring the Python `noisemaker.constants` module are
  available via the `EnumType.Member` syntax.

## 8. Integration with the JavaScript Demo

The JavaScript demo (`demo/js/index.html`) displays the DSL source and evaluated preset in two read-only
`<pre>` elements with tab switching:

1. `<pre id="presetFormula">` shows the raw DSL source for the active preset.
2. `<pre id="presetEvaluated">` shows the evaluated preset structure.
3. A tabbed UI toggles visibility between the two views.
4. The evaluation happens inside the browser without invoking `eval` or
   executing user supplied JavaScript.

## 9. Security Considerations

* Only whitelisted operations and enums are accessible.
* The evaluator has no access to global scope or DOM APIs beyond rendering
  surfaces.
* Parsing failure or runtime errors do not crash the page; diagnostics are
  reported and evaluation aborted.

## 10. Future Work

* Additional data structures may be added as presets evolve.
* Consider syntax highlighting and autocomplete within the textarea.
* Validation rules should mirror those in the Python reference implementation.

