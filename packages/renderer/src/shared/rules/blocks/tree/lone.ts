// A card or container alone in its group's region (ADR 0038, amended
// 2026-09-27). Such a region gathers nothing, so the blocks lay it out as the
// node itself, with a box grown by the region's inset and caption band:
// placement and routing see one obstacle where the board without the region
// saw one. A caption wider than the node widens the region, not the node,
// which stands in its middle. Once drawn, the node is put back inside that
// box and the region drawn round it; a line that stopped on the region's wall
// is carried on to the card's face.
import type { ElkNode } from "@archboard/elk-rs";
import { REGION_INSET } from "#shared/constants/spacing.ts";
import type { Box, Point } from "#shared/rules/geometry.ts";
import { z } from "zod";
import { GROUP_CAPTIONS, PLACING_GROUP } from "#shared/rules/layout/compound-graph.ts";
import { cardOf, type Card } from "#shared/rules/blocks/cards/card.ts";
import { stepsOf, type Header } from "#shared/rules/blocks/cards/headers.ts";
import { CAPTION_INSET, type Insets } from "#shared/rules/blocks/tree/laid.ts";
import type { FrameShape } from "#shared/rules/track/scene/containers.ts";
import {
	TRACK_BELOW,
	TRACK_STEPS,
	TRACK_TITLE,
	TRACK_WIDE,
} from "#shared/rules/track/scene/scene.ts";
import { ARCHITECTURE_HEADER_PADDING } from "#shared/constants/design.ts";

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

/**
 * A node alone in its group's region: the group, its caption's size, and
 * how the region stands round the node when its caption widens it.
 */
interface Lone {
	readonly group: string;
	readonly caption: Size;
	/** A card's width: a caption wider than the card widens the region round it, not the card. */
	readonly width?: number;
	/**
	 * How far a container a block lays out stands in from each side of its
	 * region, once laid out narrower than its caption ({@link widened}).
	 */
	readonly room?: number;
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
 * The band above the node that holds the region's caption: its tab, which
 * reaches the caption's foot, and the region's inset under it, as at its
 * sides and below.
 * @param lone The region.
 * @returns Its height.
 */
function bandOf(lone: Lone): number {
	return CAPTION_INSET + lone.caption.height + REGION_INSET;
}

/**
 * How wide a region's caption needs it: the caption and its inset on each side.
 * @param lone The region.
 * @returns The width.
 */
function captionWidth(lone: Lone): number {
	return lone.caption.width + 2 * CAPTION_INSET;
}

/**
 * A container a block lays out alone in its region, laid out once as that
 * region, when its caption needs the region wider: the region then keeps
 * the container as wide as it was laid out and stands it in the middle, as
 * it does a card.
 * @param lone The region, before the container is laid out.
 * @param width The width the region took round it.
 * @returns The region, with the room it keeps round the container; nothing when the caption fits.
 */
function widened(lone: Lone, width: number): Lone | undefined {
	const short = captionWidth(lone) - width;
	return short > 0 ? { ...lone, room: REGION_INSET + short / 2 } : undefined;
}

/**
 * How much taller a region round one node stands than the node: its caption
 * band above and its inset below.
 * @param lone The region.
 * @returns The height it adds.
 */
function grownBy(lone: Lone): number {
	return bandOf(lone) + REGION_INSET;
}

/**
 * A container's header: its title row, and the caption band above it when
 * it is alone in its region.
 * @param node The measured container.
 * @param band How much the caption band adds, when it is alone in its region.
 * @returns The header's size.
 */
function frameHeader(node: ElkNode, band = 0): Header {
	const header = Number(node.layoutOptions?.["archboard.header.size"] ?? 0);
	return { width: node.width!, height: Math.max(1, header) + band, ...stepsOf(node, band) };
}

/**
 * A container as a block of its own: its header, holding the caption band
 * above its title row when it is alone in its region, and that region.
 * @param node The measured container.
 * @param lone Its region, if it is alone in one.
 * @returns What the block is of.
 */
function framed(node: ElkNode, lone: Lone | undefined): { header: Header; lone: Lone | undefined } {
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
		width: Math.max(card.width + 2 * REGION_INSET, captionWidth(lone)),
		height: card.height + bandOf(lone) + REGION_INSET,
	};
}

/**
 * The card's or container's own box inside the box its region took: a card,
 * or a container a block lays out, no wider than itself in the middle of a
 * region its caption widens.
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
		height: region.height - bandOf(lone) - REGION_INSET,
	};
}

/**
 * How far in from each side of the box its region took a card or container
 * stands: the region's inset, or more round a node its caption widens the
 * region past.
 * @param width The box's width.
 * @param lone The region.
 * @returns The room.
 */
