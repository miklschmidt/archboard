// A card or container alone in its group's region (ADR 0038, amended
// 2026-09-27). Such a region gathers nothing, so the blocks lay it out as the
// node itself, with a box grown by the region's inset and caption band:
// placement and routing see one obstacle where the board without the region
// saw one. Once drawn, the node is put back inside that box and the region
// drawn round it; a line that stopped on the region's wall is carried on to
// the card's face.
import type { ElkNode } from "@archboard/elk-rs";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { z } from "zod";
import {
	GROUP_CAPTIONS,
	PLACING_GROUP,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { cardOf, type Card } from "@/transformers/semantic-renderer/lib/blocks/card";
import { CAPTION_INSET, type Insets } from "@/transformers/semantic-renderer/lib/blocks/laid";
import type { FrameShape } from "@/transformers/semantic-renderer/lib/track/containers";
import { TRACK_BELOW, TRACK_TITLE } from "@/transformers/semantic-renderer/lib/track/scene";

/** The room a region round one node keeps round it on the sides and below. */
const LONE_INSET = 14;
/** How far a line carried to a card's side keeps from the card's corners. */
const CORNER_ROOM = 8;
/**
 * How far a line crossing a caption band keeps from the caption's words: as
 * far as there is room for, best first.
 */
const WORDS_ROOMS = [12, 8, 4];
/** How far a caption's words stand in from its box (measurement's caption padding). */
const WORDS_INSET = 12;
/** How near a point on a wall must be to stand on it. */
const ON_WALL = 0.5;

/** A width and a height. */
interface Size {
	readonly width: number;
	readonly height: number;
}

/** A node alone in its group's region: the group, its caption's size, and a card's own width. */
interface Lone {
	readonly group: string;
	readonly caption: Size;
	/** A card's width: a caption wider than the card widens the region round it, not the card. */
	readonly width?: number;
}

/** Where a line stops at a node alone in its region: that region's box and the node's. */
interface Stop {
	readonly region: Box;
	readonly card: Box;
}

const CaptionsSchema = z.array(z.tuple([z.string(), z.number(), z.number()]));

/**
 * Each placing group's caption size, as measurement wrote it on the root.
 * @param graph The measured hierarchy.
 * @returns The sizes, by group.
 */
function captionsOf(graph: ElkNode): Map<string, Size> {
	const rows = CaptionsSchema.parse(JSON.parse(graph.layoutOptions?.[GROUP_CAPTIONS] ?? "[]"));
	return new Map(rows.map(([id, width, height]) => [id, { width, height }]));
}

/**
 * The group a node is gathered with into a region: its placing group, unless
 * no sibling shares that group with it. Such a node is laid out as its region
 * instead, and gathered with none.
 * @param lone Every node alone in its region, by id; the node is added when it is one.
 * @param captions Each group's caption size.
 * @param node The node.
 * @param siblings The nodes of its parent, itself among them.
 * @returns The group, if any.
 */
function placingGroup(
	lone: Map<string, Lone>,
	captions: ReadonlyMap<string, Size>,
	node: ElkNode,
	siblings: readonly ElkNode[],
): string | undefined {
	const group = node.layoutOptions?.[PLACING_GROUP];
	if (group === undefined || !aloneIn(node, siblings)) return group;
	lone.set(node.id, loneOf(node, group, captions.get(group)));
	return undefined;
}

/**
 * A node's region round it alone.
 * @param node The node.
 * @param group Its placing group.
 * @param caption The group's caption size, if measured.
 * @returns The region.
 */
function loneOf(node: ElkNode, group: string, caption: Size | undefined): Lone {
	return {
		group,
		caption: caption ?? { width: 1, height: 1 },
		...(node.children?.length ? {} : { width: node.width! }),
	};
}

/**
 * Whether a node is alone among its siblings in its placing group.
 * @param node The node.
 * @param siblings The nodes of its parent, itself among them.
 * @returns True when it is.
 */
function aloneIn(node: ElkNode, siblings: readonly ElkNode[]): boolean {
	const group = node.layoutOptions?.[PLACING_GROUP];
	return (
		group !== undefined &&
		!siblings.some((one) => one !== node && one.layoutOptions?.[PLACING_GROUP] === group)
	);
}

/**
 * The band above the node that holds the region's caption.
 * @param lone The region.
 * @returns Its height.
 */
function bandOf(lone: Lone): number {
	return 2 * CAPTION_INSET + lone.caption.height;
}

/**
 * How much taller a region round one node stands than the node: its caption
 * band above and its inset below.
 * @param lone The region.
 * @returns The height it adds.
 */
function grownBy(lone: Lone): number {
	return bandOf(lone) + LONE_INSET;
}

/**
 * A container's header: its title row, and the caption band above it when
 * it is alone in its region.
 * @param node The measured container.
 * @param band How much the caption band adds, when it is alone in its region.
 * @returns The header's size.
 */
function frameHeader(node: ElkNode, band = 0): Size {
	const header = Number(node.layoutOptions?.["archboard.header.size"] ?? 0);
	return { width: node.width!, height: Math.max(1, header) + band };
}

/**
 * A container as a block of its own: its header, holding the caption band
 * above its title row when it is alone in its region, and that region.
 * @param node The measured container.
 * @param lone Its region, if it is alone in one.
 * @returns What the block is of.
 */
function framed(node: ElkNode, lone: Lone | undefined): { header: Size; lone: Lone | undefined } {
	return { header: frameHeader(node, lone && bandOf(lone)), lone };
}

/**
 * A card as the blocks lay it out: grown into the box its region takes when
 * it is alone in one.
 * @param node The measured card.
 * @param lone Its region, if it is alone in one.
 * @returns Its size and peer group.
 */
function cardAs(node: ElkNode, lone: Lone | undefined): Card {
	const card = cardOf(node);
	if (lone === undefined) return card;
	return {
		...card,
		width: Math.max(card.width + 2 * LONE_INSET, lone.caption.width + 2 * CAPTION_INSET),
		height: card.height + bandOf(lone) + LONE_INSET,
	};
}

/**
 * The card's or container's own box inside the box its region took: a card
 * no wider than itself, in the middle of a region its caption widens.
 * @param region The region's box.
 * @param lone The region.
 * @returns The card's or container's box.
 */
function cardIn(region: Box, lone: Lone): Box {
	const side = sideRoom(region.width, lone);
	return {
		x: region.x + side,
		y: region.y + bandOf(lone),
		width: region.width - 2 * side,
		height: region.height - bandOf(lone) - LONE_INSET,
	};
}

/**
 * How far in from each side of the box its region took a card or container
 * stands: the region's inset, or more round a card its caption widens the
 * region past.
 * @param width The box's width.
 * @param lone The region.
 * @returns The room.
 */
function sideRoom(width: number, lone: Lone): number {
	return lone.width === undefined ? LONE_INSET : Math.max(LONE_INSET, (width - lone.width) / 2);
}

/**
 * The title row a container drawn inline gives the track scene, and the room
 * it keeps below what it holds. Alone in its region, the scene reads it as
 * the region: its title row holds the caption band above the title, reaching
 * as far in as the caption's words or the title's, whichever is further, and
 * it keeps the region's inset more below.
 * @param bounds The container's cluster's box.
 * @param head Its header: the height its title's centre stands at, its height, and how far its title's words reach in.
 * @param head.centre The height of its centre.
 * @param head.height Its height.
 * @param head.words How far its title's words reach in from its left edge.
 * @param lone Its region, if it is alone in one.
 * @returns The layout options that carry them.
 */
function titleRow(
	bounds: Box,
	head: { centre: number; height: number; words: number },
	lone: Lone | undefined,
): Record<string, string> {
	const { centre, height, words } = head;
	const reach =
		lone === undefined ? words : Math.max(words + LONE_INSET, lone.caption.width + CAPTION_INSET);
	const row = [bounds.x, centre - height / 2, bounds.width, height, reach];
	return {
		[TRACK_TITLE]: row.join(","),
		...(lone === undefined ? {} : { [TRACK_BELOW]: String(LONE_INSET) }),
	};
}

/**
 * A container drawn inline, laid out as the region it is alone in: its own
 * box inside the box the scene drew.
 * @param shape The container's shape as the scene drew it.
 * @param lone Its region, if it is alone in one.
 * @returns Its shape.
 */
function frameShape(shape: FrameShape, lone: Lone | undefined): FrameShape {
	return lone === undefined ? shape : { ...shape, box: cardIn(shape.box, lone) };
}

/**
 * The box of the region round a card or container alone in it.
 * @param box The node's own box.
 * @param lone The region.
 * @returns The region's box.
 */
function regionRound(box: Box, lone: Lone): Box {
	return {
		x: box.x - LONE_INSET,
		y: box.y - bandOf(lone),
		width: box.width + 2 * LONE_INSET,
		height: box.height + bandOf(lone) + LONE_INSET,
	};
}

/**
 * The room a container alone in its region keeps around what it holds: the
 * region's inset more on its sides and below. The caption band stands in its
 * header.
 * @param insets The room it keeps alone in no region.
 * @param lone Its region, if it is alone in one.
 * @returns Its insets.
 */
function grownInsets(insets: Insets, lone: Lone | undefined): Insets {
	if (lone === undefined) return insets;
	return { ...insets, side: insets.side + LONE_INSET, bottom: insets.bottom + LONE_INSET };
}

/**
 * Whether two coordinates are one wall's.
 * @param one A coordinate.
 * @param other Another.
 * @returns True when they are.
 */
function onWall(one: number, other: number): boolean {
	return Math.abs(one - other) < ON_WALL;
}

/**
 * The points that carry a line from where it stops on a region's side wall
 * to its card's side, level, stepping clear of the caption band and the
 * corners when it stopped beside them.
 * @param end Where the line stops.
 * @param x The card's side.
 * @param card The card's box.
 * @returns The points after the end, out to the card.
 */
function carriedLevel(end: Point, x: number, card: Box): Point[] {
	const y = Math.min(Math.max(end.y, card.y + CORNER_ROOM), card.y + card.height - CORNER_ROOM);
	if (onWall(y, end.y)) return [{ x, y }];
	const step = (end.x + x) / 2;
	return [
		{ x: step, y: end.y },
		{ x: step, y },
		{ x, y },
	];
}

/**
 * The points that carry a line from where it stops on a region's wall to its
 * card's face: straight on through a top or bottom wall, level through a side.
 * @param end Where the line stops.
 * @param stop The region's box and the card's.
 * @returns The points after the end, out to the card; none when the end is on no wall.
 */
function carried(end: Point, stop: Stop): Point[] {
	const { region, card } = stop;
	if (onWall(end.y, region.y)) return [{ x: end.x, y: card.y }];
	if (onWall(end.y, region.y + region.height)) return [{ x: end.x, y: card.y + card.height }];
	if (onWall(end.x, region.x)) return carriedLevel(end, card.x, card);
	if (onWall(end.x, region.x + region.width)) return carriedLevel(end, card.x + card.width, card);
	return [];
}

/**
 * A line carried on to the face of every card alone in its region it stops at.
 * @param points The line, from its source to its target.
 * @param source Where it leaves such a card, if it does.
 * @param target Where it reaches one, if it does.
 * @returns The line.
 */
function carriedLine(
	points: readonly Point[],
	source: Stop | undefined,
	target: Stop | undefined,
): Point[] {
	const before = source === undefined ? [] : carried(points[0]!, source).toReversed();
	const after = target === undefined ? [] : carried(points.at(-1)!, target);
	return [...before, ...points, ...after];
}

/**
 * The columns where lines cross a region's caption band.
 * @param region The region's box.
 * @param band The band's height.
 * @param lines Every line in the drawing.
 * @returns The columns' x.
 */
function crossingBand(region: Box, band: number, lines: readonly (readonly Point[])[]): number[] {
	return lines.flatMap((points) =>
		points.slice(1).flatMap((point, index) => {
			const previous = points[index]!;
			const spans =
				Math.min(previous.y, point.y) < region.y + band && Math.max(previous.y, point.y) > region.y;
			const within = point.x > region.x && point.x < region.x + region.width;
			return onWall(previous.x, point.x) && spans && within ? [point.x] : [];
		}),
	);
}

/**
 * Where a caption's words stand clear of some lines by some room: the
 * leftmost such place in its band, at the band's corner or just past a line.
 * @param band The band's left and right ends, where the caption's box may stand.
 * @param band.first The leftmost x.
 * @param band.last The rightmost x.
 * @param width The caption's width.
 * @param crossing The columns of the lines that cross the band.
 * @param room How far the words keep from each line.
 * @returns The caption's x, or nothing when no place is clear.
 */
function clearOf(
	{ first, last }: { first: number; last: number },
	width: number,
	crossing: readonly number[],
	room: number,
): number | undefined {
	return [first, ...crossing.map((line) => line + room - WORDS_INSET), last]
		.filter((x) => x >= first && x <= last)
		.toSorted((one, other) => one - other)
		.find((at) =>
			crossing.every(
				(line) => line <= at + WORDS_INSET - room || line >= at + width - WORDS_INSET + room,
			),
		);
}

/**
 * Where a region round one card or container puts its caption: in the
 * band's top-left corner as every region does, unless a line into the node
 * crosses the band there; then as far left as the words stand clear of
 * every line, a lane's room from each where there is room for it, or less.
 * @param region The region's box.
 * @param lone The region.
 * @param lines Every line in the drawing.
 * @returns The caption's box.
 */
function captionIn(region: Box, lone: Lone, lines: readonly (readonly Point[])[]): Box {
	const { width, height } = lone.caption;
	const crossing = crossingBand(region, bandOf(lone), lines);
	const band = {
		first: region.x + CAPTION_INSET,
		last: region.x + region.width - CAPTION_INSET - width,
	};
	const x = WORDS_ROOMS.map((room) => clearOf(band, width, crossing, room)).find(
		(at) => at !== undefined,
	);
	return { x: x ?? band.first, y: region.y + CAPTION_INSET, width, height };
}

export {
	LONE_INSET,
	bandOf,
	captionIn,
	captionsOf,
	cardAs,
	cardIn,
	carriedLine,
	frameHeader,
	frameShape,
	framed,
	grownBy,
	grownInsets,
	regionRound,
	sideRoom,
	titleRow,
	placingGroup,
	type Lone,
	type Stop,
};
