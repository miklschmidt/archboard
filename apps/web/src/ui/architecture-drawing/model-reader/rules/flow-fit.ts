import {
	FIT_MARGIN,
	REFERENCE_PANE,
	fitScale,
	type Size,
} from "@archboard/renderer/shell-geometry";
import type { DiagramGrammar } from "@archboard/model/views";

/** The two readings of a flow. */
type FlowGrammar = Exclude<DiagramGrammar, "architecture">;

/**
 * The reading a flow opens in: the one its pane shows at the larger scale, up to the drawn size,
 * and the sequence when both show as large (ADR 0073). A reading that could not be drawn loses.
 * @param room The pane's window on the picture, or null for a pane not laid out yet, which the
 * reference pane stands in for.
 * @param pictures How large each reading draws the flow, or null where it was not drawn.
 * @returns The reading to open.
 */
function fittingReading(
	room: Size | null,
	pictures: Readonly<Record<FlowGrammar, Size | null>>,
): FlowGrammar {
	const space =
		room === null
			? REFERENCE_PANE
			: { width: room.width - 2 * FIT_MARGIN, height: room.height - 2 * FIT_MARGIN };
	/**
	 * The scale a picture lands at whole, no larger than drawn.
	 * @param picture The picture's size, if it was drawn.
	 * @returns The scale, or zero for no picture.
	 */
	const scale = (picture: Size | null): number =>
		picture === null || picture.width <= 0 || picture.height <= 0
			? 0
			: Math.min(1, fitScale(space, picture));
	return scale(pictures.flowchart) > scale(pictures.sequence) ? "flowchart" : "sequence";
}

export { fittingReading, type FlowGrammar };
