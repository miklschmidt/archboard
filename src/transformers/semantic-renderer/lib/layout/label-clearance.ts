// Reserved labels given the clearance of a label on its own run.
//
// A label placed on its own run keeps LABEL_ROUTE_CLEARANCE (12 px) from
// every line. A reserved label is an obstacle to the router, which keeps
// lines only its buffer (ROUTE_OBSTACLE_CLEARANCE, 8 px) from it, so another
// line could pass 8 px from a reserved label and read as its label, or wedge
// it (Agent workbench's "JSON-RPC over stdio" beside "spawn the child").
// Asked for the full clearance (route-requests.ts), the router grows each
// reserved label by the difference and anchors it that much further from
// cards (routing-clearance.ts). Routed so everywhere, the same labels pushed
// lines into longer ways round in some boards: Platform Phone API went from 9
// to 12 crossings and Board rasterizer's "One browser, two uses" took 20 more
// bends. So each reading is settled and finished both ways and keeps the
// clearance only where it gives labels their clearance: fewer labels another
// line crowds and none crowded that was clear, the page and every card where
// they were, and no more crossings, bends or stacked lines. Kept wherever it
// merely cost nothing, it moved lines round boards it cured nothing in, and
// put three labels a clearance from lines that were far from them (Codex
// workhorse, Browser application's "Recording a walkthrough"). A cleared
// settlement can reserve other labels and so place the board anew, which no
// count judges: Board rasterizer's came out with a tangle of parallel lines
// between two of its frames.
import { LABEL_ROUTE_CLEARANCE } from "@/transformers/semantic-renderer/config";
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { eitherRouting } from "@/transformers/semantic-renderer/lib/layout/checked-routes";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { bendsIn, crossingsSeen } from "@/transformers/semantic-renderer/lib/layout/even-pins";
import { stackedEnds } from "@/transformers/semantic-renderer/lib/layout/stacked-runs";

/**
 * How far a straight run passes from a box.
 * @param box The box.
 * @param one The run's start.
 * @param other Its end.
 * @returns The gap between them, 0 when they meet.
 */
function gapTo(box: Box, one: Point, other: Point): number {
	const dx = Math.max(
		box.x - Math.max(one.x, other.x),
		0,
		Math.min(one.x, other.x) - box.x - box.width,
	);
	const dy = Math.max(
		box.y - Math.max(one.y, other.y),
		0,
		Math.min(one.y, other.y) - box.y - box.height,
	);
	return Math.hypot(dx, dy);
}

/**
 * The labels of a drawing that another line passes nearer than a label on its
 * own run keeps from every line, where it can read as that line's label.
 * @param drawing The drawing.
 * @returns One label<line key for every such pair.
 */
export function crowdedLabels(drawing: ArchitectureDrawing): string[] {
	const lines = drawing.edges.map(({ edge, curve }) => [edge.id, verticesOf(curve)] as const);
	return drawing.edges.flatMap(({ edge, label }) =>
		label === undefined
			? []
			: lines.flatMap(([id, points]) =>
					id !== edge.id &&
					points
						.slice(1)
						.some(
							(point, index) =>
								gapTo(label.box, points[index]!, point) < LABEL_ROUTE_CLEARANCE - 0.5,
						)
						? [`${edge.id}<${id}`]
						: [],
				),
	);
}

/**
 * What a finished drawing is weighed on: its crossings, those its stacks
 * hide included, its bends and the lines it leaves on another's stroke.
 * @param drawing The drawing.
 * @returns Its crossings, bends and stacked line ends.
 */
function weighed(drawing: ArchitectureDrawing): readonly number[] {
	return [crossingsSeen(drawing), bendsIn(drawing), stackedEnds(drawing).length];
}

/**
 * A drawing's page and the boxes of its cards and frames.
 * @param drawing The drawing.
 * @returns The page first, then each card and frame in the drawing's order.
 */
function placedBoxes(drawing: ArchitectureDrawing): Box[] {
	return [
		{ x: 0, y: 0, width: drawing.width, height: drawing.height },
		...[...drawing.cards, ...drawing.containers].map(({ box }) => box),
	];
}

/**
 * Whether two drawings place every card and frame alike on a page of one size.
 * @param one A drawing.
 * @param other Another.
 * @returns True when only their routes and labels differ.
 */
function samePlacement(one: ArchitectureDrawing, other: ArchitectureDrawing): boolean {
	const theirs = placedBoxes(other);
	return placedBoxes(one).every(
		(box, index) =>
			Math.abs(box.x - theirs[index]!.x) < 0.5 &&
			Math.abs(box.y - theirs[index]!.y) < 0.5 &&
			Math.abs(box.width - theirs[index]!.width) < 0.5 &&
			Math.abs(box.height - theirs[index]!.height) < 0.5,
	);
}

/**
 * Whether the cleared drawing gives labels their clearance and costs nothing
 * else: fewer labels another line crowds and none crowded that was clear,
 * the page and every card and frame where they were, and no more crossings,
 * bends or stacked lines.
 * @param cleared The drawing with reserved labels' full clearance.
 * @param ordinary The drawing with the router's buffer round them.
 * @returns True when the cleared drawing is kept.
 */
function clearer(cleared: ArchitectureDrawing, ordinary: ArchitectureDrawing): boolean {
	const [crowded, clear] = [new Set(crowdedLabels(ordinary)), crowdedLabels(cleared)];
	const [wide, narrow] = [weighed(cleared), weighed(ordinary)];
	return (
		clear.length < crowded.size &&
		clear.every((key) => crowded.has(key)) &&
		samePlacement(cleared, ordinary) &&
		wide.every((value, index) => value <= narrow[index]!)
	);
}

/**
 * The drawing routed with reserved labels' full clearance where it gives
 * labels clearance: fewer labels crowded by another line and none crowded
 * that was clear ({@link crowdedLabels}), the page and every card and frame
 * where they were, and no more crossings, bends or stacked lines than the
 * ordinary drawing. A drawing the router refuses leaves the other; a fault in
 * either is thrown.
 * @param ordinary The finished drawing with the router's buffer round reserved labels.
 * @param cleared The finished drawing with their full clearance.
 * @returns The drawing kept.
 */
export async function clearerDrawing(
	ordinary: Promise<ArchitectureDrawing>,
	cleared: Promise<ArchitectureDrawing>,
): Promise<ArchitectureDrawing> {
	const [one, other] = await eitherRouting(ordinary, cleared);
	if (one === undefined || other === undefined) return (one ?? other)!;
	return clearer(other, one) ? other : one;
}
