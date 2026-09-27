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
import { crossingPlaces, type Run } from "@/transformers/semantic-renderer/lib/track/score";

/**
 * How near a bend's corner a crossing lies on it: nearer than a lane. A line
 * a lane over from another's corner is its neighbour, as the router draws
 * parallel lines; nearer, the hop runs into the bend's arc.
 */
const BEND_REACH = ROUTE_LANE - 0.5;

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
 * The places a drawing's lines cross ({@link crossingPlaces}) within a lane
 * of a bend of either line. A trunk's lines crossing one line at one place
 * count once, as a crossing does.
 * @param drawing The drawing.
 * @returns Their number.
 */
export function corneredCrossings(drawing: ArchitectureDrawing): number {
	return corneredAmong(drawing.edges.map(({ curve }) => verticesOf(curve)));
}

/**
 * The places some lines cross within a lane of a bend of either line, as
 * {@link corneredCrossings} counts them.
 * @param lines Every line's corners.
 * @returns Their number.
 */
export function corneredAmong(lines: readonly (readonly Point[])[]): number {
	const places = crossingPlaces(lines).filter(
		({ level, upright }) =>
			nearBend(level, upright.from.x, "x") || nearBend(upright, level.from.y, "y"),
	);
	return new Set(places.map(({ key }) => key)).size;
}
