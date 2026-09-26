// A frame is drawn CONTAINER_INSET around its cards, and a card's routing box
// reaches CARD_ROUTE_CLEARANCE out from it: the same 20 px. So the edge of the
// routing box of every card on a frame's west, east or south inset is the
// frame's wall, and libavoid, which builds its channels on routing-box edges,
// runs lines exactly on the wall, where the frame edge takes the line's colour
// (Board viewer's "draw it here", the Auditlog views). A card facing a wall a
// route is asked to clear reaches further out, so its routing box ends a lane
// beyond the wall where the passage has room and lines keep off it: ended half
// a lane out, a line out of the Auditlog "One timestamp type" view's Portal
// API frame still traced the frame's outline 8 px off it. The reach never
// takes more than half of the free passage in front of that face, so a line
// can still pass between the frame and its neighbour. A passage too narrow to
// keep a line even half a clearance off the wall can only carry a line along
// it, so the face reaches across it and closes it: a line into Board viewer's
// Archboard server, which stands the cluster margin outside the frame, ran
// 1 px inside the wall between it and Picture cache. Which walls to clear is
// the finishing step's choice (finishing.ts).
import type { ElkNode } from "@archboard/elk-rs";
import { ROUTE_OPEN_CORRIDOR } from "@/transformers/semantic-renderer/config";
import { inflate, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import {
	boxOf,
	obstacleOf,
	type Face,
} from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import {
	CARD_ROUTE_CLEARANCE,
	CARD_ROUTE_EXPANSION,
	ROUTE_LANE,
	WALL_CLEARANCE,
} from "@/transformers/semantic-renderer/lib/layout/routing-clearance";

/** How far a routing box reaches past its visible shape on each face. */
export type Insets = Readonly<Record<Face, number>>;

/** A placed node and the frames it stands in, outermost first. */
interface Placed {
	readonly node: ElkNode;
	readonly frames: readonly ElkNode[];
}

const NO_REACH: Insets = { NORTH: 0, SOUTH: 0, WEST: 0, EAST: 0 };

/** The faces that can stand on a frame wall; a card's north faces a title band or a sibling. */
export const WALL_FACES = ["WEST", "EAST", "SOUTH"] as const;
export type WallFace = (typeof WALL_FACES)[number];

/**
 * The key naming one wall of a frame.
 * @param frame The frame's id.
 * @param face The side of it.
 * @returns The key.
 */
export function wallOf(frame: string, face: WallFace): string {
	return `${frame}:${face}`;
}

/**
 * Every placed node with its frame ancestry.
 * @param nodes Nodes at one level.
 * @param frames The frames above them.
 * @returns The nodes of the whole hierarchy.
 */
function placedNodes(nodes: readonly ElkNode[], frames: readonly ElkNode[] = []): Placed[] {
	return nodes.flatMap((node) => [
		{ node, frames },
		...placedNodes(node.children ?? [], [...frames, node]),
	]);
}

/**
 * A box turned so that one of its faces looks west: the face's outward
 * distances become distances toward smaller x, and its span runs along y.
 * @param box The box.
 * @param face The face to turn west.
 * @returns The turned box.
 */
function turned(box: Box, face: WallFace): Box {
	if (face === "WEST") return box;
	if (face === "EAST") return { ...box, x: -(box.x + box.width) };
	return { x: -(box.y + box.height), y: box.x, width: box.height, height: box.width };
}

/**
 * The gap from one routing footprint to another in front of one of its faces.
 * @param own The card's footprint, turned so the face looks west.
 * @param other Another node's footprint, turned the same way.
 * @returns The gap, or nothing when the other does not stand in front of the face.
 */
function gapInFront(own: Box, other: Box): number | undefined {
	if (other.y >= own.y + own.height || own.y >= other.y + other.height) return undefined;
	const gap = own.x - other.x - other.width;
	return gap < -0.001 ? undefined : gap;
}

/**
 * How far one face of a card reaches past its ordinary routing box.
 * @param card The card's box.
 * @param frame Its frame's box.
 * @param face The face.
 * @param others Footprints of every node outside the frame and not holding it.
 * @returns The extra reach: enough to end a lane outside the wall, within half the free passage in
 * front, and the whole passage when half of it would hold a line too close to the wall.
 */
function faceReach(card: Box, frame: Box, face: WallFace, others: readonly Box[]): number {
	const clear = turned(card, face).x - turned(frame, face).x - CARD_ROUTE_CLEARANCE;
	if (clear >= ROUTE_LANE || clear <= -WALL_CLEARANCE) return 0;
	const own = turned(inflate(card, CARD_ROUTE_CLEARANCE), face);
	const passage = Math.min(
		...others.flatMap((other) => {
			const gap = gapInFront(own, turned(other, face));
			return gap === undefined ? [] : [gap];
		}),
	);
	const room = (passage - ROUTE_OPEN_CORRIDOR) / 2;
	if (room < WALL_CLEARANCE / 2) return passage;
	return Math.min(ROUTE_LANE - clear, room);
}

/**
 * The reach of each card whose routing box would otherwise end on or just inside a wall to clear.
 * @param graph The placed graph.
 * @param clear The walls to clear, as {@link wallOf} keys.
 * @returns Extra reach per face, by card id; cards facing no wall to clear are absent.
 */
export function wallReach(graph: ElkNode, clear: readonly string[]): ReadonlyMap<string, Insets> {
	const walls = new Set(clear);
	if (walls.size === 0) return new Map();
	const placed = placedNodes(graph.children ?? []);
	return new Map(
		placed.flatMap((card) => {
			const reach = cardReach(card, placed, walls);
			return reach === undefined ? [] : [[card.node.id, reach] as const];
		}),
	);
}

/**
 * The reach of one card toward its frame's walls.
 * @param card A placed node and its frames.
 * @param placed Every placed node.
 * @param walls The walls to clear.
 * @returns Its reach, or nothing for a frame, a card outside any frame, or a card clear of its walls.
 */
function cardReach(
	card: Placed,
	placed: readonly Placed[],
	walls: ReadonlySet<string>,
): Insets | undefined {
	const frame = card.frames.at(-1);
	if (card.node.children?.length || frame === undefined) return undefined;
	const others = placed
		.filter((other) => other.node !== frame && !other.frames.includes(frame))
		.filter((other) => !card.frames.includes(other.node))
		.map((other) => inflate(obstacleOf(other.node), CARD_ROUTE_CLEARANCE));
	const [box, wall] = [boxOf(card.node), boxOf(frame)];
	const faces = Object.fromEntries(
		WALL_FACES.map((face) => [
			face,
			walls.has(wallOf(frame.id, face)) ? faceReach(box, wall, face, others) : 0,
		]),
	);
	return Object.values(faces).some((value) => value > 0) ? { ...NO_REACH, ...faces } : undefined;
}

/**
 * How far a native obstacle's routing box reaches past its visible shape.
 * @param node The semantic node, absent for labels and frame-arrival corridors.
 * @param reach Its extra reach toward frame walls, if any.
 * @returns The inset of a pin on each face, which keeps the endpoint on the visible border.
 */
export function routingInsets(node: ElkNode | undefined, reach: Insets = NO_REACH): Insets {
	if (node === undefined) return NO_REACH;
	return {
		NORTH: CARD_ROUTE_EXPANSION + reach.NORTH,
		SOUTH: CARD_ROUTE_EXPANSION + reach.SOUTH,
		WEST: CARD_ROUTE_EXPANSION + reach.WEST,
		EAST: CARD_ROUTE_EXPANSION + reach.EAST,
	};
}

/**
 * Where a pin stands on a routing box whose faces reach out by different amounts.
 * @param box The routing box.
 * @param inset How far each face reaches past the visible shape.
 * @param side The face's centre coordinates and outward direction.
 * @param position The along-face position on the visible shape.
 * @returns The pin's proportional position on the routing box, and how far inside it stands.
 */
export function pinPlacement(
	box: Box,
	inset: Insets,
	side: readonly [number, number, number],
	position: number,
): { at: { x: number; y: number }; offset: number } {
	const [x, y] = side;
	const across = (inset.WEST + (box.width - inset.WEST - inset.EAST) * position) / box.width;
	const down = (inset.NORTH + (box.height - inset.NORTH - inset.SOUTH) * position) / box.height;
	return {
		at: { x: x === 0.5 ? across : x, y: y === 0.5 ? down : y },
		offset: inset[faceAt(x, y)],
	};
}

/**
 * The face a proportional pin position lies on.
 * @param x Its position across the shape.
 * @param y Its position down the shape.
 * @returns The face.
 */
function faceAt(x: number, y: number): Face {
	if (x === 0) return "WEST";
	if (x === 1) return "EAST";
	return y === 0 ? "NORTH" : "SOUTH";
}

/**
 * Grow a box by a different amount on each face.
 * @param box The visible shape.
 * @param insets How far to grow each face.
 * @returns The routing box.
 */
export function grown(box: Box, insets: Insets): Box {
	return {
		x: box.x - insets.WEST,
		y: box.y - insets.NORTH,
		width: box.width + insets.WEST + insets.EAST,
		height: box.height + insets.NORTH + insets.SOUTH,
	};
}
