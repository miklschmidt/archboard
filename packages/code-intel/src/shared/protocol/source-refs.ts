// The answer of a source refs listing, `GET /api/architecture/refs` (ADR 0045).
//
// A branch footprint is read against a base ref and, optionally, a head ref. The reader needs the
// refs to choose from. This lists the local branches and the remote-tracking branches of every
// repository that the selected state binds, each read in the checkout that the footprint reads it
// in, and merges them by name. It never fetches, so it lists only what each checkout has, and it
// lists no tag. A repository whose checkout cannot be read is named with the reason, so that a
// missing branch never looks like a branch that no repository holds.
//
// It is information, derived on request and never stored.

import { z } from "zod";

/** Whether a ref is a branch of the checkout or a branch that the checkout tracks from a remote. */
const SourceRefKindSchema = z.enum(["local", "remote"]);

/** One ref as a person types it, such as `main`, `feat/x` or `origin/main`, and who holds it. */
const SourceRefSchema = z
	.object({
		name: z.string(),
		kind: SourceRefKindSchema,
		/** The identities of the repositories whose checkouts hold it, sorted. */
		repos: z.array(z.string()),
	})
	.strict();

/** Why a repository was not read: no checkout is registered for it, or its checkout cannot be read. */
const SourceRefsUnreadReasonSchema = z.enum(["repository-unregistered", "checkout-unavailable"]);

/** What one bound repository's checkout was read for, or why it was not read. */
const SourceRefsRepositorySchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("read"), repo: z.string() }).strict(),
	z
		.object({
			status: z.literal("unread"),
			repo: z.string(),
			reason: SourceRefsUnreadReasonSchema,
			detail: z.string(),
		})
		.strict(),
]);

/** The vault's own repository, read in the checkout that holds the vault. */
const SourceRefsVaultSchema = z
	.object({
		repo: z.string(),
		/**
		 * The default base: the target of `origin/HEAD` as a short name, else `main` when the checkout
		 * has it, else none.
		 */
		defaultBase: z.string().nullable(),
		/** The checkout's current branch; none for a detached HEAD. */
		branch: z.string().nullable(),
		/** The commit at the checkout's HEAD; none for a checkout without a commit. */
		commit: z.string().nullable(),
	})
	.strict();

/**
 * Where a range runs in the vault's repository: the merge base of the base and the head, and the
 * commit of the head, both complete commit ids.
 */
const SourceRefsRangeSchema = z.object({ mergeBase: z.string(), head: z.string() }).strict();

/** What every refs listing says. */
const SourceRefsAnswerSchema = z
	.object({
		/** Local branches first, then remote-tracking branches, alphabetically within each. */
		refs: z.array(SourceRefSchema),
		repositories: z.array(SourceRefsRepositorySchema),
		/** None for a vault that no checkout holds, which names no repository of its own. */
		vault: SourceRefsVaultSchema.nullable(),
		/**
		 * Only when the request names a base and a head: the range in the vault's repository, or null
		 * when that repository does not resolve either ref, or the two share no history. It is read from
		 * what the vault's checkout has, never fetched.
		 */
		range: SourceRefsRangeSchema.nullable().optional(),
	})
	.strict();

type SourceRef = z.infer<typeof SourceRefSchema>;
type SourceRefsAnswer = z.infer<typeof SourceRefsAnswerSchema>;

export { SourceRefsAnswerSchema, type SourceRef, type SourceRefsAnswer };
