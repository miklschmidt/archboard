// The embeds check's part of the answer of `archboard check` (ADR 0057): the
// checkout it read, the embeds it found there, what it found wrong with them,
// and what `--fix` rewrote. Every file is named as Git names it in that
// checkout, so the answer is the same on every machine.

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
 * - `EMBED_VAULT_UNAVAILABLE` (information): no checkout on this machine holds
 *   the vault the recipe names, so the embed was not checked.
 * - `EMBED_RECIPE_UNREADABLE` (warning): the file carries a recipe that cannot
 *   be read, so nothing can draw it again.
 */
const EMBED_FINDING_CODES = [
	"EMBED_OUTDATED",
	"EMBED_RENDERER_CHANGED",
	"EMBED_SOURCE_MISSING",
	"EMBED_VAULT_UNAVAILABLE",
	"EMBED_RECIPE_UNREADABLE",
] as const;

/** A board by id, with the name a recipe or the vault gives it. */
const EmbedBoardSchema = z.object({ id: z.string(), name: z.string() });

/** What is gone of what a recipe names: the board, its variant, its view, or anything to draw. */
const MissingSourceSchema = z.enum(["board", "variant", "view", "picture"]);
type MissingSource = z.infer<typeof MissingSourceSchema>;

const EmbedFindingSchema = z.object({
	severity: z.enum(["warning", "information"]),
	code: z.enum(EMBED_FINDING_CODES),
	/** The embed, as Git names it in the checkout. */
	file: z.string(),
	/** The board as the recipe names it; absent when the recipe cannot be read. */
	board: EmbedBoardSchema.optional(),
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
	/** For `EMBED_VAULT_UNAVAILABLE`: the repository identity the recipe names, or null for none. */
	repo: z.string().nullable().optional(),
	/** Why `--fix` left the embed as it was, when it was asked to fix it. */
	notFixed: z.string().optional(),
});
type EmbedFinding = z.infer<typeof EmbedFindingSchema>;

/** One file `--fix` rewrote, and why. */
const EmbedFixSchema = z.discriminatedUnion("action", [
	/** Drawn again from its own recipe: the board or the renderer changed the picture. */
	z.object({
		action: z.literal("drawn"),
		file: z.string(),
		code: z.enum(["EMBED_OUTDATED", "EMBED_RENDERER_CHANGED"]),
	}),
	/** The picture is current, and only its recipe was written again. */
	z.object({ action: z.literal("recipe"), file: z.string() }),
	/** Pointed at the board that holds a deleted board's name, and drawn from it. */
	z.object({
		action: z.literal("re-pointed"),
		file: z.string(),
		from: EmbedBoardSchema,
		to: EmbedBoardSchema,
	}),
]);
type EmbedFix = z.infer<typeof EmbedFixSchema>;

const EmbedsPartSchema = z.object({
	/** The root of the checkout whose tracked files were read, or null when the vault is in none. */
	checkout: z.string().nullable(),
	/** Every embed found: each tracked SVG document and PNG that carries a recipe. */
	embeds: z.array(z.string()),
	findings: z.array(EmbedFindingSchema),
	/** Every file `--fix` rewrote; empty without `--fix`. */
	fixed: z.array(EmbedFixSchema),
});
type EmbedsPart = z.infer<typeof EmbedsPartSchema>;

export { EmbedsPartSchema, type EmbedFinding, type EmbedFix, type EmbedsPart, type MissingSource };
