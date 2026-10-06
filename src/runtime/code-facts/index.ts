// Code facts (ADR 0046): what one file of a checkout defines, references and
// imports, read by tree-sitter where a grammar reads the file and as text
// everywhere else, and cached in this process by the file's content.
//
// The code check asks for the facts of a file and where a symbol is defined.
// It never sees tree-sitter, a grammar or a query. TypeScript and TSX have an
// adapter (TASK-367.06); every other file gets the text reading.

export {
	type Definition,
	type FileFacts,
	type Import,
	type ImportedName,
	type Reference,
	type ReferenceVia,
	type SyntaxFacts,
	type Target,
	type TextFacts,
	type Unparsed,
} from "@/runtime/code-facts/lib/facts";
export { type DefinitionSite, definitionSite } from "@/runtime/code-facts/lib/definition-site";
export { type Accept, type Found, findSymbol } from "@/runtime/code-facts/lib/lookup";
export { type CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
export { neverRead } from "@/runtime/code-facts/lib/never-read";
export {
	type CodeFacts,
	type FactsPass,
	type PassStats,
	createCodeFacts,
} from "@/runtime/code-facts/lib/reader";
export { lastName } from "@/runtime/code-facts/lib/text-reading";
