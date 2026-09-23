// What the canvas says about every board in the vault, in one answer.
//
// It is one protocol with a producer, the canvas's listing route, and a
// consumer, the browser's navigator, so it has one owner here: the route is
// typed against this schema and the browser parses with it, and a field added
// on one side cannot be stripped by the other.
//
// The listing reports only what is authored. Which boards sit under which is
// the navigator's to derive from the links; nothing here builds an outline.

import { z } from "zod";
import {
	addressedVariant,
	SemanticBoardLevelSchema,
	type SemanticBoard,
	type SemanticVariant,
} from "@/shared/semantic-board/lib/aggregate";
import { RenderedVariantSchema } from "@/shared/semantic-board/lib/rendering";

/** How long a listed description may run, so a navigator row stays one line. */
const LISTED_DESCRIPTION_LIMIT = 160;

/**
 * One drill-down on the variant a board's bare name opens.
 *
 * `container` says whether the linking node contains other nodes: a link on a
 * container points up, to the board this one is a part of, and one on a card
 * points down or sideways (ADR 0029).
 */
const BoardLinkSchema = z.object({
	/** The target board's name, as the drill-down names it. */
	board: z.string(),
	/** The target variant's name, or null for whichever is current there. */
	variant: z.string().nullable(),
	/** The name of the node carrying the drill-down. */
	node: z.string(),
	container: z.boolean(),
});
type BoardLink = z.infer<typeof BoardLinkSchema>;

/** One board the vault holds. */
const ListedBoardSchema = z.object({
	name: z.string(),
	key: z.string(),
	/** The board's version, absent for a board that could not be read. */
	version: z.int().optional(),
	level: SemanticBoardLevelSchema.optional(),
	/** When the board last changed, absent for a board that could not be read. */
	updatedAt: z.string().optional(),
	variants: z.array(RenderedVariantSchema.extend({ parentId: z.string().nullable() })),
	/** The id of the variant the board's bare name opens, or null when it opens none. */
	opens: z.string().nullable(),
	/** The drill-downs on the variant the bare name opens; none when it opens none. */
	links: z.array(BoardLinkSchema),
	/** The first sentence of that variant's summary, or null when it has none. */
	description: z.string().nullable(),
	/** Why the board could not be read. */
	error: z.string().optional(),
});
type ListedBoard = z.infer<typeof ListedBoardSchema>;

/** The listing route's answer. */
const BoardListingSchema = z.object({
	success: z.literal(true),
	/** The vault's configured levels, coarsest first. */
	levels: z.array(SemanticBoardLevelSchema),
	boards: z.array(ListedBoardSchema),
});
type BoardListing = z.infer<typeof BoardListingSchema>;

/** What reading one board answered, as far as the listing needs it. */
type ListedRead =
	| { readonly ok: true; readonly board: SemanticBoard }
	| { readonly ok: false; readonly problem: string };

/**
 * A board name in the one spelling two names are compared in.
 * @param name The name.
 * @returns Its comparable form.
 */
function comparable(name: string): string {
	return name.trim().normalize("NFC").toLowerCase();
}

/**
 * The drill-downs on one variant, each once, leaving out any back to its own board.
 * @param board The board the variant is on.
 * @param variant The variant.
 * @returns The links, in node order.
 */
function linksOf(board: SemanticBoard, variant: SemanticVariant): BoardLink[] {
	const { nodes } = variant.content;
	const containers = new Set(nodes.map((node) => node.parent));
	const seen = new Set<string>();
	const links: BoardLink[] = [];
	for (const node of nodes) {
		const drill = node.drillDown;
		if (drill === undefined || comparable(drill.board) === comparable(board.name)) {
			continue;
		}
		const link = {
			board: drill.board,
			variant: drill.variant.kind === "named" ? drill.variant.name : null,
			node: node.name,
			container: containers.has(node.id),
		};
		const identity = JSON.stringify([link.board, link.variant, link.node]);
		if (!seen.has(identity)) {
			seen.add(identity);
			links.push(link);
		}
	}
	return links;
}

/**
 * The line a navigator shows under a board: the summary's first sentence, on
 * one line.
 * @param summary The variant's summary, if it has one.
 * @returns The line, or null when there is nothing to say.
 */
function descriptionOf(summary: string | undefined): string | null {
	const text = (summary ?? "").replaceAll(/\s+/gu, " ").trim();
	const sentence = /^.+?[.!?](?=\s|$)/u.exec(text)?.[0] ?? text;
	return sentence === "" ? null : bounded(sentence);
}

/**
 * A line cut at a word when it would run past the listed limit, and never
 * through the middle of a character that takes two UTF-16 code units.
 * @param line The line.
 * @returns The line, or as much of it as fits with an ellipsis.
 */
function bounded(line: string): string {
	if (line.length <= LISTED_DESCRIPTION_LIMIT) {
		return line;
	}
	const end = LISTED_DESCRIPTION_LIMIT - 1;
	const lastUnit = line.charCodeAt(end - 1);
	const cut = line.slice(0, lastUnit >= 0xd800 && lastUnit <= 0xdbff ? end - 1 : end);
	const atWord = cut.lastIndexOf(" ");
	return `${(atWord > 0 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

/**
 * One board as the listing reports it.
 * @param location The board's name and key.
 * @param location.name The board's name.
 * @param location.key The key every writer and lock agrees on.
 * @param read What reading it answered.
 * @returns The listed board.
 */
function listedBoard(
	{ name, key }: { readonly name: string; readonly key: string },
	read: ListedRead,
): ListedBoard {
	if (!read.ok) {
		return {
			name,
			key,
			variants: [],
			opens: null,
			links: [],
			description: null,
			error: read.problem,
		};
	}
	const { board } = read;
	// The current variant, or on a board nobody has built its draft (ADR 0031).
	const opened = addressedVariant(board);
	return {
		name,
		key,
		// The browser checks its cached pictures against this on load.
		version: board.version,
		level: board.level,
		updatedAt: board.updatedAt,
		opens: opened.ok ? opened.variant.id : null,
		variants: board.variants.map(({ id, name: variantName, lifecycle, parent }) => ({
			id,
			name: variantName,
			lifecycle,
			parentId: parent ?? null,
		})),
		links: opened.ok ? linksOf(board, opened.variant) : [],
		description: opened.ok ? descriptionOf(opened.variant.summary) : null,
	};
}

export {
	BoardLinkSchema,
	type BoardLink,
	ListedBoardSchema,
	type ListedBoard,
	BoardListingSchema,
	type BoardListing,
	type ListedRead,
	listedBoard,
};
