// A node's code binding: the binding, anchor and document-reference schemas, and the files a binding names. Safe for the browser.
export { bindingPathOf, filesOfBinding } from "#shared/rules/binding-files.ts";
export {
	CodeAnchorSchema,
	CodeBindingSchema,
	DocumentReferenceSchema,
} from "#shared/schemas/code-binding.ts";
export type { CodeAnchor, CodeBinding, DocumentReference } from "#shared/schemas/code-binding.ts";
