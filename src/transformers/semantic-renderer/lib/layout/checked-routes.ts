// A settled route must pass its checks before it is drawn: as it is, or with
// its short S-jogs straightened when only they fail it.
import type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	curveClearanceIssue,
	pathOf,
	straightenedCurve,
	verticesOf,
} from "@/transformers/semantic-renderer/lib/layout/curves";

/**
 * A settled drawing whose every route passes its checks.
 * @param drawing The drawing.
 * @returns It, with each route checked by {@link checkedEdge}.
 */
export function checked(drawing: ArchitectureDrawing): ArchitectureDrawing {
	return { ...drawing, edges: drawing.edges.map((drawn) => checkedEdge(drawn)) };
}

/**
 * A settled relationship whose route passes its checks: as it is, or with its
 * short S-jogs straightened when only they fail it. Straightening one jog can
 * leave the next step of a staircase short, so it is repeated while the route
 * still changes.
 * @param drawn The settled relationship.
 * @returns The relationship.
 * @throws {Error} When the route fails its checks even straightened.
 */
function checkedEdge(drawn: DrawingEdge): DrawingEdge {
	const { edge, label } = drawn;
	if (curveClearanceIssue(drawn.curve, label?.box) === undefined) return drawn;
	const straightened = straightenedEdge(drawn);
	const issue = curveClearanceIssue(straightened.curve, straightened.label?.box);
	if (issue !== undefined) throw new Error(`Layout relationship ${edge.id}: ${issue}`);
	return straightened;
}

/**
 * A relationship with its route's short S-jogs straightened, and its label
 * carried along with the run it rides.
 * @param drawn The settled relationship.
 * @returns The relationship straightened.
 */
function straightenedEdge(drawn: DrawingEdge): DrawingEdge {
	const { label } = drawn;
	const curve = straightenedWhileFailing(drawn.curve, label?.box);
	const straightened = { ...drawn, curve, path: pathOf(curve) };
	if (label === undefined) return straightened;
	return { ...straightened, label: { ...label, box: carriedBox(label.box, drawn.curve, curve) } };
}

/**
 * A label's box moved across with the run it rides, when straightening a
 * jog moved that run sideways. The label once stayed where it was, a few
 * points off its own line.
 * @param box The label's box on the route as it was.
 * @param was The route as it was.
 * @param now The straightened route.
 * @returns The box, moved as far as its run moved.
 */
function carriedBox(box: Box, was: DrawingEdge["curve"], now: DrawingEdge["curve"]): Box {
	for (const axis of ["x", "y"] as const) {
		const centre = box[axis] + (axis === "x" ? box.width : box.height) / 2;
		const from = runAt(verticesOf(was), box, axis, centre, 1);
		const to = from === undefined ? undefined : runAt(verticesOf(now), box, axis, from, Infinity);
		if (from !== undefined && to !== undefined) return { ...box, [axis]: box[axis] + to - from };
	}
	return box;
}

/**
 * Where the route's run past a label's whole length stands across it: the
 * run nearest a given coordinate, among the runs square to one axis.
 * @param points The route's vertices.
 * @param box The label's box.
 * @param axis The axis the run stands at a coordinate of.
 * @param near The coordinate to look near.
 * @param reach How far from it the run may stand.
 * @returns The run's coordinate, or nothing when no run is within reach.
 */
function runAt(
	points: readonly Point[],
	box: Box,
	axis: "x" | "y",
	near: number,
	reach: number,
): number | undefined {
	const along = axis === "x" ? "y" : "x";
	const [low, high] = [box[along], box[along] + (axis === "x" ? box.height : box.width)];
	const runs = points.slice(1).flatMap((end, index) => {
		const start = points[index]!;
		const spans =
			Math.min(start[along], end[along]) <= low && Math.max(start[along], end[along]) >= high;
		return start[axis] === end[axis] && spans ? [start[axis]] : [];
	});
	const nearest = runs.toSorted((one, other) => Math.abs(one - near) - Math.abs(other - near))[0];
	return nearest !== undefined && Math.abs(nearest - near) <= reach ? nearest : undefined;
}

/**
 * Straighten a route's short S-jogs again while it still fails its checks and
 * straightening still changes it.
 * @param curve The route.
 * @param label Its label's box, if it carries one.
 * @returns The route straightened as far as that goes.
 */
function straightenedWhileFailing(
	curve: DrawingEdge["curve"],
	label: Box | undefined,
): DrawingEdge["curve"] {
	let current = curve;
	let next = straightenedCurve(current);
	while (curveClearanceIssue(current, label) !== undefined && pathOf(next) !== pathOf(current)) {
		current = next;
		next = straightenedCurve(current);
	}
	return current;
}
