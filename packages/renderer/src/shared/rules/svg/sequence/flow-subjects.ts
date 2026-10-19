// Where each participant and message of a painted sequence stands, for the atlas
// a pane hit-tests and focuses.
import type { Box } from "#shared/rules/geometry.ts";
import { activationLookup, type FlowLayout } from "#shared/rules/layout/sequence/dataflow.ts";
import { stepBox } from "#shared/rules/layout/sequence/messages.ts";

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
 * Every step of one flow, as a box: a message's row, and a decision's or
 * loop's whole frame, since a pane sent to a decision is sent to every
 * alternative it chooses between.
 * @param layout The flow.
 * @returns Each step's box.
 */
function stepSubjects(layout: FlowLayout): DrawnSubject[] {
	const activeAt = activationLookup(layout.columns);
	return [
		...layout.steps.map((placed) => ({ id: placed.step.id, box: stepBox(placed, activeAt) })),
		...layout.frames.map((frame) => ({ id: frame.step.id, box: frame.box })),
	];
}

export { columnSubjects, stepSubjects, type DrawnSubject };
