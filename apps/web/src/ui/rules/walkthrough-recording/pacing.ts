// When a recorded walkthrough moves on (TASK-304).
//
// Nobody is at the controls of a recording, so the page steps the walkthrough
// itself, and the one thing it waits for is the voice. A step is finished once
// everything the voice said about it is a final line of the transcript (the
// voice model ended its turn) and the voice's measured output has been quiet
// for a moment, because a line can be final before its audio has finished
// playing. The quiet is also the viewer's pause between two steps.
//
// Every wait here has a bound, and passing one fails the recording with what
// did not happen: a silent step in a video is worse than no video.
//
// Pure: each tick the page observes the voice and the pane and asks what to do.

import { RECORDING_MS } from "@archboard/timing";
import type { BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import type { SemanticPaneReading } from "#ui/rules/semantic-board-canvas/board/address.ts";

/**
 * One line of the voice session's transcript, as far as pacing reads it: who said it, whether
 * the speaker ended the turn it belongs to, and an identity to tell it from the lines before.
 */
type SpokenLine = Pick<BrowserSnapshot["voice"]["transcript"][number], "speaker" | "final"> & {
	readonly itemId: string;
};

/** Where the pane's presentation is, as the pane reports it. */
type PanePlace = Pick<NonNullable<SemanticPaneReading["presentation"]>, "beat" | "of" | "arrived">;

/** How the voice stands. */
type VoiceStanding =
	| { readonly kind: "live" }
	| { readonly kind: "failed"; readonly reason: string }
	/** Not live and not failed: on its way, or not started. */
	| { readonly kind: "other" };

/** What the page sees on one tick. */
interface PaceObservation {
	/** Milliseconds on a monotonic clock. */
	readonly now: number;
	readonly voice: VoiceStanding;
	/** Whether the voice is audible right now, by its measured output. */
	readonly audible: boolean;
	readonly transcript: readonly SpokenLine[];
	readonly place: PanePlace | null;
}

/** Where a recording is in its talk. */
type PaceState =
	/** Voice was asked for and has not gone live yet. */
	| { readonly kind: "starting"; readonly since: number }
	/** The talk has begun, showing the whole board before the first step. */
	| { readonly kind: "lead"; readonly since: number }
	/** On one step, waiting for the voice to explain it and fall quiet. */
	| {
			readonly kind: "step";
			readonly beat: number;
			readonly since: number;
			/** The lines the transcript held when the step was asked for: none of them is about it. */
			readonly heard: ReadonlySet<string>;
			/**
			 * Whether the step has ever finished arriving. Only its first arrival is bounded: a new
			 * version of the board redraws the picture and the step arrives again, which is no failure.
			 */
			readonly landed: boolean;
			/** Since when the step has counted as explained, or null while it does not. */
			readonly quietSince: number | null;
	  }
	/** The last step is explained; its picture stays a moment before the talk ends. */
	| { readonly kind: "tail"; readonly since: number }
	| { readonly kind: "done" }
	| { readonly kind: "failed"; readonly reason: string };

/** What the page does after one tick. */
type PaceAction =
	| { readonly kind: "none" }
	/** Voice is live: the talk begins. */
	| { readonly kind: "begin" }
	/** Move the pane to a step, counted from zero. */
	| { readonly kind: "show"; readonly beat: number }
	/** The talk is over: keep it. */
	| { readonly kind: "finish" }
	/** Stop and keep nothing, for the reason given. */
	| { readonly kind: "fail"; readonly reason: string };

/** The state after a tick, and what to do about it. */
interface PaceTurn {
	readonly state: PaceState;
	readonly action: PaceAction;
}

const NOTHING: PaceAction = Object.freeze({ kind: "none" });

/**
 * Stop the recording, for a reason.
 * @param reason What did not happen, and what to do about it.
 * @returns The failed state and the action that stops the page.
 */
function failed(reason: string): PaceTurn {
	return { state: { kind: "failed", reason }, action: { kind: "fail", reason } };
}

/**
 * Ask for a step, remembering what the voice had said before it.
 * @param beat The step, counted from zero.
 * @param observed What the page sees now.
 * @returns The step state and the action that shows it.
 */
function showing(beat: number, observed: PaceObservation): PaceTurn {
	const heard = new Set(observed.transcript.map((line) => line.itemId));
	return {
		state: { kind: "step", beat, since: observed.now, heard, landed: false, quietSince: null },
		action: { kind: "show", beat },
	};
}

/**
 * The voice has not gone live yet.
 * @param state The starting state.
 * @param observed What the page sees now.
 * @returns The next state and action.
 */
function paceStart(
	state: Extract<PaceState, { kind: "starting" }>,
	observed: PaceObservation,
): PaceTurn {
	if (observed.voice.kind === "live") {
		return { state: { kind: "lead", since: observed.now }, action: { kind: "begin" } };
	}
	if (observed.now - state.since <= RECORDING_MS.voiceStart) {
		return { state, action: NOTHING };
	}
	return failed(
		`Voice did not go live within ${RECORDING_MS.voiceStart / 1000} seconds. Check that voice starts on this Archboard server, then record again.`,
	);
}

/**
 * Whether the pane is at rest on a step.
 * @param place Where the pane is, or null.
 * @param beat The step, counted from zero.
 * @returns True once that step has finished arriving.
 */
function arrivedAt(place: PanePlace | null, beat: number): boolean {
	return place?.beat === beat && place.arrived;
}

/**
 * What the voice said since a step was asked for.
 * @param transcript The voice session's transcript.
 * @param heard The lines it held when the step was asked for.
 * @returns The voice's own lines that are new.
 */
function spokenSince(
	transcript: readonly SpokenLine[],
	heard: ReadonlySet<string>,
): readonly SpokenLine[] {
	return transcript.filter((line) => line.speaker === "assistant" && !heard.has(line.itemId));
}

/** What one tick knows about the step on screen. */
interface StepReading {
	readonly waited: number;
	/** At rest on the step now. */
	readonly arrived: boolean;
	/** At rest on the step now, or at some tick since it was asked for. */
	readonly landed: boolean;
	readonly spoken: readonly SpokenLine[];
}

/**
 * A wait on a step that has run past its bound, as the failure it is.
 * @param beat The step, counted from zero.
 * @param reading What the tick knows about it.
 * @returns The failure, or null while every wait is within its bound.
 */
function overdue(beat: number, reading: StepReading): PaceTurn | null {
	const step = beat + 1;
	const { waited } = reading;
	if (!reading.landed && waited > RECORDING_MS.speechStart) {
		return failed(
			`Step ${step} never finished arriving on screen. Check that the board still states the walkthrough and that step, then record again.`,
		);
	}
	if (reading.spoken.length === 0 && waited > RECORDING_MS.speechStart) {
		return failed(
			`The voice said nothing about step ${step} within ${RECORDING_MS.speechStart / 1000} seconds. Record again; if it keeps happening, check voice on this Archboard server.`,
		);
	}
	return waited > RECORDING_MS.stepMax
		? failed(
				`The voice was still explaining step ${step} after ${RECORDING_MS.stepMax / 60_000} minutes. Shorten that step, then record again.`,
			)
		: null;
}

/**
 * Since when a step has counted as explained: it has arrived, everything the voice said about it
 * is final, and the voice is not audible.
 * @param state The step state.
 * @param reading What the tick knows about the step.
 * @param observed What the page sees now.
 * @returns Since when, or null while it does not count.
 */
function quietSince(
	state: Extract<PaceState, { kind: "step" }>,
	reading: StepReading,
	observed: PaceObservation,
): number | null {
	const { spoken } = reading;
	const explained = spoken.length > 0 && spoken.every((line) => line.final) && !observed.audible;
	return reading.arrived && explained ? (state.quietSince ?? observed.now) : null;
}

/**
 * The step after one that has been explained: the next, or the tail after the last.
 * @param beat The step explained, counted from zero.
 * @param of How many steps there are.
 * @param observed What the page sees now.
 * @returns The next state and action.
 */
function after(beat: number, of: number, observed: PaceObservation): PaceTurn {
	return beat + 1 < of
		? showing(beat + 1, observed)
		: { state: { kind: "tail", since: observed.now }, action: NOTHING };
}

/**
 * On one step: wait for it to arrive and be explained, then move on.
 * @param state The step state.
 * @param observed What the page sees now.
 * @returns The next state and action.
 */
function paceStep(
	state: Extract<PaceState, { kind: "step" }>,
	observed: PaceObservation,
): PaceTurn {
	const { place } = observed;
	const arrived = arrivedAt(place, state.beat);
	const reading: StepReading = {
		waited: observed.now - state.since,
		arrived,
		landed: state.landed || arrived,
		spoken: spokenSince(observed.transcript, state.heard),
	};
	const late = overdue(state.beat, reading);
	if (late !== null) return late;
	const quiet = quietSince(state, reading, observed);
	if (place === null || quiet === null || observed.now - quiet < RECORDING_MS.quiet) {
		return { state: { ...state, landed: reading.landed, quietSince: quiet }, action: NOTHING };
	}
	return after(state.beat, place.of, observed);
}

/**
 * Hold a state until a moment has passed since it began, then take the next.
 * @param state The state being held.
 * @param observed What the page sees now.
 * @param hold How long to hold it.
 * @param next What follows it.
 * @returns The state held, or what follows.
 */
function held(
	state: Extract<PaceState, { since: number }>,
	observed: PaceObservation,
	hold: number,
	next: () => PaceTurn,
): PaceTurn {
	return observed.now - state.since < hold ? { state, action: NOTHING } : next();
}

/**
 * A tick while voice is live and the talk is being kept.
 * @param state Where the talk is.
 * @param observed What the page sees now.
 * @returns The next state and action.
 */
function paceLive(
	state: Extract<PaceState, { kind: "lead" | "step" | "tail" }>,
	observed: PaceObservation,
): PaceTurn {
	if (state.kind === "step") return paceStep(state, observed);
	if (state.kind === "lead")
		return held(state, observed, RECORDING_MS.lead, () => showing(0, observed));
	return held(state, observed, RECORDING_MS.tail, () => ({
		state: { kind: "done" },
		action: { kind: "finish" },
	}));
}

/**
 * One tick of a recording's talk.
 * @param state Where the talk is.
 * @param observed What the page sees now.
 * @returns Where it is next, and what the page does about it.
 */
function pace(state: PaceState, observed: PaceObservation): PaceTurn {
	if (state.kind === "done" || state.kind === "failed") {
		return { state, action: NOTHING };
	}
	if (observed.voice.kind === "failed") {
		return failed(observed.voice.reason);
	}
	if (state.kind === "starting") {
		return paceStart(state, observed);
	}
	return observed.voice.kind === "live"
		? paceLive(state, observed)
		: failed("Voice stopped before the recording finished. Record again.");
}

export {
	pace,
	type PaceAction,
	type PaceObservation,
	type PaceState,
	type PanePlace,
	type SpokenLine,
	type VoiceStanding,
};
