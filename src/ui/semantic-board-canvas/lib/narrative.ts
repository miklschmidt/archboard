// What a beat of a walkthrough asks the picture to do, as arithmetic.
//
// A beat says what it is about. Where that ends up on screen is not on the
// board and never could be (ADR 0023): every rectangle below comes out of the
// atlas the server returned with the picture, and nothing here invents, nudges
// or rounds a coordinate into existence. A beat about nothing the atlas knows
// produces no rectangle at all, which is the honest answer and the one the rail
// says out loud.
//
// Keeping it pure and out of the components is what lets "the camera went to
// the beat's subjects" be a fact about one function, and what lets the caption
// and the diagram agree about which subjects this view draws without either of
// them asking the other.

import type { WalkthroughBeat } from "@/shared/semantic-board/index";
import type { SemanticAtlas } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { unionRect, type FitTarget, type Rect } from "@/ui/semantic-board-canvas/lib/camera";
import { subjectBox } from "@/ui/semantic-board-canvas/lib/subjects";

/** What a beat's subjects can be found in: the picture on screen. */
interface FocusSource {
	/** Where every subject the renderer drew ended up. */
	readonly atlas: SemanticAtlas;
	/** How wide the drawing is, in its own units. */
	readonly width: number;
	/** How tall the drawing is, in its own units. */
	readonly height: number;
}

/** What one beat asks the picture to show and to light up. */
interface BeatFocus {
	/** The beat's subjects this picture draws, in the order the beat names them. */
	readonly drawn: readonly string[];
	/** The beat's subjects this picture does not draw. */
	readonly undrawn: readonly string[];
	/**
	 * Where the camera should be looking, or null when this beat asks for
	 * nothing in particular and the pane's own whole picture is the answer.
	 */
	readonly target: FitTarget | null;
	/**
	 * What makes this a different thing to be looking at.
	 *
	 * Empty while no walkthrough is open, so a pane that is not being read
	 * through one behaves exactly as it did before there were any.
	 */
	readonly key: string;
}

/** Nothing is being read, so the picture is asked for nothing in particular. */
const NO_FOCUS: BeatFocus = Object.freeze({ drawn: [], undrawn: [], target: null, key: "" });

/**
 * What one fit target is, as one comparable value.
 * @param target Where the camera is being sent.
 * @returns The target as a string.
 */
function targetKey(target: FitTarget): string {
	if (target.kind === "whole") {
		return "whole";
	}
	const { x, y, width, height } = target.rect;
	return `${x},${y},${width},${height}`;
}

/**
 * What the current beat asks of the picture on screen.
 *
 * Three cases, and the third is the one that has to be visible rather than
 * quiet. A beat that names no subject is about the whole architecture and asks
 * for the whole of it. A beat whose subjects this picture draws asks for the
 * region they occupy. A beat whose subjects this picture does not draw — a
 * narrative told across views, read through a view that narrows what is drawn —
 * asks for the whole picture again and hands back the names it could not find,
 * so the rail can say plainly that this reading does not show them. Silently
 * focusing nothing would leave a reader looking at an unrelated part of the
 * diagram believing it was the subject.
 * @param beat The beat being read, or null when no walkthrough is open.
 * @param source The picture on screen, or null when there is not one yet.
 * @returns What to show, what to light up, and what is missing.
 */
function beatFocus(beat: WalkthroughBeat | null, source: FocusSource | null): BeatFocus {
	if (beat === null || source === null) {
		return NO_FOCUS;
	}
	const whole: FitTarget = {
		kind: "whole",
		content: { width: source.width, height: source.height },
	};
	const drawn: string[] = [];
	const undrawn: string[] = [];
	const boxes: Rect[] = [];
	for (const id of beat.subjects) {
		const box = subjectBox(source.atlas, id);
		if (box === null) {
			undrawn.push(id);
		} else {
			drawn.push(id);
			boxes.push(box);
		}
	}
	const rect = unionRect(boxes);
	const target: FitTarget = rect === null ? whole : { kind: "focus", rect };
	return { drawn, undrawn, target, key: `${beat.id}:${targetKey(target)}` };
}

/**
 * Which subjects the picture should mark as attended.
 *
 * What the reader picked out and what the beat they are reading is about, which
 * are one mark. What the board has not decided is deliberately not here: it is
 * drawn by the renderer, in the subject's own corner, so a subject that is both
 * attended and unsettled says both instead of one state quietly replacing the
 * other — which is what happened while a single map held one mark per subject.
 * @param selection The selected id, or null for none.
 * @param focus What the current beat asks for.
 * @returns The subjects to ring.
 */
function subjectMarks(selection: string | null, focus: BeatFocus): ReadonlySet<string> {
	const attended = new Set<string>(focus.drawn);
	if (selection !== null) {
		attended.add(selection);
	}
	return attended;
}

export { NO_FOCUS, beatFocus, subjectMarks, type BeatFocus, type FocusSource };
