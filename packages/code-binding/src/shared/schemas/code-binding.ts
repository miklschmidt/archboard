import { z } from "zod";

import { NonemptyString } from "#shared/schemas/nonempty-string.ts";

/**
 * A node's one primary code location. `symbol` names the definition at `path`
 * that the node stands for, spelled as its language or tool spells a qualified
 * name, or the address of a declaration in infrastructure or Nix (ADR 0046).
 * Without it the node owns the whole file or directory.
 */
const CodeBindingSchema = z
	.object({
		repo: NonemptyString.meta({
			description:
				"Repository identity as registered with `archboard repo add`, such as `github.com/acme/payments`, never a local filesystem path.",
		}),
		path: z.string().meta({
			description:
				"Repository-relative path to the bound directory or file, or empty string for the repository root. End directory names that contain a dot with `/`.",
		}),
		symbol: NonemptyString.optional().meta({
			description:
				"Optional qualified definition name in `path`, or an infrastructure or Nix declaration address. Omit to bind the whole file or directory.",
		}),
		branch: NonemptyString.optional().meta({
			description: "Optional Git branch where the bound code was confirmed.",
		}),
		commit: NonemptyString.optional().meta({
			description:
				"Optional Git commit SHA where the bound code was confirmed; takes precedence over `branch`.",
		}),
		confirmedAt: NonemptyString.optional().meta({
			description: "Optional timestamp when the binding was last confirmed against source.",
		}),
	})
	.strict()
	.meta({
		description: "Primary source location implementing a module's responsibility.",
	});
type CodeBinding = z.infer<typeof CodeBindingSchema>;
/**
 * The one place in code an author cites as proof of a relationship or a flow
 * step: a repository, a file in it and a symbol in that file (ADR 0046). Every
 * field is required, and no line is stored: a line moves with every edit above
 * it, and the code check finds it from the symbol.
 */
const CodeAnchorSchema = z
	.object({
		repo: NonemptyString.meta({
			description: "Repository identity holding the cited file.",
		}),
		path: NonemptyString.meta({
			description: "Repository-relative path to the file containing the cited symbol.",
		}),
		symbol: NonemptyString.meta({
			description: "Qualified symbol name in `path` proving the relationship or flow step.",
		}),
	})
	.strict()
	.meta({
		description:
			"Source citation proving a relationship or flow step: repository, file path, and symbol name, with no line number. May cite a definition or a use; when a relationship kind declares an `evidence` list and the code check finds evidence kinds for the anchor, one accepted kind (resolved or candidate) satisfies the check.",
	});
type CodeAnchor = z.infer<typeof CodeAnchorSchema>;
/**
 * One file in a repository that a variant draws, such as a design document, an
 * ADR or a task (ADR 0054). It has a binding's shape without what only code
 * has, so the binding's resolver reads it: `commit` names one exact version
 * and wins over `branch`, and with neither it names the file in the checkout
 * the vault reads for that repository.
 */
const DocumentReferenceSchema = CodeBindingSchema.pick({
	repo: true,
	branch: true,
	commit: true,
})
	.extend({
		path: NonemptyString.meta({
			description: "Repository-relative path to the referenced document file.",
		}),
		branch: NonemptyString.optional().meta({
			description: "Optional Git branch from which to read the document when `commit` is absent.",
		}),
		commit: NonemptyString.optional().meta({
			description:
				"Optional Git commit SHA pinning the exact document revision; takes precedence over `branch`.",
		}),
	})
	.strict()
	.meta({
		description:
			"Reference to a tracked document file such as a design doc, ADR, or task. Without `commit` or `branch`, reads from the checkout the vault uses for that repository.",
	});
type DocumentReference = z.infer<typeof DocumentReferenceSchema>;

export {
	CodeBindingSchema,
	type CodeBinding,
	CodeAnchorSchema,
	type CodeAnchor,
	DocumentReferenceSchema,
	type DocumentReference,
};

/**
 * The schema `CodeAnchorSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function codeAnchorSchema(): typeof CodeAnchorSchema {
	return CodeAnchorSchema;
}

/**
 * The schema `CodeBindingSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function codeBindingSchema(): typeof CodeBindingSchema {
	return CodeBindingSchema;
}

/**
 * The schema `DocumentReferenceSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function documentReferenceSchema(): typeof DocumentReferenceSchema {
	return DocumentReferenceSchema;
}
