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
// the beat's subjects" be a fact about one function, and what lets the rail and
// the diagram agree about which subjects this view draws without either of them
// asking the other.

import type { WalkthroughBeat } from "@/shared/semantic-board/index";
import type { SemanticAtlas } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { unionRect, type FitTarget, type Rect } from "@/ui/semantic-board-canvas/lib/camera";
import { subjectBox, type SubjectMark } from "@/ui/semantic-board-canvas/lib/subjects";

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

/** Where down the rail a beat becomes the one being read. */
const READING_LINE = 0.33;

/**
 * How far down a rail of this height the reading line is.
 * @param height How tall the scrollport is.
 * @returns The line, in the rail's own pixels.
 */
function readingLineAt(height: number): number {
	return height * READING_LINE;
}

/**
 * How much blank space a rail of this height needs after its last beat.
 *
 * Measured from the scrollport rather than set as a class, because a class is a
 * guess about one viewport and the pane has several: with the workbench
 * collapsed the rail was 812 tall with nothing to scroll, so the last beat sat
 * at 322 against a line at 268 and could never reach it — the explanation
 * simply ended before its final beat could be read. The tail a rail needs is
 * whatever puts its last beat at the line, and the last beat's top is at worst
 * the whole scrollport down, so a tail of everything below the line always
 * suffices and nothing shorter always does.
 * @param height How tall the scrollport is.
 * @returns The blank space to leave, in pixels.
 */
function tailAfterLastBeat(height: number): number {
	return Math.max(0, height - readingLineAt(height));
}

/**
 * How near the reading line counts as having reached it, in pixels.
 *
 * Measured in a browser: bringing a beat to the line landed its top 0.27 of a
 * pixel below the line, so the beat the reader had just asked for was not yet
 * the one being read and the rail put them back on the one before it. Sub-pixel
 * layout must not decide which beat somebody is on.
 */
const REACHED_SLOP = 2;

/**
 * Which beat the rail has brought to the reading line.
 *
 * The last one to have passed the line is the one being read: prose is read
 * downwards, so a beat whose heading is still below the line has not been
 * reached yet, and the beat above the line is the one whose words fill the
 * rail. Before anything has passed it — at the very top of a narrative — the
 * first beat is current, because somebody who has just opened an explanation is
 * at its beginning.
 * @param tops Where each beat sits, measured from the top of the rail.
 * @param line How far down the rail the reading line is.
 * @returns The index of the current beat.
 */
function beatAtLine(tops: readonly number[], line: number): number {
	let current = 0;
	tops.forEach((top, index) => {
		if (top <= line + REACHED_SLOP) {
			current = index;
		}
	});
	return current;
}

/** How each key that moves through a narrative moves through it. */
const STEP_KEYS: Readonly<Record<string, number>> = {
	ArrowDown: 1,
	ArrowUp: -1,
	PageDown: 1,
	PageUp: -1,
};

/**
 * Which beat a key press moves to.
 * @param key The key that was pressed.
 * @param current Which beat is current now.
 * @param count How many beats the walkthrough has.
 * @returns The beat to move to, or null when the key was not one of these.
 */
function beatForKey(key: string, current: number, count: number): number | null {
	const step = STEP_KEYS[key];
	if (step !== undefined) {
		return Math.min(count - 1, Math.max(0, current + step));
	}
	if (key === "Home") {
		return 0;
	}
	return key === "End" ? count - 1 : null;
}

/**
 * How the picture should mark each subject it draws.
 *
 * The disputes go on first and attention over the top, so a subject that is
 * both reads as the one the person is looking at. Which of the two is louder
 * matters: a dispute is a standing fact and the block beside the picture lists
 * it either way, while attention is about this moment and has nowhere else to
 * be said.
 * @param selection The selected id, or null for none.
 * @param focus What the current beat asks for.
 * @param disputed The subjects the board says are waiting on a disagreement.
 * @returns How each marked subject is marked.
 */
function subjectMarks(
	selection: string | null,
	focus: BeatFocus,
	disputed: readonly string[],
): ReadonlyMap<string, SubjectMark> {
	const marks = new Map<string, SubjectMark>();
	for (const id of disputed) {
		marks.set(id, "disputed");
	}
	for (const id of focus.drawn) {
		marks.set(id, "attended");
	}
	if (selection !== null) {
		marks.set(selection, "attended");
	}
	return marks;
}

export {
	NO_FOCUS,
	REACHED_SLOP,
	READING_LINE,
	beatAtLine,
	beatFocus,
	beatForKey,
	readingLineAt,
	subjectMarks,
	tailAfterLastBeat,
	type BeatFocus,
	type FocusSource,
};
