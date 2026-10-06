; The code facts query of Python (ADR 0046), written against
; tree-sitter-python 0.25.0. The adapter (python-adapter.ts) reads each capture
; by its name.
;
; @definition        the name of a function, a class or a type alias.
; @definition.target the target of an assignment: a name, or a pattern of names.
;                    The adapter keeps a definition only at module level or in a
;                    class body, and qualifies a member with its classes.
; @binding           a name a parameter, a loop, `as`, `global` or a keyword
;                    argument writes, so it is not a use.
; @reference         a use of a name; a name after `.` is spelled with its chain.
; @all               a list of names `__all__` is set to or extended with;
;                    @all.declared says the module sets `__all__` at all.
; @environment       the name of an environment value: `os.environ["NAME"]`,
;                    `os.environ.get("NAME")`, `"NAME" in os.environ`,
;                    `os.getenv("NAME")`.
; @event             the name of an event: the first string argument of
;                    `signal`, `on`, `once` or `emit`.
; @import            an import statement; @import.dynamic the module string of
;                    `importlib.import_module()` or `__import__()`.
; @type              code where every name is a type: an annotation, and the
;                    body of `if TYPE_CHECKING:`.
; @skip              code where no name is a use: import statements.
; @unparsed          code that did not parse.

; ── Definitions ─────────────────────────────────────────────────────────────
(function_definition name: (identifier) @definition)
(class_definition name: (identifier) @definition)
(type_alias_statement left: (type (identifier) @definition))
(assignment left: (_) @definition.target)

; ── Names written where they are bound, never a use ─────────────────────────
(parameters (identifier) @binding)
(lambda_parameters (identifier) @binding)
(typed_parameter (identifier) @binding)
(default_parameter name: (identifier) @binding)
(typed_default_parameter name: (identifier) @binding)
(list_splat_pattern (identifier) @binding)
(dictionary_splat_pattern (identifier) @binding)
(pattern_list (identifier) @binding)
(tuple_pattern (identifier) @binding)
(list_pattern (identifier) @binding)
(for_statement left: (identifier) @binding)
(for_in_clause left: (identifier) @binding)
(as_pattern_target (identifier) @binding)
(named_expression name: (identifier) @binding)
(global_statement (identifier) @binding)
(nonlocal_statement (identifier) @binding)
(keyword_argument name: (identifier) @binding)

; ── Uses ────────────────────────────────────────────────────────────────────
(identifier) @reference

(assignment left: (identifier) @_all right: [(list) (tuple)] @all (#eq? @_all "__all__"))
(augmented_assignment left: (identifier) @_all right: [(list) (tuple)] @all (#eq? @_all "__all__"))
(call
  function: (attribute object: (identifier) @_all attribute: (identifier) @_extend)
  arguments: (argument_list) @all
  (#eq? @_all "__all__")
  (#match? @_extend "^(extend|append)$"))
(assignment left: (identifier) @all.declared (#eq? @all.declared "__all__"))

(subscript
  value: (attribute object: (identifier) @_os attribute: (identifier) @_environ)
  subscript: (string (string_content) @environment)
  (#eq? @_os "os")
  (#eq? @_environ "environ"))
(call
  function: (attribute
    object: (attribute object: (identifier) @_os attribute: (identifier) @_environ)
    attribute: (identifier) @_get)
  arguments: (argument_list . (string (string_content) @environment))
  (#eq? @_os "os")
  (#eq? @_environ "environ")
  (#match? @_get "^(get|setdefault|pop)$"))
(comparison_operator
  (string (string_content) @environment)
  (attribute object: (identifier) @_os attribute: (identifier) @_environ)
  (#eq? @_os "os")
  (#eq? @_environ "environ"))
(call
  function: (attribute object: (identifier) @_os attribute: (identifier) @_getenv)
  arguments: (argument_list . (string (string_content) @environment))
  (#eq? @_os "os")
  (#eq? @_getenv "getenv"))
(call
  function: (identifier) @_getenv
  arguments: (argument_list . (string (string_content) @environment))
  (#eq? @_getenv "getenv"))

(call
  function: [
    (identifier) @_signal
    (attribute attribute: (identifier) @_signal)
  ]
  arguments: (argument_list . (string (string_content) @event))
  (#match? @_signal "^(signal|on|once|emit)$"))

; ── Imports ─────────────────────────────────────────────────────────────────
(import_statement) @import
(import_from_statement) @import
(call
  function: (attribute object: (identifier) @_importlib attribute: (identifier) @_import)
  arguments: (argument_list . (string (string_content) @import.dynamic))
  (#eq? @_importlib "importlib")
  (#eq? @_import "import_module"))
(call
  function: (identifier) @_import
  arguments: (argument_list . (string (string_content) @import.dynamic))
  (#match? @_import "^(import_module|__import__)$"))

; ── Where names are types, or not uses ──────────────────────────────────────
(type) @type
(if_statement
  condition: [
    (identifier) @_checking
    (attribute attribute: (identifier) @_checking)
  ]
  consequence: (block) @type
  (#eq? @_checking "TYPE_CHECKING"))

(import_statement) @skip
(import_from_statement) @skip
(future_import_statement) @skip

(ERROR) @unparsed
