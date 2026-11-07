; The code facts query of Swift (ADR 0046), written against
; @lumis-sh/wasm-swift 0.26.3 (tree-sitter-swift 0.7.3). The adapter
; (swift-adapter.ts) reads each capture by its name. Definitions are read by
; walking the declarations of the tree (swift-definitions.ts), and the targets
; of `Package.swift` by walking its calls (swift-package.ts).
;
; @binding     a name written where it is bound, so it is not a use: a declared
;              name, a parameter, a pattern.
; @label       an argument label, which is neither a use nor bound.
; @reference   a use of a name; a name after `.` is spelled with its chain.
; @environment the name of an environment value:
;              `ProcessInfo.processInfo.environment["NAME"]`, `getenv("NAME")`.
; @event       the name of a notification: `Notification.Name("NAME")`.
; @import      an import declaration.
; @type        code where every name is a type: a named type, a generic
;              constraint, an inheritance clause.
; @runtime     code where a type name runs: an attribute, such as a property
;              wrapper.
; @skip        code where no name is a use: imports, compiler directives and
;              the member a leading `.` names, whose type only the context says.
; @unparsed    code that did not parse.

; ── Names written where they are bound, never a use ─────────────────────────
(_ bound_identifier: (simple_identifier) @binding)
(pattern (simple_identifier) @binding)
(parameter name: (simple_identifier) @binding)
(parameter external_name: (simple_identifier) @label)
(lambda_parameter name: (simple_identifier) @binding)
(value_argument_label (simple_identifier) @label)
(type_parameter (type_identifier) @binding)
(enum_entry name: (simple_identifier) @binding)
(function_declaration name: (simple_identifier) @binding)
(protocol_function_declaration name: (simple_identifier) @binding)
(class_declaration name: (type_identifier) @binding)
(protocol_declaration name: (type_identifier) @binding)
(typealias_declaration name: (type_identifier) @binding)
(associatedtype_declaration name: (type_identifier) @binding)
(macro_declaration (simple_identifier) @binding)

; ── Uses ────────────────────────────────────────────────────────────────────
(simple_identifier) @reference
(type_identifier) @reference

(call_expression
  (navigation_expression
    target: (navigation_expression
      target: (simple_identifier) @_process
      suffix: (navigation_suffix suffix: (simple_identifier) @_info))
    suffix: (navigation_suffix suffix: (simple_identifier) @_environment))
  (call_suffix
    (value_arguments . (value_argument value: (line_string_literal text: (line_str_text) @environment))))
  (#eq? @_process "ProcessInfo")
  (#eq? @_info "processInfo")
  (#eq? @_environment "environment"))
(call_expression
  (simple_identifier) @_getenv
  (call_suffix
    (value_arguments . (value_argument value: (line_string_literal text: (line_str_text) @environment))))
  (#eq? @_getenv "getenv"))

(call_expression
  (navigation_expression
    target: (simple_identifier) @_notification
    suffix: (navigation_suffix suffix: (simple_identifier) @_name))
  (call_suffix
    (value_arguments . (value_argument value: (line_string_literal text: (line_str_text) @event))))
  (#eq? @_notification "Notification")
  (#eq? @_name "Name"))

; ── Imports ─────────────────────────────────────────────────────────────────
(import_declaration) @import

; ── Where names are types, run, or are not uses ─────────────────────────────
(user_type) @type
(type_constraints) @type
(inheritance_specifier) @type
(attribute) @runtime

(import_declaration) @skip
(directive) @skip
; `!ready`, `-offset` and `&buffer` use their name.
(prefix_expression operation: "." target: (simple_identifier) @skip)

(ERROR) @unparsed
