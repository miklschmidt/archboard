// Where each participant and message of a painted sequence stands, for the atlas
// a pane hit-tests and focuses.
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import {
	activationLookup,
	type FlowLayout,
} from "@/transformers/semantic-renderer/lib/layout/dataflow";
import { stepBox } from "@/transformers/semantic-renderer/lib/layout/messages";

/** One subject of a drawing, and the box it took. */
interface DrawnSubject {
	/** Its semantic id. */
	readonly id: string;
	/** Where it was drawn. */
	readonly box: Box;
}

/**
 * Every participant column of one flow, as a box.
 *
 * A participant is its card *and* the column of time under it: a pane sent to a
 * participant is being sent to everything that participant does, not to the
 * label at the top of it.
 * @param layout The flow.
 * @returns Each participant's box.
 */
function columnSubjects(layout: FlowLayout): DrawnSubject[] {
	return layout.columns.map((column) => ({
		id: column.card.node.id,
		box: {
			x: column.card.box.x,
			y: column.card.box.y,
			width: column.card.box.width,
			height: layout.lifelineBottom - column.card.box.y,
		},
	}));
}

/**
 * Every message of one flow, as a box.
 * @param layout The flow.
 * @returns Each message's row.
 */
function stepSubjects(layout: FlowLayout): DrawnSubject[] {
	const activeAt = activationLookup(layout.columns);
	return layout.steps.map((placed) => ({ id: placed.step.id, box: stepBox(placed, activeAt) }));
}

export { columnSubjects, stepSubjects, type DrawnSubject };
