; The code facts query of Go (ADR 0046, TASK-575), written against
; tree-sitter-go 0.25.0. The adapter (go-adapter.ts) reads each capture by its
; name. Definitions are read by walking the declarations at file level
; (go-definitions.ts).
;
; @binding     a name written where it is bound, so it is not a use: a
;              parameter, a receiver, a local, a type parameter.
; @label       a key of a composite literal, which names a field.
; @reference   a use of a name; a name after `.` is spelled with its chain.
; @environment the name of an environment value: `os.Getenv("NAME")`,
;              `os.LookupEnv("NAME")`.
; @import      an import spec.
; @type        code where every name is a type.
; @runtime     code where a type name runs: the type of a composite literal,
;              which constructs a value.
; @skip        code where no name is a use: the package clause and imports.
; @unparsed    code that did not parse.

; ── Names written where they are bound, never a use ─────────────────────────
(parameter_declaration name: (identifier) @binding)
(variadic_parameter_declaration name: (identifier) @binding)
(type_parameter_declaration name: (identifier) @binding)
(short_var_declaration left: (expression_list (identifier) @binding))
(range_clause left: (expression_list (identifier) @binding))
(receive_statement left: (expression_list (identifier) @binding))
(type_switch_statement alias: (expression_list (identifier) @binding))
(var_spec name: (identifier) @binding)
(const_spec name: (identifier) @binding)
(function_declaration name: (identifier) @binding)
(type_spec name: (type_identifier) @binding)
(type_alias name: (type_identifier) @binding)
(keyed_element key: (literal_element (identifier) @label))

; ── Uses ────────────────────────────────────────────────────────────────────
(identifier) @reference
(type_identifier) @reference
(qualified_type package: (package_identifier) @reference)
(selector_expression field: (field_identifier) @reference)

(call_expression
  function: (selector_expression
    operand: (identifier) @_os
    field: (field_identifier) @_getenv)
  arguments: (argument_list . (interpreted_string_literal (interpreted_string_literal_content) @environment))
  (#eq? @_os "os")
  (#any-of? @_getenv "Getenv" "LookupEnv"))

; ── Imports ─────────────────────────────────────────────────────────────────
(import_spec) @import

; ── Where names are types, run, or are not uses ─────────────────────────────
(type_identifier) @type
(qualified_type) @type
(composite_literal type: (_) @runtime)

(package_clause) @skip
(import_declaration) @skip

(ERROR) @unparsed
