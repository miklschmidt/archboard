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
		repo: NonemptyString,
		path: z.string(),
		symbol: NonemptyString.optional(),
		branch: NonemptyString.optional(),
		commit: NonemptyString.optional(),
		confirmedAt: NonemptyString.optional(),
	})
	.strict();
type CodeBinding = z.infer<typeof CodeBindingSchema>;
/**
 * The one place in code an author cites as proof of a relationship or a flow
 * step: a repository, a file in it and a symbol in that file (ADR 0046). Every
 * field is required, and no line is stored: a line moves with every edit above
 * it, and the code check finds it from the symbol.
 */
const CodeAnchorSchema = z
	.object({ repo: NonemptyString, path: NonemptyString, symbol: NonemptyString })
	.strict();
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
	.extend({ path: NonemptyString })
	.strict();
type DocumentReference = z.infer<typeof DocumentReferenceSchema>;

export {
	CodeBindingSchema,
	type CodeBinding,
	CodeAnchorSchema,
	type CodeAnchor,
	DocumentReferenceSchema,
	type DocumentReference,
};
