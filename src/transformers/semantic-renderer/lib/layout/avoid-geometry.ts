import type { ElkNode } from "@archboard/elk-rs";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
/** A physical face of a card or frame. */
export const FACES = ["NORTH", "SOUTH", "WEST", "EAST"] as const;
export type Face = (typeof FACES)[number];

/** Center coordinates and libavoid outward direction of each shared face pin. */
export const SIDES: Record<Face, readonly [number, number, number]> = {
	NORTH: [0.5, 0, 1],
	SOUTH: [0.5, 1, 2],
	WEST: [0, 0.5, 4],
	EAST: [1, 0.5, 8],
};

/**
 * Read complete finite placement geometry.
 * @param node A placed shape.
 * @returns Its finite box.
 */
export function boxOf(node: Partial<Box> & { id?: string }): Box {
	const { x, y, width, height } = node;
	if (x === undefined || y === undefined || width === undefined || height === undefined)
		throw new Error(`Layout omitted geometry for ${node.id}`);
	if (![x, y, width, height].every(Number.isFinite))
		throw new Error(`Layout omitted finite geometry for ${node.id}`);
	return { x, y, width, height };
}

/**
 * The solid card or measured title band of a frame.
 * @param node A placed semantic node.
 * @returns The obstacle a route must avoid.
 */
export function obstacleOf(node: ElkNode): Box {
	const box = boxOf(node);
	if (!node.children?.length) return box;
	const options = node.layoutOptions ?? {};
	const size = Number(options["archboard.header.size"]);
	return { ...box, height: size };
}

/**
 * Locate a shared relationship-kind pin on a physical face.
 * @param box The semantic shape or title band.
 * @param side Its face.
 * @param position The proportional position along that face.
 * @returns The visible endpoint.
 */
export function facePoint(box: Box, side: Face, position = 0.5): Point {
	const [x, y] = SIDES[side];
	return {
		x: box.x + (x === 0.5 ? position : x) * box.width,
		y: box.y + (y === 0.5 ? position : y) * box.height,
	};
}

/**
 * Place a shared arrival on the frame perimeter, below its title on vertical sides.
 * The transparent body can reserve a whole arrow approach without overlapping
 * the separate solid title obstacle.
 * @param node The destination frame.
 * @param side Its candidate perimeter face.
 * @param position The shared relationship-kind fraction along that face.
 * @returns A point on the visible frame perimeter.
 */
export function frameArrivalPoint(node: ElkNode, side: Face, position: number): Point {
	const box = boxOf(node);
	if (side === "NORTH" || side === "SOUTH") return facePoint(box, side, position);
	const header = obstacleOf(node).height;
	return facePoint({ ...box, y: box.y + header, height: box.height - header }, side, position);
}

/**
 * Whether a semantic frame contains another semantic node.
 * @param outer The frame.
 * @param inner The candidate descendant.
 * @returns Whether all four edges lie within the frame.
 */
export function contains(outer: Box, inner: Box): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

/**
 * Whether two physical routing footprints occupy the same area.
 * @param one The first footprint.
 * @param other The second footprint.
 * @returns True when their interiors overlap on both axes.
 */
export function boxesOverlap(one: Box, other: Box): boolean {
	return (
		one.x < other.x + other.width &&
		one.x + one.width > other.x &&
		one.y < other.y + other.height &&
		one.y + one.height > other.y
	);
}
