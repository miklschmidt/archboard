; The code facts query of C and C++ (ADR 0046), written against
; tree-sitter-c 0.24.1 and tree-sitter-cpp 0.23.4. It names only nodes both
; grammars have, so the one query compiles under each. The adapter
; (c-adapter.ts) reads each capture by its name, and walks the tree for what
; only C++ has: namespaces, classes and names qualified with `::`.
;
; @name        every name: an identifier, a type name or a field name. The
;              adapter decides whether it is a definition, a name declared
;              where it is bound, or a use.
; @import      an `#include`.
; @environment the name of an environment value: the first string argument
;              of `getenv`, `secure_getenv` or `std::getenv`.
; @function    a function, whose parameters and locals are its own.
; @skip        code whose names are no use: an attribute, and the condition
;              of `#if` or `#elif`.
; @unparsed    code that did not parse.
; @logic       one piece of logic: a call, an operator, a condition or a loop.
;              C++ adds its own in cpp.scm.

(identifier) @name
(type_identifier) @name
(field_identifier) @name

(preproc_include) @import

(call_expression
  function: (_) @_getenv
  arguments: (argument_list . (string_literal (string_content) @environment))
  (#match? @_getenv "^(std::)?(secure_)?getenv$"))

(function_definition) @function

(attribute_specifier) @skip
(attribute_declaration) @skip
(ms_declspec_modifier) @skip
(preproc_if condition: (_) @skip)
(preproc_elif condition: (_) @skip)

; ── Pieces of logic ─────────────────────────────────────────────────────────
[
  (call_expression)
  (binary_expression)
  (unary_expression)
  (update_expression)
  (conditional_expression)
  (if_statement)
  (case_statement)
  (for_statement)
  (while_statement)
  (do_statement)
] @logic
(assignment_expression
  operator: ["+=" "-=" "*=" "/=" "%=" "&=" "|=" "^=" "<<=" ">>="]) @logic

(ERROR) @unparsed
