; The code facts query of Objective-C (ADR 0046, TASK-367.10), written against
; tree-sitter-objc 3.0.2. Its captures are the C query's (c.scm), which the C
; adapter reads (c-adapter.ts), and four of Objective-C's own, which the
; Objective-C adapter reads (objc-adapter.ts).
;
; @name        every name, as in C.
; @import      an `#include` or `#import`.
; @module      an `@import`.
; @environment the name of an environment value, as in C.
; @function    a function or a method, whose parameters and locals are its own.
; @send        a message send.
; @selector    an `@selector(...)`.
; @protocol    a protocol a protocol adopts, which only a type uses.
; @skip        code whose names are no use: an attribute, a condition of
;              `#if`, and each Objective-C name that a definition or a send
;              stands for: a selector's parts, a class's and a category's
;              name, a property's or an instance variable's name, a forward
;              declaration, `self`, `super` and `_cmd`.
; @unparsed    code that did not parse.

(identifier) @name
(type_identifier) @name
(field_identifier) @name

(preproc_include) @import
(module_import) @module @skip

(call_expression
  function: (_) @_getenv
  arguments: (argument_list . (string_literal (string_content) @environment))
  (#match? @_getenv "^(std::)?(secure_)?getenv$"))

(function_definition) @function
(method_definition) @function

(message_expression) @send
(message_expression method: (identifier) @skip)
(selector_expression) @selector @skip
(protocol_reference_list (identifier) @protocol @skip)

(method_declaration (identifier) @skip)
(method_definition (identifier) @skip)
(keyword_declarator) @skip
(class_interface . (identifier) @skip)
(class_interface category: (identifier) @skip)
(class_implementation . (identifier) @skip)
(class_implementation category: (identifier) @skip)
(class_implementation superclass: (identifier) @skip)
(protocol_declaration . (identifier) @skip)
(class_declaration) @skip
(protocol_forward_declaration) @skip
(struct_declarator) @skip
(property_attributes_declaration) @skip
(property_implementation) @skip
(availability_attribute_specifier) @skip
(available_expression) @skip
((identifier) @skip (#any-of? @skip "self" "super" "_cmd"))
((type_identifier) @skip (#any-of? @skip "id" "instancetype"))

(attribute_specifier) @skip
(attribute_declaration) @skip
(ms_declspec_modifier) @skip
(preproc_if condition: (_) @skip)
(preproc_elif condition: (_) @skip)

(ERROR) @unparsed
