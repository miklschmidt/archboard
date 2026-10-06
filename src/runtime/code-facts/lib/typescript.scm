; The code facts query of TypeScript and TSX (ADR 0046), written against
; tree-sitter-typescript 0.23.2. Both grammars compile it, so it names no JSX
; node. The adapter (typescript-adapter.ts) reads each capture by its name.
;
; @definition  the name of a declaration. The adapter keeps it only at module
;              level or as a member of what is declared there, qualifies a
;              member with the names that hold it, and reads its visibility.
; @binding     a name that a declaration or a pattern binds, so it is not a use.
; @reference   a use of a name, @reference.property one through `.`.
; @environment the name of an environment value: `x.env.NAME`, `x.env["NAME"]`.
; @event       the name of an event: the first string argument of a listener
;              or an emitter call, or of a constructed event.
; @import      an import or a re-export; @import.dynamic `import()` or `require()`.
; @export.name a local name an `export { ... }` without a source exports.
; @export.default a local name `export default <name>` exports.
; @type        code where every name is a type.
; @skip        code where no name is a use: the clauses of imports and re-exports.
; @unparsed    code that did not parse.

; ── Definitions ─────────────────────────────────────────────────────────────
(function_declaration name: (identifier) @definition)
(generator_function_declaration name: (identifier) @definition)
(function_signature name: (identifier) @definition)
(class_declaration name: (type_identifier) @definition)
(abstract_class_declaration name: (type_identifier) @definition)
(interface_declaration name: (type_identifier) @definition)
(type_alias_declaration name: (type_identifier) @definition)
(enum_declaration name: (identifier) @definition)
(internal_module name: (identifier) @definition)
(variable_declarator name: (identifier) @definition)
(variable_declarator name: (object_pattern (shorthand_property_identifier_pattern) @definition))
(variable_declarator name: (object_pattern (pair_pattern value: (identifier) @definition)))
(variable_declarator name: (array_pattern (identifier) @definition))
(method_definition name: [(property_identifier) (private_property_identifier)] @definition)
(method_signature name: (property_identifier) @definition)
(abstract_method_signature name: (property_identifier) @definition)
(public_field_definition name: [(property_identifier) (private_property_identifier)] @definition)
(property_signature name: (property_identifier) @definition)
(enum_body (property_identifier) @definition)
(enum_assignment name: (property_identifier) @definition)
(pair key: (property_identifier) @definition)
(object (shorthand_property_identifier) @definition)

; ── Names bound where they are written, never a use ─────────────────────────
(required_parameter pattern: (identifier) @binding)
(optional_parameter pattern: (identifier) @binding)
(arrow_function parameter: (identifier) @binding)
(catch_clause parameter: (identifier) @binding)
(function_expression name: (identifier) @binding)
(class name: (type_identifier) @binding)
(type_parameter name: (type_identifier) @binding)
(pair_pattern value: (identifier) @binding)
(array_pattern (identifier) @binding)
(rest_pattern (identifier) @binding)
(assignment_pattern left: (identifier) @binding)
(for_in_statement left: (identifier) @binding)

; ── Uses ────────────────────────────────────────────────────────────────────
(identifier) @reference
(type_identifier) @reference
(shorthand_property_identifier) @reference
(member_expression property: (property_identifier) @reference.property)

(member_expression
  object: (member_expression property: (property_identifier) @_env)
  property: (property_identifier) @environment
  (#eq? @_env "env"))
(subscript_expression
  object: (member_expression property: (property_identifier) @_env)
  index: (string (string_fragment) @environment)
  (#eq? @_env "env"))

(call_expression
  function: (member_expression property: (property_identifier) @_listen)
  arguments: (arguments . (string (string_fragment) @event))
  (#match? @_listen "^(on|once|off|emit|addListener|removeListener|prependListener|prependOnceListener|addEventListener|removeEventListener)$"))
(new_expression
  constructor: (identifier) @_event
  arguments: (arguments . (string (string_fragment) @event))
  (#match? @_event "^(Event|CustomEvent|MessageEvent)$"))

; ── Imports and exports ─────────────────────────────────────────────────────
(import_statement source: (string)) @import
(export_statement source: (string)) @import
(call_expression
  function: (import)
  arguments: (arguments . (string (string_fragment) @import.dynamic)))
(call_expression
  function: (identifier) @_require
  arguments: (arguments . (string (string_fragment) @import.dynamic))
  (#eq? @_require "require"))

(export_statement !source (export_clause (export_specifier name: (identifier) @export.name)))
(export_statement value: (identifier) @export.default)

; ── Where names are types, or not uses ──────────────────────────────────────
[
  (type_annotation)
  (type_arguments)
  (type_parameters)
  (type_query)
  (nested_type_identifier)
  (implements_clause)
  (extends_type_clause)
  (type_alias_declaration)
  (interface_declaration)
  (generic_type)
  (object_type)
] @type
(export_statement "type") @type

(import_statement) @skip
(export_statement source: (string)) @skip

(ERROR) @unparsed
