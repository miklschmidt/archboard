// What the viewer marks on the picture on screen: attention, drawn as the
// selection ring, and a presented step's veil.
//
// Attention only. What the board says nobody has decided is drawn into the
// picture by the renderer, from the same reconciliation the sentences above it
// are written from, so it is legible on a pane with nothing selected and no
// walkthrough open — and a subject that is both attended and unsettled says
// both, which it could not while one map held one mark per subject.

import { useLayoutEffect, useMemo } from "react";

import type { StagedPicture } from "@/ui/semantic-board-canvas/hooks/use-picture-transition";
import type { GroupSelection } from "@/ui/semantic-board-canvas/lib/groups";
import { lightInk } from "@/ui/semantic-board-canvas/lib/lit-ink";
import { subjectMarks, type BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";
import { markReach, markSubjects, markVeil } from "@/ui/semantic-board-canvas/lib/subjects";

/** What the viewer is attending to, and what a presented step veils. */
interface ViewerMarks {
	/** The subject picked out, or null. */
	readonly selection: string | null;
	/** What the beat being read asks of the picture. */
	readonly focus: BeatFocus;
	/** The selected group and its members, or null. */
	readonly group: GroupSelection | null;
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
	const { selection, focus, group, veil, reach } = marks;
	const attended = useMemo(
		() => subjectMarks(selection, focus, group?.members),
		[selection, focus, group],
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
