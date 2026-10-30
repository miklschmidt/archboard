// What the viewer marks on the picture on screen: attention, drawn as the
// selection ring, and a presented step's veil. The subject a step through a
// design question's answer is at is ringed as a walkthrough step's subjects
// are, while nothing is picked: a pick rings itself in its place (ADR 0059).
//
// Attention only. What the board says nobody has decided is drawn into the
// picture by the renderer, from the same reconciliation the sentences above it
// are written from, so it is legible on a pane with nothing selected and no
// walkthrough open — and a subject that is both attended and unsettled says
// both, which it could not while one map held one mark per subject.

import { useLayoutEffect, useMemo } from "react";

import type { StagedPicture } from "#ui/hooks/semantic-board-canvas/use-picture-transition.ts";
import type { AnswerStep } from "#ui/rules/semantic-board-canvas/board/connections.ts";
import type { GroupSelection } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import { lightInk } from "#ui/clients/semantic-board-canvas/subjects/lit-ink.ts";
import {
	subjectMarks,
	type BeatFocus,
} from "#ui/rules/semantic-board-canvas/walkthrough/narrative.ts";
import {
	markReach,
	markSubjects,
	markVeil,
} from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";

/** What the viewer is attending to, and what a presented step veils. */
interface ViewerMarks {
	/** The subject picked out, or null. */
	readonly selection: string | null;
	/** What the beat being read asks of the picture. */
	readonly focus: BeatFocus;
	/** The selected group and its members, or null. */
	readonly group: GroupSelection | null;
	/** Where the person is in the chosen design question's answer, or null while none is chosen. */
	readonly answer: AnswerStep | null;
	/** What a presented step's veil, or the light a poke asks for, leaves standing; null for neither. */
	readonly veil: ReadonlySet<string> | null;
	/** How many hops beyond the first each subject a trace reached is; null without a trace. */
	readonly reach: ReadonlyMap<string, number> | null;
}

/**
 * Keep the viewer's marks on the picture on screen.
 *
 * Before paint, both: a picture put up fresh — a flight landing, most of all —
 * must never be seen for a frame without its marks, or what they light and
 * veil is seen to switch off and fade back in.
 * @param picture The picture on the surface, or null while there is none.
 * @param marks What to mark.
 */
function useViewerMarks(picture: StagedPicture | null, marks: ViewerMarks): void {
	const { selection, focus, group, answer, veil, reach } = marks;
	const ringed = selection ?? answer?.at ?? null;
	const attended = useMemo(
		() => subjectMarks(ringed, focus, group?.members),
		[ringed, focus, group],
	);
	useLayoutEffect(() => {
		if (picture !== null) {
			markSubjects(picture.root, attended);
			lightInk(picture.root);
		}
	}, [picture, attended]);
	// The veil is its own mark, independent of attention.
	useLayoutEffect(() => {
		if (picture !== null) {
			markVeil(picture.surface, veil);
			lightInk(picture.root);
		}
	}, [picture, veil]);
	// A trace grades what it reached by how far it is, on top of the veil's marks.
	useLayoutEffect(() => {
		if (picture !== null) {
			markReach(picture.surface, reach);
		}
	}, [picture, reach]);
}

export { useViewerMarks };
