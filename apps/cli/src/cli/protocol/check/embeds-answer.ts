// The embeds check's part of the answer of `archboard check` (ADR 0057): the
// checkout it read, the embeds it found there, the tracked embeds of the
// vault's boards, what it found wrong with them, and what `--fix` rewrote.
// Every file is named as Git names it in the checkout that holds it, and a
// file of another repository names that repository too, so the answer is the
// same on every machine.

import { z } from "zod";

/**
 * What the embeds check reports, by code. A warning fails the check, and
 * information never does.
 *
 * - `EMBED_OUTDATED` (warning): the fingerprint and the picture differ, so the
 *   board says something new.
 * - `EMBED_RENDERER_CHANGED` (information): only the picture differs, so the
 *   renderer draws the same board differently.
 * - `EMBED_SOURCE_MISSING` (warning): the board, its variant or its view is
 *   gone, or what the recipe names draws nothing now.
 * - `EMBED_VAULT_UNAVAILABLE` (information): the vault the recipe names cannot
 *   be read: it is in no repository, its registered checkout holds none, its
 *   identity names no remote, the commit fetched or cached holds no vault, or
 *   the server refuses it. The embed was not checked.
 * - `EMBED_VAULT_FETCH_FAILED` (warning): no checkout on this machine holds the
 *   vault, fetching it failed and no copy is cached, so the embed was not checked.
 * - `EMBED_RECIPE_UNREADABLE` (warning): the file carries a recipe that cannot
 *   be read, so nothing can draw it again.
 * - `EMBED_VAULT_MOVED` (warning): a board of this vault tracks the embed and
 *   holds its board, and its recipe names the repository the board moved from
 *   (ADR 0051). `--fix` writes the recipe again, naming this vault.
 * - `EMBED_TRACKED_UNREACHABLE` (information): no checkout on this machine
 *   holds the repository of a tracked embed, so it was not read.
 * - `EMBED_TRACKED_MISSING` (information): a board of this vault tracks a file
 *   that is no embed of that board now: it is gone, Git does not track it in
 *   the checkout it was read in, or it carries no recipe of the board.
 *
 * A finding about a file of another repository is information whatever its
 * code: a warning would fail the vault's pull request until that repository
 * draws the file again, and that repository reads the vault's default branch
 * only after the pull request merges (ADR 0057). A finding against a vault
 * read from the cache is information too, and `--fix` leaves its embed as it
 * was, with `notFixed`: the cache can be behind the default branch.
 */
const EMBED_FINDING_CODES = [
	"EMBED_OUTDATED",
	"EMBED_RENDERER_CHANGED",
	"EMBED_SOURCE_MISSING",
	"EMBED_VAULT_UNAVAILABLE",
	"EMBED_VAULT_FETCH_FAILED",
	"EMBED_RECIPE_UNREADABLE",
	"EMBED_VAULT_MOVED",
	"EMBED_TRACKED_UNREACHABLE",
	"EMBED_TRACKED_MISSING",
] as const;

/** A board by id, with the name a recipe or the vault gives it. */
const EmbedBoardSchema = z.object({ id: z.string(), name: z.string() });

/** What is gone of what a recipe names: the board, its variant, its view, or anything to draw. */
const MissingSourceSchema = z.enum(["board", "variant", "view", "picture"]);
type MissingSource = z.infer<typeof MissingSourceSchema>;

const EmbedFindingSchema = z.object({
	severity: z.enum(["warning", "information"]),
	code: z.enum(EMBED_FINDING_CODES),
	/** The embed, as Git names it in the checkout that holds it. */
	file: z.string(),
	/**
	 * The repository identity of the file, for a tracked embed of another
	 * repository; absent for a file of the checkout that holds the vault.
	 */
	embedRepo: z.string().optional(),
	/** The board as the recipe names it; absent when the recipe cannot be read. */
	board: EmbedBoardSchema.optional(),
 model:EmbedBoardSchema.optional(),
	message: z.string(),
	/** For `EMBED_SOURCE_MISSING`: what is gone. */
	missing: MissingSourceSchema.optional(),
	/** For a board that is gone: the commit of the vault's history that removed its file. */
	removedIn: z.object({ commit: z.string(), subject: z.string() }).optional(),
	/** For a board that is gone: the board that holds its name now. */
	nameHeldBy: EmbedBoardSchema.optional(),
	/**
	 * For a board that is gone: the boards its vault lists and cannot read,
	 * any of which can be the board, because the listing names no id for them.
	 */
	unreadableBoards: z.array(z.string()).optional(),
	/**
	 * For `EMBED_VAULT_UNAVAILABLE`, `EMBED_VAULT_FETCH_FAILED` and
	 * `EMBED_VAULT_MOVED`: the repository identity of the vault the recipe
	 * names, or null for none.
	 */
	vaultRepo: z.string().nullable().optional(),
	/** Why `--fix` left the embed as it was, when it was asked to fix it. */
	notFixed: z.string().optional(),
});
type EmbedFinding = z.infer<typeof EmbedFindingSchema>;

