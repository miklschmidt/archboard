; What only C++ adds to the C query (c.scm), which tree-sitter-cpp 0.23.4
; compiles after it (grammar-files.ts).
;
; @logic       one piece of logic: a range loop, `new` and `delete`.

[
  (for_range_loop)
  (new_expression)
  (delete_expression)
] @logic
