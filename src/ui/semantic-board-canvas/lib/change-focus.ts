// Where the changes between two states of a board are, in the picture a pane
// is moving to.
//
// Moving from a board's current state to a proposal, or back, is a request to
// see what the proposal changes, so the camera goes to it: every subject the
// proposal adds, changes or removes, wherever the picture arriving draws it.
// The standings come from whichever of the two pictures is the proposal's —
// the one whose answer says what it changed — and the boxes from the picture
// arriving, because that is the one the camera will be looking at. A subject the
// arriving picture does not draw (an added card, on the way back to the current
// state) has no box there and is simply not part of it.

import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { unionRect, type FitTarget, type Rect } from "@/ui/semantic-board-canvas/lib/camera";
import { subjectBox } from "@/ui/semantic-board-canvas/lib/subjects";

/**
 * The subjects one of two pictures says changed between them.
 * @param before The picture being left.
 * @param after The picture arriving.
 * @returns The ids, or none when neither picture compares itself to the other.
 */
function changedBetween(before: SemanticDrawing, after: SemanticDrawing): string[] {
	const compared = [after, before].find(
		(one) =>
			one.changes !== null &&
			[before.variant.id, after.variant.id].includes(one.changes.predecessor.id),
	);
	if (compared?.changes === null || compared === undefined) {
		return [];
	}
	return Object.entries(compared.changes.standing)
		.filter(([, standing]) => standing !== "unchanged")
		.map(([id]) => id);
}

/**
 * Where to look when a pane moves between two states of one board: the
 * changes, as the arriving picture draws them.
 * @param before The picture being left.
 * @param after The picture arriving.
 * @returns The region to fit, or null when there is nothing changed to show.
 */
function changeFocus(before: SemanticDrawing, after: SemanticDrawing): FitTarget | null {
	const boxes = changedBetween(before, after).flatMap((id): Rect[] => {
		const box = subjectBox(after.atlas, id);
		return box === null ? [] : [box];
	});
	const rect = unionRect(boxes);
	return rect === null ? null : { kind: "focus", rect };
}

export { changeFocus };