/** Where a file `--fix` rewrote is: its path, and its repository when it is another's. */
const FixedFileShape = {
	file: z.string(),
	/** The repository identity of a tracked embed of another repository. */
	embedRepo: z.string().optional(),
};

/**
 * The repository the recipe named before `--fix` pointed it at this vault,
 * which a board of this vault holds since a move; absent when it named this vault.
 */
const MovedFromShape = { movedFrom: z.string().nullable().optional() };

/** One file `--fix` rewrote, and why. */
const EmbedFixSchema = z.discriminatedUnion("action", [
	/** Drawn again from its own recipe: the board or the renderer changed the picture. */
	z.object({
		action: z.literal("drawn"),
		...FixedFileShape,
		code: z.enum(["EMBED_OUTDATED", "EMBED_RENDERER_CHANGED"]),
		...MovedFromShape,
	}),
	/** The picture is current, and only its recipe was written again. */
	z.object({ action: z.literal("recipe"), ...FixedFileShape, ...MovedFromShape }),
	/** Pointed at the board that holds a deleted board's name, and drawn from it. */
	z.object({
		action: z.literal("re-pointed"),
		...FixedFileShape,
		from: EmbedBoardSchema,
		to: EmbedBoardSchema,
	}),
]);
type EmbedFix = z.infer<typeof EmbedFixSchema>;

/**
 * A vault the check read, by the repository identity a recipe names it by, and
 * where it read it (ADR 0057).
 *
 * - `checkout`: the registered checkout of the identity, as that checkout holds it.
 * - `fetched`: the commit the default branch is at, fetched now or read again
 *   from the cache because the branch has not moved.
 * - `cache`: the fetch failed, and the check read the newest cached commit,
 *   which can be behind the default branch. `EMBED_VAULT_CACHED` says so as
 *   information, which never changes the exit status. Every finding against it
 *   is information, and `--fix` writes no embed from it.
 */
const EmbedVaultSchema = z.discriminatedUnion("source", [
	z.object({ source: z.literal("checkout"), repo: z.string() }),
	z.object({ source: z.literal("fetched"), repo: z.string(), commit: z.string() }),
	z.object({
		source: z.literal("cache"),
		repo: z.string(),
		commit: z.string(),
		severity: z.literal("information"),
		code: z.literal("EMBED_VAULT_CACHED"),
		message: z.string(),
	}),
]);
type EmbedVault = z.infer<typeof EmbedVaultSchema>;

const EmbedsPartSchema = z.object({
	/** The root of the checkout whose tracked files were read, or null when the vault is in none. */
	checkout: z.string().nullable(),
	/** Every embed found: each tracked SVG document and PNG that carries a recipe. */
	embeds: z.array(z.string()),
	/** Every tracked embed of the vault's boards (ADR 0057), in the order the boards list them. */
	tracked: z.array(z.object({ board: EmbedBoardSchema, repo: z.string(), path: z.string() })),
	/** Every vault an embed's recipe names that the check read, in the order the embeds name them. */
	vaults: z.array(EmbedVaultSchema),
	findings: z.array(EmbedFindingSchema),
	/** Every file `--fix` rewrote; empty without `--fix`. */
	fixed: z.array(EmbedFixSchema),
});
type EmbedsPart = z.infer<typeof EmbedsPartSchema>;

export {
	EmbedsPartSchema,
	type EmbedFinding,
	type EmbedFix,
	type EmbedsPart,
	type EmbedVault,
	type MissingSource,
};
