// What the Archboard server says about every board in the vault, in one answer.
//
// It is one protocol with a producer, the server's listing route, and a
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
	TrackedEmbedSchema,
	type SemanticBoard,
	type SemanticVariant,
} from "#shared/schemas/board-document.ts";
import { RenderedVariantSchema } from "#shared/protocol/render-reply.ts";

/** How long a listed description may run, so a navigator row stays one line. */
const LISTED_DESCRIPTION_LIMIT = 160;

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
const BoardLinkSchema = z.object({
	/** The target board's name as it goes by now, which a former name resolves to. */
	board: z.string(),
	/** The target variant's name, or null for whichever is current there. */
	variant: z.string().nullable(),
	repo: z.string().optional(),
	/** The name of the node carrying the drill-down. */
	node: z.string(),
	container: z.boolean(),
});
type BoardLink = z.infer<typeof BoardLinkSchema>;

/** One board the vault holds. */
const ListedBoardSchema = z.object({
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
	/**
	 * The embeds the board tracks, absent when it tracks none. The embeds check
	 * of the vault reads each of them (ADR 0057).
	 */
	trackedEmbeds: z.array(TrackedEmbedSchema).optional(),
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
	/**
	 * The repository identity of the checkout that holds the vault, so a reader
	 * can tell a drill-down naming it from one into another repository (ADR
	 * 0050). Absent for an untracked vault.
	 */
	repository: z.string().optional(),
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

/** The name a board goes by now, for a name a link spells it with. */
type AcceptedName = (name: string) => string;

/**
 * The name each board goes by, looked up by any name it answers to: its own,
 * and every one it had before a rename (ADR 0036). A board's own name wins over
 * another board's former one, as it does wherever a name is resolved.
 * @param reads What reading each board answered.
 * @returns The lookup; a name no board answers to is its own answer.
 */
function acceptedBoardNames(reads: readonly ListedRead[]): AcceptedName {
	const boards = reads.flatMap((read) => (read.ok ? [read.board] : []));
	const byName = new Map<string, string>();
	for (const board of boards) {
		for (const former of board.formerNames ?? []) {
			byName.set(comparable(former), board.name);
		}
	}
	for (const board of boards) {
		byName.set(comparable(board.name), board.name);
	}
	return (name) => byName.get(comparable(name)) ?? name;
}

/**
 * The drill-downs on one variant, each once, leaving out any back to its own board.
 * @param board The board the variant is on.
 * @param variant The variant.
 * @param accepted The name a board goes by now, for a name a link spells it with.
 * @param vaultRepo The repository identity of the vault's own checkout, if it has one.
 * @returns The links, in node order.
 */
function linksOf(
	board: SemanticBoard,
	variant: SemanticVariant,
	accepted: AcceptedName,
	vaultRepo: string | undefined,
): BoardLink[] {
	const { nodes } = variant.content;
	const containers = new Set(nodes.map((node) => node.parent));
	const seen = new Set<string>();
	const links: BoardLink[] = [];
	for (const node of nodes) {
		const link = linkOn(node, containers, accepted, vaultRepo);
		// A link back to the board's own name is no link, unless it names a
		// repository: then the board it opens is another one that shares the name.
		if (
			link === null ||
			(link.repo === undefined && comparable(link.board) === comparable(board.name))
		) {
			continue;
		}
		const identity = JSON.stringify([link.repo, link.board, link.variant, link.node]);
		if (!seen.has(identity)) {
			seen.add(identity);
			links.push(link);
		}
	}
	return links;
}

/**
 * The drill-down one node carries, as the listing reports it.
 * @param node The node.
 * @param containers The ids of the nodes that contain others.
 * @param accepted The name a board goes by now, for a name a link spells it with.
 * @param vaultRepo The repository identity of the vault's own checkout, if it has one.
 * @returns The link, or null when the node carries none.
 */
function linkOn(
	node: SemanticVariant["content"]["nodes"][number],
	containers: ReadonlySet<string | undefined>,
	accepted: AcceptedName,
	vaultRepo: string | undefined,
): BoardLink | null {
	const drill = node.drillDown;
	if (drill === undefined) {
		return null;
	}
	// A drill-down that names the vault's own repository opens a board of this
	// vault, as the vault check reads it (ADR 0049).
	const elsewhere = drill.repo === vaultRepo ? undefined : drill.repo;
	return {
		board: elsewhere === undefined ? accepted(drill.board) : drill.board,
		variant: drill.variant.kind === "named" ? drill.variant.name : null,
		...(elsewhere === undefined ? {} : { repo: elsewhere }),
		node: node.name,
		container: containers.has(node.id),
	};
}

/**
 * A board name as it is spelled, for a listing that resolves no former names.
 * @param name The name.
 * @returns The same name.
 */
function asSpelled(name: string): string {
	return name;
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
 * The embeds a board tracks, as the listing reports them.
 * @param board The board.
 * @returns The field, or nothing when it tracks none.
 */
function trackedOf(board: SemanticBoard): Pick<ListedBoard, "trackedEmbeds"> {
	return board.trackedEmbeds === undefined ? {} : { trackedEmbeds: board.trackedEmbeds };
}

/**
 * One board as the listing reports it.
 * @param location The board's name and key.
 * @param location.name The board's name.
 * @param location.key The key every writer and lock agrees on.
 * @param read What reading it answered.
 * @param accepted The name a board goes by now, for a name a link spells it
 *   with; each name as it is spelled when absent.
 * @param vaultRepo The repository identity of the vault's own checkout, if it
 *   has one: a drill-down that names it is a link within the vault.
 * @returns The listed board.
 */
function listedBoard(
	{ name, key }: { readonly name: string; readonly key: string },
	read: ListedRead,
	accepted: AcceptedName = asSpelled,
	vaultRepo?: string,
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
		id: board.id,
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
		links: opened.ok ? linksOf(board, opened.variant, accepted, vaultRepo) : [],
		description: opened.ok ? descriptionOf(opened.variant.summary) : null,
		...trackedOf(board),
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
	acceptedBoardNames,
	listedBoard,
};
