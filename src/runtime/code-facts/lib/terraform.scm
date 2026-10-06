; The code facts query of Terraform and OpenTofu (ADR 0046), written against
; the `terraform` grammar of @tree-sitter-grammars/tree-sitter-hcl 1.2.0. The
; adapter (terraform-adapter.ts) reads each capture by its name.
;
; @block      a block of the file: resource, data, ephemeral, module, variable,
;             output, locals, and every other kind, which declares nothing.
; @reference  the first name of a name in an expression; the adapter follows
;             the attributes after it to the address it names.
; @unparsed   code that did not parse.

(config_file (body (block) @block))

(variable_expr (identifier) @reference)

(ERROR) @unparsed
