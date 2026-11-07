; The code facts query of Rust (ADR 0046), written against tree-sitter-rust
; 0.24.0. The adapter (rust-adapter.ts) reads each capture by its name.
; Definitions are read by walking the items of the tree (rust-definitions.ts),
; and imports by walking each `use` tree and `mod` declaration
; (rust-imports.ts).
;
; @binding     a name written where it is bound, so it is not a use: a declared
;              name, a parameter, a pattern's binding, a generic parameter.
; @declared    the name of an item, which is bound but no narrower than its file.
; @matched     a name in a pattern that matches a value, as `Some` does in
;              `Some(x)`: a use, though it stands where a binding can.
; @reference   a use of a name; a name in a path is read with its whole path.
; @member      a field or method a value reaches through `.`.
; @tokens      the tokens a macro is called with, read as names (rust-tokens.ts).
; @import     a `use`, `mod name;` or `extern crate` declaration.
; @environment the name of an environment value: `env::var("NAME")`,
;              `env::var_os("NAME")`, `env!("NAME")`, `option_env!("NAME")`.
; @type        code where every name is a type: an annotation, a return type,
;              a bound, a generic argument, the trait an `impl` implements.
; @skip        code where no name is a use: `use` and `mod` declarations,
;              attributes, macro definitions, visibility paths and the type an
;              `impl` block adds to.
; @unparsed    code that did not parse.

; ── Names written where they are bound, never a use ─────────────────────────
(let_declaration pattern: (identifier) @binding)
(parameter pattern: (identifier) @binding)
(closure_parameters (identifier) @binding)
(for_expression pattern: (identifier) @binding)
(let_condition pattern: (identifier) @binding)
(match_pattern (identifier) @binding)
(captured_pattern (identifier) @binding)
(mut_pattern (identifier) @binding)
(ref_pattern (identifier) @binding)
(reference_pattern (identifier) @binding)
(or_pattern (identifier) @binding)
(slice_pattern (identifier) @binding)
(tuple_pattern (identifier) @binding)
(tuple_struct_pattern (identifier) @binding)
(field_pattern pattern: (identifier) @binding)
(type_parameter name: (type_identifier) @binding)
(tuple_struct_pattern type: (_) @matched)
(struct_pattern type: (_) @matched)

(function_item name: (identifier) @declared)
(function_signature_item name: (identifier) @declared)
(const_item name: (identifier) @declared)
(static_item name: (identifier) @declared)
(enum_variant name: (identifier) @declared)
(struct_item name: (type_identifier) @declared)
(enum_item name: (type_identifier) @declared)
(union_item name: (type_identifier) @declared)
(trait_item name: (type_identifier) @declared)
(type_item name: (type_identifier) @declared)
(associated_type name: (type_identifier) @declared)

; ── Uses ────────────────────────────────────────────────────────────────────
(identifier) @reference
(type_identifier) @reference
(field_expression field: (field_identifier) @member)
(macro_invocation (token_tree) @tokens)

(call_expression
  function: (scoped_identifier
    path: [(identifier) @_env (scoped_identifier name: (identifier) @_env)]
    name: (identifier) @_var)
  arguments: (arguments . (string_literal (string_content) @environment))
  (#eq? @_env "env")
  (#match? @_var "^var(_os)?$"))
(macro_invocation
  macro: (identifier) @_macro
  (token_tree . (string_literal (string_content) @environment))
  (#match? @_macro "^(option_)?env$"))

; ── Imports ─────────────────────────────────────────────────────────────────
(use_declaration) @import
(mod_item !body) @import
(extern_crate_declaration) @import

; ── Where names are types, or are not uses ──────────────────────────────────
(let_declaration type: (_) @type)
(parameter type: (_) @type)
(field_declaration type: (_) @type)
(ordered_field_declaration_list type: (_) @type)
(const_item type: (_) @type)
(static_item type: (_) @type)
(function_item return_type: (_) @type)
(function_signature_item return_type: (_) @type)
(closure_expression return_type: (_) @type)
(type_item type: (_) @type)
(type_cast_expression type: (_) @type)
(type_parameter default_type: (_) @type)
(impl_item trait: (_) @type)
(function_type) @type
(type_arguments) @type
(trait_bounds) @type
(where_clause) @type
(qualified_type) @type

(use_declaration) @skip
(mod_item name: (identifier) @skip)
(extern_crate_declaration) @skip
(attribute_item) @skip
(inner_attribute_item) @skip
(macro_definition) @skip
(visibility_modifier) @skip
(impl_item type: (_) @skip)

(ERROR) @unparsed
