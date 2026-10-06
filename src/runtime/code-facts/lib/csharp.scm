; The code facts query of C# (ADR 0046), written against tree-sitter-c-sharp
; 0.23.5. The adapter (csharp-adapter.ts) reads each capture by its name; what
; a file declares, it reads by walking the declarations (csharp-definitions.ts).
;
; @binding      a name written where it is declared or bound, so it is not a
;               use: a type, a member, a parameter, a local, a pattern
;               variable, a range variable, a named argument, a member set in
;               an object or anonymous initializer, a label.
; @reference    a use of a name; a name after `.` is spelled with its chain.
; @type         code where every name is a type: a declared type, a type
;               argument, a cast, `as`, a pattern, a constraint, the argument
;               of `nameof`.
; @typename     a type the code uses at run time: what `new` constructs, an
;               attribute, the type `typeof` names.
; @base         a base list, whose entries the adapter sorts into a base class,
;               a use at run time, and interfaces, which are types.
; @using        a using directive: a namespace, a type with `static`, or an alias.
; @environment  the name of an environment value:
;               `Environment.GetEnvironmentVariable("NAME")`.
; @friend       the assembly `[assembly: InternalsVisibleTo("Name")]` names.
; @skip         code where no name is a use: using directives, namespace names,
;               the members a property pattern names, preprocessor conditions.
; @unparsed     code that did not parse.

; ── Names written where they are declared or bound, never a use ─────────────
(class_declaration name: (identifier) @binding)
(struct_declaration name: (identifier) @binding)
(interface_declaration name: (identifier) @binding)
(enum_declaration name: (identifier) @binding)
(record_declaration name: (identifier) @binding)
(delegate_declaration name: (identifier) @binding)
(enum_member_declaration name: (identifier) @binding)
(method_declaration name: (identifier) @binding)
(constructor_declaration name: (identifier) @binding)
(destructor_declaration name: (identifier) @binding)
(property_declaration name: (identifier) @binding)
(event_declaration name: (identifier) @binding)
(local_function_statement name: (identifier) @binding)
(variable_declarator name: (identifier) @binding)
(type_parameter name: (identifier) @binding)
(type_parameter_constraints_clause . (identifier) @binding)
(parameter name: (identifier) @binding)
(catch_declaration name: (identifier) @binding)
(declaration_expression name: (identifier) @binding)
(declaration_pattern name: (identifier) @binding)
(recursive_pattern name: (identifier) @binding)
(var_pattern name: (identifier) @binding)
(list_pattern name: (identifier) @binding)
(tuple_pattern name: (identifier) @binding)
(parenthesized_variable_designation name: (identifier) @binding)
(tuple_element name: (identifier) @binding)
(foreach_statement left: (identifier) @binding)
(from_clause name: (identifier) @binding)
(let_clause . (identifier) @binding)
(join_clause . (identifier) @binding)
(join_into_clause (identifier) @binding)
(argument name: (identifier) @binding)
(attribute_argument name: (identifier) @binding)
(initializer_expression (assignment_expression left: (identifier) @binding))
(anonymous_object_creation_expression (identifier) @binding . "=")
(labeled_statement (identifier) @binding)
(goto_statement (identifier) @binding)
(alias_qualified_name alias: (identifier) @binding)

; ── Uses ────────────────────────────────────────────────────────────────────
(identifier) @reference

(invocation_expression
  function: (member_access_expression name: (identifier) @_get)
  arguments: (argument_list . (argument (string_literal (string_literal_content) @environment)))
  (#eq? @_get "GetEnvironmentVariable"))

(global_attribute
  (attribute
    name: (_) @_friends
    (attribute_argument_list
      . (attribute_argument (string_literal (string_literal_content) @friend))))
  (#match? @_friends "InternalsVisibleTo(Attribute)?$"))

; ── Directives ──────────────────────────────────────────────────────────────
(using_directive) @using
(base_list) @base

(object_creation_expression type: (_) @typename)
(attribute name: (_) @typename)
(typeof_expression type: (_) @typename)

; ── Where names are types, or not uses ──────────────────────────────────────
(type_argument_list) @type
(variable_declaration type: (_) @type)
(parameter type: (_) @type)
(property_declaration type: (_) @type)
(indexer_declaration type: (_) @type)
(event_declaration type: (_) @type)
(method_declaration returns: (_) @type)
(local_function_statement type: (_) @type)
(delegate_declaration type: (_) @type)
(operator_declaration type: (_) @type)
(conversion_operator_declaration type: (_) @type)
(lambda_expression type: (_) @type)
(cast_expression type: (_) @type)
(as_expression right: (_) @type)
(is_expression right: (_) @type)
(declaration_pattern type: (_) @type)
(recursive_pattern type: (_) @type)
(type_pattern type: (_) @type)
(constant_pattern) @type
(declaration_expression type: (_) @type)
(catch_declaration type: (_) @type)
(foreach_statement type: (_) @type)
(from_clause type: (_) @type)
(join_clause type: (_) @type)
(array_creation_expression type: (_) @type)
(stackalloc_expression type: (_) @type)
(default_expression type: (_) @type)
(sizeof_expression type: (_) @type)
(type_parameter_constraint type: (_) @type)
(tuple_element type: (_) @type)
(explicit_interface_specifier) @type
(function_pointer_type) @type
(invocation_expression
  function: (identifier) @_nameof
  arguments: (argument_list) @type
  (#eq? @_nameof "nameof"))

(using_directive) @skip
(extern_alias_directive) @skip
(namespace_declaration name: (_) @skip)
(file_scoped_namespace_declaration name: (_) @skip)
(preproc_if condition: (_) @skip)
(preproc_elif condition: (_) @skip)
(preproc_if_in_attribute_list condition: (_) @skip)
(subpattern (_) @skip . ":")
(preproc_define) @skip
(preproc_undef) @skip

(ERROR) @unparsed