function sideRoom(width: number, lone: Lone): number {
	if (lone.width === undefined) return roomOf(lone);
	return Math.max(REGION_INSET, (width - lone.width) / 2);
}

/**
 * How wide a container is in a block of some width: the block's width, or
 * alone in its region, the width it stands at inside the region (`cardIn`).
 * @param block The container's block.
 * @param block.lone Its region, if it is alone in one.
 * @param width The block's width.
 * @returns The container's width.
 */
function frameWidth(block: { readonly lone?: Lone | undefined }, width: number): number {
	return block.lone === undefined ? width : width - 2 * sideRoom(width, block.lone);
}

/**
 * How far in from each side of its region a container stands: the region's
 * inset, or the room a block keeps round it in a region its caption widens.
 * @param lone The region.
 * @returns The room.
 */
function roomOf(lone: Lone): number {
	return lone.room ?? REGION_INSET;
}

/**
 * The title row a container drawn inline gives the track scene, and the room
 * it keeps below what it holds. Alone in its region, the scene reads it as
 * the region: its title row holds the caption band above the title, it
 * keeps the region's inset more below, and it stands as wide as the caption
 * needs.
 * @param bounds The container's cluster's box.
 * @param head Its header: the height its title's centre stands at, its height, and how far its title's words reach in.
 * @param head.centre The height of its centre.
 * @param head.height Its height.
 * @param head.words How far its title's words reach in from its left edge.
 * @param head.steps Each wider size its title row can take, when it has more than one (`headers.ts`).
 * @param lone Its region, if it is alone in one.
 * @returns The layout options that carry them.
 */
function titleRow(
	bounds: Box,
	head: { centre: number; height: number; words: number; steps?: readonly Size[] | undefined },
	lone: Lone | undefined,
): Record<string, string> {
	const { centre, height, words, steps } = head;
	const row = [
		bounds.x,
		centre - height / 2,
		bounds.width,
		height,
		words,
		lone === undefined ? 0 : bandOf(lone),
	];
	return {
		[TRACK_TITLE]: row.join(","),
		...(steps === undefined
			? {}
			: {
					[TRACK_STEPS]: JSON.stringify(
						steps.map((step) => [step.width - ARCHITECTURE_HEADER_PADDING, step.height]),
					),
				}),
		...(lone === undefined
			? {}
			: { [TRACK_BELOW]: String(REGION_INSET), [TRACK_WIDE]: String(captionWidth(lone)) }),
	};
}

/**
 * A container drawn inline, laid out as the region it is alone in: its own
 * box inside the box the scene fitted round what it holds.
 * @param shape The container's shape as the scene fitted it.
 * @param lone Its region, if it is alone in one.
 * @returns Its shape.
 */
function frameShape(shape: FrameShape, lone: Lone | undefined): FrameShape {
	return lone === undefined ? shape : { ...shape, box: cardIn(shape.box, lone) };
}

/**
 * How wide a block drawing a container inline lays its title row out: as
 * wide as its title, or alone in its region, as wide as keeps room for the
 * region's caption beside what it holds.
 * @param frame The container: its title row, and its region if it is alone in one.
 * @param frame.header Its title row.
 * @param frame.lone Its region, if it is alone in one.
 * @param inset The room it keeps round what it holds, as laid out.
 * @returns The width.
 */
function titleWidth(frame: { header: Size; lone?: Lone }, inset: number): number {
	const { header, lone } = frame;
	return lone === undefined ? header.width : Math.max(header.width, captionWidth(lone) - 2 * inset);
}

/**
 * The room a container alone in its region keeps around what it holds: the
 * region's room round the container more on its sides, and its inset more
 * below. The caption band stands in its header.
 * @param insets The room it keeps alone in no region.
 * @param lone Its region, if it is alone in one.
 * @returns Its insets.
 */
function grownInsets(insets: Insets, lone: Lone | undefined): Insets {
	if (lone === undefined) return insets;
	return { ...insets, side: insets.side + roomOf(lone), bottom: insets.bottom + REGION_INSET };
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
	bandOf,
	captionIn,
	captionsOf,
	cardAs,
	cardIn,
	carriedLine,
	frameHeader,
	frameWidth,
	frameShape,
	framed,
	grownBy,
	grownInsets,
	roomOf,
	sideRoom,
	titleRow,
	titleWidth,
	placingGroup,
	widened,
	type Lone,
	type Stop,
};
