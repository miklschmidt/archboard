// What the Archboard server says about every board in the vault, in one answer.
//
// The browser's navigator reads a retained listing of this shape; it is typed
// here, beside the board shapes it lists.
//
// The listing reports only what is authored. Which boards sit under which is
// the navigator's to derive from the links; nothing here builds an outline.

import { z } from "zod";
import { LegacyBoardLevelSchema, TrackedEmbedSchema } from "#shared/schemas/legacy-board.ts";
import { RenderedVariantSchema } from "#shared/protocol/render-reply.ts";

/**
 * One drill-down on the variant a board's bare name opens.
 *
 * `repo` is the repository identity a drill-down into another repository names
 * (ADR 0049). Such a link is not to a board of this vault: its `board` is the
 * name as the link spells it, because only the other vault can say what the
 * board goes by now, and a reader that places boards by their links (the
 * navigator) leaves it out. A link without one is in this vault, and so is a
 * drill-down that names the vault's own identity: it is listed without one.
 *
 * `container` says whether the linking node contains other nodes: a link on a
 * container points up, to the board this one is a part of, and one on a card
 * points down or sideways (ADR 0029).
 */
const LegacyLinkSchema = z.object({
	/** The target board's name as it goes by now, which a former name resolves to. */
	board: z.string(),
	/** The target variant's name, or null for whichever is current there. */
	variant: z.string().nullable(),
	repo: z.string().optional(),
	/** The name of the node carrying the drill-down. */
	node: z.string(),
	container: z.boolean(),
});

/** One board the vault holds. */
const ListedLegacyBoardSchema = z.object({
	/**
	 * The board's id, absent for a board that could not be read. A render
	 * recipe names its board by id, so the embeds check finds the name it goes
	 * by now here (ADR 0057).
	 */
	id: z.string().optional(),
	name: z.string(),
	key: z.string(),
	/** The board's version, absent for a board that could not be read. */
	version: z.int().optional(),
	level: LegacyBoardLevelSchema.optional(),
	/** When the board last changed, absent for a board that could not be read. */
	updatedAt: z.string().optional(),
	variants: z.array(RenderedVariantSchema.extend({ parentId: z.string().nullable() })),
	/** The id of the variant the board's bare name opens, or null when it opens none. */
	opens: z.string().nullable(),
	/** The drill-downs on the variant the bare name opens; none when it opens none. */
	links: z.array(LegacyLinkSchema),
	/** The first sentence of that variant's summary, or null when it has none. */
	description: z.string().nullable(),
	/**
	 * The embeds the board tracks, absent when it tracks none. The embeds check
	 * of the vault reads each of them (ADR 0057).
	 */
	trackedEmbeds: z.array(TrackedEmbedSchema).optional(),
	/** Why the board could not be read. */
	error: z.string().optional(),
});

/** The listing route's answer. */
const LegacyListingSchema = z.object({
	success: z.literal(true),
	/** The vault's configured levels, coarsest first. */
	levels: z.array(LegacyBoardLevelSchema),
	boards: z.array(ListedLegacyBoardSchema),
	/**
	 * The repository identity of the checkout that holds the vault, so a reader
	 * can tell a drill-down naming it from one into another repository (ADR
	 * 0050). Absent for an untracked vault.
	 */
	repository: z.string().optional(),
});
type LegacyListing = z.infer<typeof LegacyListingSchema>;

export { type LegacyListing };
