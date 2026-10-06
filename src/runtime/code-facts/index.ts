// Code facts (ADR 0046): what one file of a checkout defines, references and
// imports, read by an adapter where one reads the file and as text everywhere
// else, and cached in this process by the file's content.
//
// The code check asks for the facts of a file, where a symbol is defined and
// what a module exposes. It never sees tree-sitter, a grammar, a query or a
// parser. Which files an adapter reads is the table of adapters
// (lib/adapters.ts), one entry for each language or format; every other file
// gets the text reading. Each language says what its module exposes
// (TASK-368.10). A Terraform or OpenTofu root module is read as one address
// space across its module directories, with the plans an agent named filling
// in the modules the check does not read (TASK-367.17).

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
export { mergedDefinitions } from "@/runtime/code-facts/lib/compose-merged";
export { isComposeFile } from "@/runtime/code-facts/lib/compose-project";
export {
	type KubernetesLink,
	type ManifestSite,
	kubernetesLinks,
} from "@/runtime/code-facts/lib/kubernetes-links";
export { pairOf } from "@/runtime/code-facts/lib/c-pairs";
export { type DefinitionSite, definitionSite } from "@/runtime/code-facts/lib/definition-site";
export { type Accept, type Found, findSymbol } from "@/runtime/code-facts/lib/lookup";
export {
	type ExposedName,
	type ModuleExposure,
	moduleExposure,
	moduleOf,
	within,
} from "@/runtime/code-facts/lib/module-exposure";
export { type CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
export { neverRead } from "@/runtime/code-facts/lib/never-read";
export {
	type CodeFacts,
	type FactsPass,
	type PassStats,
	createCodeFacts,
} from "@/runtime/code-facts/lib/reader";
export { declarationAddress, isTerraformFile } from "@/runtime/code-facts/lib/terraform-address";
export {
	type Declared,
	type TerraformConfiguration,
	terraformConfiguration,
	terraformRootOf,
} from "@/runtime/code-facts/lib/terraform-configuration";
export { type TerraformPlan, readTerraformPlan } from "@/runtime/code-facts/lib/terraform-plan";
export { isJoiningDeclaration } from "@/runtime/code-facts/lib/terraform-providers";
export { lastName } from "@/runtime/code-facts/lib/text-reading";
