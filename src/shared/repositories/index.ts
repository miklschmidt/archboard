// The repositories of this machine as the navigator lists them, the answer of
// `GET /api/repositories` (ADR 0050).
//
// A repository is named by its identity, or an untracked vault by its registry
// name. Its boards are read from the vault of its chosen checkout. The vault is
// the directory the server reads, and the page keeps it only to name it back on
// a call: it is never shown and never in an address.

import { z } from "zod";

/** One known checkout of a repository, as the menu that chooses one lists it. */
const CheckoutEntrySchema = z.object({
	root: z.string(),
	chosen: z.boolean(),
	exists: z.boolean(),
	hasVault: z.boolean(),
});

/**
 * Why a repository shows boards, or why it shows none: its chosen checkout is
 * gone, it has no vault, or the repository has no chosen checkout at all.
 */
const RepositoryStateSchema = z.enum(["ready", "gone", "no-vault", "unchosen"]);

/** One repository as the navigator lists it. */
const RepositoryEntrySchema = z.object({
	/** The repository identity, or the registry name of an untracked vault. */
	name: z.string(),
	untracked: z.boolean(),
	/** The canonical vault of the chosen checkout, or null when it has none to read. */
	vault: z.string().nullable(),
	state: RepositoryStateSchema,
	/** The known checkouts, for the menu that chooses one. An untracked vault has none. */
	checkouts: z.array(CheckoutEntrySchema),
});

/** The answer of `GET /api/repositories`. */
const RepositoryListingSchema = z.object({
	success: z.literal(true),
	repositories: z.array(RepositoryEntrySchema),
	/** The vault the server was started with, where a page opens by default. */
	served: z.string(),
});

/** The body of `PUT /api/repositories/chosen`: which checkout of which repository to read from now on. */
const CheckoutChoiceSchema = z.object({ repository: z.string().min(1), root: z.string().min(1) });

type CheckoutEntry = z.infer<typeof CheckoutEntrySchema>;
type CheckoutChoice = z.infer<typeof CheckoutChoiceSchema>;
type RepositoryState = z.infer<typeof RepositoryStateSchema>;
type RepositoryEntry = z.infer<typeof RepositoryEntrySchema>;
type RepositoryListing = z.infer<typeof RepositoryListingSchema>;

export {
	CheckoutChoiceSchema,
	RepositoryListingSchema,
	type CheckoutChoice,
	type CheckoutEntry,
	type RepositoryEntry,
	type RepositoryListing,
	type RepositoryState,
};
