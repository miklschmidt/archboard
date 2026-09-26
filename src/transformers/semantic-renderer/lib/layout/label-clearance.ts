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
// clearance only where it leaves the page as it was and costs no crossing,
// no bend and no stacked line. A cleared settlement can reserve other labels
// and so place the board anew, which no count judges: Board rasterizer's
// came out with a tangle of parallel lines between two of its frames. And in
// Agent workbench the cleared routes left two lines on one stroke that the
// ordinary routes let the stack pass part.
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { untidiness } from "@/transformers/semantic-renderer/lib/layout/even-pins";
import {
	stackCrossings,
	stackedEnds,
} from "@/transformers/semantic-renderer/lib/layout/stacked-runs";

/**
 * What a finished drawing is weighed on: its crossings, those its stacks
 * hide included, its bends and the lines it leaves on another's stroke.
 * @param drawing The drawing.
 * @returns Its crossings, bends and stacked line ends.
 */
function weighed(drawing: ArchitectureDrawing): readonly number[] {
	const [crossings, bends] = untidiness(drawing);
	return [crossings! + stackCrossings(drawing), bends!, stackedEnds(drawing).length];
}

/**
 * Where a drawing places its cards and frames.
 * @param drawing The drawing.
 * @returns Their boxes, in the drawing's order.
 */
function placed(drawing: ArchitectureDrawing): Box[] {
	return [...drawing.cards, ...drawing.containers].map(({ box }) => box);
}

/**
 * Whether two drawings place every card and frame alike.
 * @param one A drawing.
 * @param other Another.
 * @returns True when only their routes and labels differ.
 */
function samePlacement(one: ArchitectureDrawing, other: ArchitectureDrawing): boolean {
	const theirs = placed(other);
	return placed(one).every(
		(box, index) =>
			Math.abs(box.x - theirs[index]!.x) < 0.5 &&
			Math.abs(box.y - theirs[index]!.y) < 0.5 &&
			Math.abs(box.width - theirs[index]!.width) < 0.5 &&
			Math.abs(box.height - theirs[index]!.height) < 0.5,
	);
}

/**
 * The drawing routed with reserved labels' full clearance, unless it places
 * the board differently, or has more crossings, more bends or more stacked
 * lines than the ordinary one. A
 * drawing the router refuses leaves the other; both refused is refused.
 * @param ordinary The finished drawing with the router's buffer round reserved labels.
 * @param cleared The finished drawing with their full clearance.
 * @returns The drawing kept.
 */
export async function clearerDrawing(
	ordinary: Promise<ArchitectureDrawing>,
	cleared: Promise<ArchitectureDrawing>,
): Promise<ArchitectureDrawing> {
	const [one, other] = await Promise.allSettled([ordinary, cleared]);
	if (other.status === "rejected") return ordinary;
	if (one.status === "rejected") return other.value;
	const [wide, narrow] = [weighed(other.value), weighed(one.value)];
	const clearer =
		samePlacement(other.value, one.value) && wide.every((value, index) => value <= narrow[index]!);
	return clearer ? other.value : one.value;
}
