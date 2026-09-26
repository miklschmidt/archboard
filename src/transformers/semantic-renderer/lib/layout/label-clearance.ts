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
// clearance only where it gives labels their clearance: no more labels
// another line crowds, and a drawing no untidier than the ordinary one where
// it crowds fewer, or tidier where it crowds as many, judged as plain and
// evened pins are (even-pins.ts). Kept wherever it merely cost nothing, it
// moved lines round boards it cured nothing in, and put three labels a
// clearance from lines that were far from them (Codex workhorse, Browser
// application's "Recording a walkthrough"). A cleared settlement can reserve
// other labels and so place the board anew; held to the ordinary placement,
// it was judged on its page alone, and What the CLI can be asked kept 10
// crossings and a trunk of two unrelated lines where the cleared placement
// drew 4 and none.
import { LABEL_ROUTE_CLEARANCE } from "@/transformers/semantic-renderer/config";
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { eitherRouting } from "@/transformers/semantic-renderer/lib/layout/checked-routes";
import { verticesOf } from "@/transformers/semantic-renderer/lib/layout/curves";
import { tidierThan } from "@/transformers/semantic-renderer/lib/layout/even-pins";

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
 * Whether the cleared drawing is kept: no more labels another line crowds,
 * and a drawing tidier than the ordinary one, each label it clears counted as
 * a defect saved (even-pins.ts). A cleared drawing that clears no label is
 * another settlement of the same reading, kept where it is tidier: What the
 * CLI can be asked drew 4 crossings so where the ordinary drawing drew 10.
 * @param cleared The drawing with reserved labels' full clearance.
 * @param ordinary The drawing with the router's buffer round them.
 * @returns True when the cleared drawing is kept.
 */
function clearer(cleared: ArchitectureDrawing, ordinary: ArchitectureDrawing): boolean {
	const [clear, crowded] = [crowdedLabels(cleared).length, crowdedLabels(ordinary).length];
	if (clear > crowded) return false;
	return tidierThan(cleared, ordinary, crowded - clear);
}

/**
 * The drawing routed with reserved labels' full clearance where it gives
 * labels clearance and costs nothing else ({@link clearer}). A drawing the
 * router refuses leaves the other; a fault in either is thrown.
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
