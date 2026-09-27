// Crossings on a corner. A line that crosses another within a lane of where
// either of them turns reads as a knot: the hop and the bend run into one
// another, and a reader cannot see which line turned. Curing Agent
// workbench's hook into Thread link put two such crossings above the card,
// one 9.6 px before the purple line's bend and one 12.6 px before a grey
// line's, and the drawing read worse than the hook it cured. The settlement
// chooser and the finishing passes count each one as a crossing more
// (even-pins.ts, crossingsSeen), so none of them trades into one.
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { ROUTE_LANE } from "@/transformers/semantic-renderer/lib/layout/routing-clearance";

/**
 * How near a bend's corner a crossing lies on it: nearer than a lane. A line
 * a lane over from another's corner is its neighbour, as the router draws
 * parallel lines; nearer, the hop runs into the bend's arc.
 */
const BEND_REACH = ROUTE_LANE - 0.5;

/** One straight run of a line, with whether each of its ends is a bend of that line. */
interface Run {
	readonly line: number;
	readonly from: Point;
	readonly to: Point;
	readonly bends: readonly [boolean, boolean];
}

/**
 * Every straight run of every line.
 * @param lines Each line's vertices.
 * @returns Their runs.
 */
function runsOf(lines: readonly (readonly Point[])[]): Run[] {
	return lines.flatMap((points, line) =>
		points.slice(1).map((to, index) => ({
			line,
			from: points[index]!,
			to,
			bends: [index > 0, index + 2 < points.length] as const,
		})),
	);
}

/**
 * Whether a value lies strictly between two others, clear of both, as a crossing does (track/score.ts).
 * @param value The value.
 * @param one One end.
 * @param other The other end.
 * @returns True when it is inside.
 */
function inside(value: number, one: number, other: number): boolean {
	return value > Math.min(one, other) + 1 && value < Math.max(one, other) - 1;
}

/**
 * Whether a place on a run lies within a lane of a bend at either of its ends.
 * @param run The run.
 * @param at The place along it.
 * @param axis The coordinate the run runs along.
 * @returns True when the run turns within a lane of it.
 */
function nearBend(run: Run, at: number, axis: "x" | "y"): boolean {
	return (
		(run.bends[0] && Math.abs(run.from[axis] - at) < BEND_REACH) ||
		(run.bends[1] && Math.abs(run.to[axis] - at) < BEND_REACH)
	);
}

/**
 * The places a drawing's lines cross within a lane of a bend of either line.
 * A trunk's lines crossing one line at one place count once, as a crossing does.
 * @param drawing The drawing.
 * @returns Their number.
 */
export function corneredCrossings(drawing: ArchitectureDrawing): number {
	const runs = runsOf(drawing.edges.map(({ curve }) => verticesOf(curve)));
	const level = runs.filter(({ from, to }) => Math.abs(from.y - to.y) < 0.5);
	const upright = runs.filter(({ from, to }) => Math.abs(from.x - to.x) < 0.5);
	const places = level.flatMap((one) =>
		upright
			.filter(
				(other) =>
					other.line !== one.line &&
					inside(other.from.x, one.from.x, one.to.x) &&
					inside(one.from.y, other.from.y, other.to.y) &&
					(nearBend(one, other.from.x, "x") || nearBend(other, one.from.y, "y")),
			)
			.map((other) => `${Math.round(other.from.x)},${Math.round(one.from.y)}`),
	);
	return new Set(places).size;
}
