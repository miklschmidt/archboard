// Crowding between crossing arcs and junction marks in a rendered diagram.

import type { DrawnPoint } from "#tests/runtime/support/drawn-routes.ts";

/** Engine coordinates carry floating noise, so a piece straight to the eye is straight here. */
const STRAIGHT = 0.01;

/** Routes this close across share one drawn line. */
const SHARED_INK = 2;

/** Clear space two arcs keep between them before they read as one knot. */
const ARC_SPACE = 6;

/** Clear space an arc keeps from a junction mark. */
const MARK_SPACE = 3;

/** One arc of a route: the line it leaves, which way it bulges, and its box. */
type DrawnArc = {
	readonly id: string;
	readonly axis: "x" | "y";
	readonly line: number;
	readonly side: number;
	readonly feet: readonly [DrawnPoint, DrawnPoint];
	readonly box: Box;
};

/** A box, by its low and high corners. */
type Box = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

/**
 * How far apart two boxes lie: the larger of their gaps across and down.
 * @param a A box.
 * @param b Another.
 * @returns The gap, negative where the boxes overlap.
 */
function gapOf(a: Box, b: Box): number {
	return Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
}

/** One drawn arc and the copies carried by other members of its trunk. */
type ArcCopies = [DrawnArc, ...DrawnArc[]];

/**
 * Group the copies of an arc that the members of a trunk carry.
 * @param arcs The arcs drawn by every route.
 * @returns The arcs, each with the copies shifted onto its members' runs.
 */
function arcCopies(arcs: readonly DrawnArc[]): ArcCopies[] {
	const groups: ArcCopies[] = [];
	for (const arc of arcs) {
		const matching: ArcCopies[] = [];
		const other: ArcCopies[] = [];
		for (const group of groups) {
			if (group.some((member) => sameArc(member, arc))) matching.push(group);
			else other.push(group);
		}
		const [first, ...rest] = matching.flat();
		groups.length = 0;
		groups.push(...other, first === undefined ? [arc] : [first, ...rest, arc]);
	}
	return groups;
}

/**
 * Whether two routes carry the same arc on a trunk.
 * @param one An arc.
 * @param other Another arc.
 * @returns True when the two arcs share their baseline and bounds.
 */
function sameArc(one: DrawnArc, other: DrawnArc): boolean {
	const corners: (keyof Box)[] = ["x0", "y0", "x1", "y1"];
	return (
		one.axis === other.axis &&
		Math.abs(one.line - other.line) <= SHARED_INK &&
		corners.every(
			(corner) => Math.abs(one.box[corner] - other.box[corner]) <= SHARED_INK + STRAIGHT,
		)
	);
}

/**
 * The crosswise arcs that actually overlap, including shifted trunk copies.
 * @param copies The first arc with the rest of its trunk.
 * @param crossed The other arc with the rest of its trunk.
 * @returns One overlapping pair, if any.
 */
function crosswiseOverlap(copies: ArcCopies, crossed: ArcCopies): [DrawnArc, DrawnArc] | undefined {
	for (const arc of copies) {
		const other = crossed.find((copy) => gapOf(arc.box, copy.box) < -STRAIGHT);
		if (other !== undefined) return [arc, other];
	}
	return undefined;
}

/**
 * How two parallel arcs crowd each other.
 * @param one An arc.
 * @param other Another arc on the same axis.
 * @returns The kind of crowding, when there is any.
 */
function parallelCrowding(one: DrawnArc, other: DrawnArc): string | undefined {
	if (gapOf(one.box, other.box) >= ARC_SPACE) return undefined;
	const apart = other.line - one.line;
	if (Math.abs(apart) <= SHARED_INK) return "side by side";
	return one.side === Math.sign(apart) && other.side === -one.side ? "facing" : undefined;
}

/**
 * Every place two arcs, or an arc and a junction mark, crowd each other.
 * The routes of one trunk draw one arc each, and those count once.
 * @param drawn The arcs drawn by every route.
 * @param marks The bounds of the junction marks.
 * @returns Each such place, by what crowds and where.
 */
function arcCrowding(drawn: readonly DrawnArc[], marks: readonly Box[]): string[] {
	const arcs = arcCopies(drawn);
	const found: string[] = [];
	for (const [index, copies] of arcs.entries())
		for (const crossed of arcs.slice(index + 1)) {
			const [one] = copies;
			const [other] = crossed;
			if (one.axis !== other.axis) {
				const overlap = crosswiseOverlap(copies, crossed);
				if (overlap !== undefined) {
					const [a, b] = overlap;
					const corner = cornerOf({
						x0: Math.max(a.box.x0, b.box.x0),
						y0: Math.max(a.box.y0, b.box.y0),
					});
					found.push(`${a.id} and ${b.id} overlapping crosswise at ${corner}`);
				}
				continue;
			}
			const crowding = parallelCrowding(one, other);
			if (crowding !== undefined)
				found.push(`${one.id} and ${other.id} ${crowding} at ${cornerOf(one.box)}`);
		}
	return found.concat(crowdedJunctions(marks, arcs));
}

/**
 * Every junction mark an arc bulges into.
 * @param marks The junction marks.
 * @param arcs The arcs, each with its trunk copies.
 * @returns Each crowding arc and junction.
 */
function crowdedJunctions(marks: readonly Box[], arcs: ArcCopies[]): string[] {
	const found: string[] = [];
	for (const box of marks) {
		const [x, y] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
		for (const [arc] of arcs) {
			const [along, beside, low, high] =
				arc.axis === "x" ? [x, y, arc.box.x0, arc.box.x1] : [y, x, arc.box.y0, arc.box.y1];
			const apart = beside - arc.line;
			const into =
				along > low &&
				along < high &&
				Math.abs(apart) > SHARED_INK &&
				Math.sign(apart) === arc.side;
			if (into && gapOf(arc.box, box) < MARK_SPACE)
				found.push(`${arc.id} bulging into a junction at ${cornerOf(box)}`);
		}
	}
	return found;
}

/**
 * A box's low corner, for a drawing diagnostic.
 * @param box The box's low bounds.
 * @returns Its coordinates.
 */
function cornerOf(box: Pick<Box, "x0" | "y0">): string {
	return `${box.x0.toFixed(1)},${box.y0.toFixed(1)}`;
}

export { ARC_SPACE, STRAIGHT, arcCrowding, cornerOf, type Box, type DrawnArc };
