// libavoid joins the pins of one class to a point at their shape's centre and
// charges each pin its distance from there. A pin in the middle of a face then
// wins over a side pin that a route reaches with less length, so a line to a
// target beside and just below its card drops out of the bottom and runs under
// the trunk its siblings leave along, and every one of them hops it (Command
// interface's "lifecycle command", Skill evaluation's "One author run"). Evening
// that charge lets a line leave on the side it travels.
//
// Evened pins move routes, so they move where labels land, which labels are
// reserved, and the placement those reservations buy. That can fall either way
// for a whole drawing: with evened pins no release of Browser application's
// reserved rows kept its crossings down, so it stayed 2734 wide instead of
// 2156 and drew 24 crossings instead of 15. Each reading is therefore settled
// both ways and the tidier drawing is kept: fewer crossings, then fewer bends,
// then less line.
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { crossingsOf } from "@/transformers/semantic-renderer/lib/track/score";

/** The routing option that asks for evened pins. */
const EVEN_PINS = "archboard.route.even-pins";

/**
 * The cost that evens out libavoid's charge for reaching a pin from its
 * shape's centre, so every pin of a shape costs the same in total.
 * @param box The shape's routing box.
 * @param at The pin's proportional position on it.
 * @param inset How far inside the routing box the pin stands on a side face.
 * @returns The pin's connection cost.
 */
function centreHandicap(box: Box, at: Point, inset: number): number {
	const dx = Math.abs(at.x - 0.5) * box.width - (at.x === 0 || at.x === 1 ? inset : 0);
	const dy = Math.abs(at.y - 0.5) * box.height - (at.y === 0 || at.y === 1 ? inset : 0);
	return box.width / 2 + box.height / 2 - dx - dy;
}

/**
 * How long an orthogonal line is.
 * @param points Its vertices.
 * @returns The length of its runs.
 */
function lengthOf(points: readonly Point[]): number {
	return points
		.slice(1)
		.reduce(
			(sum, point, index) =>
				sum + Math.abs(point.x - points[index]!.x) + Math.abs(point.y - points[index]!.y),
			0,
		);
}

/**
 * What a drawing is ranked on, most important first.
 * @param drawing A settled drawing.
 * @returns Its crossings, counted as the places a reader sees one, bends and line length.
 */
function untidiness(drawing: ArchitectureDrawing): readonly number[] {
	const lines = drawing.edges.map(({ curve }) => verticesOf(curve));
	return [
		crossingsOf(lines),
		lines.reduce((sum, points) => sum + points.length - 2, 0),
		lines.reduce((sum, points) => sum + lengthOf(points), 0),
	];
}

/**
 * Whether one drawing is tidier than another.
 * @param one The challenger.
 * @param other The drawing kept so far, which wins a tie.
 * @returns True when the challenger ranks strictly better.
 */
function tidierThan(one: ArchitectureDrawing, other: ArchitectureDrawing): boolean {
	const [mine, theirs] = [untidiness(one), untidiness(other)];
	const index = mine.findIndex((value, at) => Math.abs(value - theirs[at]!) > 0.5);
	return index !== -1 && mine[index]! < theirs[index]!;
}

/**
 * The tidier of a reading settled with plain pins and with evened pins. A
 * settlement the router refuses leaves the other; both refused is refused.
 * @param plain The reading settled with plain pins.
 * @param even The reading settled with evened pins.
 * @returns The settlement kept.
 */
async function tidierSettlement<Settled extends { readonly drawing: ArchitectureDrawing }>(
	plain: Promise<Settled>,
	even: Promise<Settled>,
): Promise<Settled> {
	const [one, other] = await Promise.allSettled([plain, even]);
	if (other.status === "rejected") return plain;
	if (one.status === "rejected") return other.value;
	return tidierThan(other.value.drawing, one.value.drawing) ? other.value : one.value;
}

export { EVEN_PINS, centreHandicap, tidierSettlement, untidiness };
