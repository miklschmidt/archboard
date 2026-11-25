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
				"Repository identity used by the checkout registry, such as `github.com/acme/payments`.",
		}),
		path: z.string().meta({
			description:
				"Repository-relative path to the bound directory or file. Use an empty string for the repository root. A `.csproj` file stands for its project directory in the code check. End dotted directory names with `/` when binding a Terraform symbol.",
		}),
		symbol: NonemptyString.optional().meta({
			description:
				"Optional qualified definition name in `path`, or an infrastructure or Nix declaration address. Omit to bind the whole file or directory.",
		}),
		branch: NonemptyString.optional().meta({
			description: "Read the bound code from this Git branch when `commit` is absent.",
		}),
		commit: NonemptyString.optional().meta({
			description: "Read the bound code at this Git commit. It takes precedence over `branch`.",
		}),
		confirmedAt: NonemptyString.optional().meta({
			description: "Optional timestamp when the binding was last confirmed against source.",
		}),
	})
	.strict()
	.meta({
		description: "Primary source location where a module does or will do its work.",
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
			description: "Repository-relative path to the file that defines or uses the cited symbol.",
		}),
		symbol: NonemptyString.meta({
			description:
				"Name of the cited definition or use in `path`, including declaration addresses.",
		}),
	})
	.strict()
	.meta({
		description:
			"Source citation for a relationship or flow step. If the code check locates the symbol's definition and rules out the bound code of both ends and their descendants, it flags the citation. You can also cite an infrastructure declaration that joins the ends. For a relationship kind with an `evidence` list, one accepted kind, resolved or candidate, satisfies the evidence-kind rule when the check identifies evidence kinds.",
	});
type CodeAnchor = z.infer<typeof CodeAnchorSchema>;
/**
 * One file in a repository that a variant draws, such as a design document, an
 * ADR or a task (ADR 0054). It has a binding's shape without what only code
 * has, so the binding's resolver reads it. `commit` takes precedence over
 * `branch`. The code check reads a Git tree if the ref differs from the
 * checkout's HEAD or branch, and the working tree otherwise.
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
		branch: CodeBindingSchema.shape.branch.meta({
			description: "Optional Git branch to use when `commit` is absent.",
		}),
		commit: CodeBindingSchema.shape.commit.meta({
			description: "Optional Git commit SHA. It takes precedence over `branch`.",
		}),
	})
	.strict()
	.meta({
		description:
			"Reference to a repository document such as a design doc, ADR, or task. A working-tree code check reads the vault's checkout for `repo` when no ref is specified or the selected ref is checked out. Otherwise it looks in the selected Git tree.",
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
