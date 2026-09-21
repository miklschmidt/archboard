// How long a narrated walkthrough is silent between one step and the next (TASK-251).
//
// A step costs a coordinator turn: the voice model asks for it, the coordinator
// presents it in the pane and hands it back as prose. Whether that is quick
// enough to feel like a talk is a question for a clock, not an opinion, so the
// canvas keeps the clock. Nothing here decides anything; it is read after a real
// voice session and written down.
//
// One measurement is one step: from the voice finishing the explanation before
// it, through the step arriving on screen, to the voice starting to speak about
// it. A filler such as "one moment" is speech too, so the end of an explanation
// is the first time the voice stops after it started narrating, and whatever it
// says between that and the step arriving is counted rather than mistaken for
// the next explanation.

import type { Express, Request, Response } from "express";

/** One step's silence, in milliseconds. */
interface NarrationStepTiming {
	/** The step, counted from one. */
	readonly step: number;
	/** From the end of the previous explanation to the voice starting this one; null for the first step. */
	readonly endToNextStartMs: number | null;
	/** From the end of the previous explanation to this step having arrived on screen; null for the first. */
	readonly endToArrivedMs: number | null;
	/** From this step having arrived on screen to the voice starting to speak. */
	readonly arrivedToStartMs: number;
	/** How many times the voice spoke in between: fillers, or an answer to an interruption. */
	readonly utterancesBetween: number;
}

/** The clock over one canvas's narration. */
interface NarrationTiming {
	/**
	 * A step finished arriving on the person's screen.
	 * @param step The step, counted from one.
	 */
	readonly stepArrived: (step: number) => void;
	/** The voice model started speaking. */
	readonly voiceStarted: () => void;
	/** The voice model stopped speaking. */
	readonly voiceFinished: () => void;
	/**
	 * Every step measured so far, oldest first.
	 * @returns The measurements.
	 */
	readonly measurements: () => readonly NarrationStepTiming[];
	/** Forget everything, for a new voice session. */
	readonly reset: () => void;
}

/** How many steps are kept: far more than one walkthrough, and bounded all the same. */
const KEPT_MEASUREMENTS = 256;

/**
 * Build the clock.
 * @param now The time source, in milliseconds.
 * @returns The clock.
 */
function createNarrationTiming(now: () => number = Date.now): NarrationTiming {
	let explanationEndedAt: number | null = null;
	let arrived: { readonly step: number; readonly at: number } | null = null;
	let utterancesBetween = 0;
	let kept: NarrationStepTiming[] = [];

	/**
	 * A step finished arriving on the person's screen.
	 * @param step The step, counted from one.
	 */
	function stepArrived(step: number): void {
		arrived = { step, at: now() };
	}

	/** The voice started speaking: about the step that arrived, or something in between. */
	function voiceStarted(): void {
		if (arrived === null) {
			utterancesBetween += 1;
			return;
		}
		const at = now();
		const ended = explanationEndedAt;
		const measured: NarrationStepTiming = {
			step: arrived.step,
			endToNextStartMs: ended === null ? null : at - ended,
			endToArrivedMs: ended === null ? null : arrived.at - ended,
			arrivedToStartMs: at - arrived.at,
			utterancesBetween,
		};
		kept = [...kept, measured].slice(-KEPT_MEASUREMENTS);
		arrived = null;
		explanationEndedAt = null;
		utterancesBetween = 0;
	}

	/** The voice stopped speaking; the first stop after an explanation began is its end. */
	function voiceFinished(): void {
		explanationEndedAt ??= now();
	}

	/**
	 * Every step measured so far.
	 * @returns The measurements, oldest first.
	 */
	function measurements(): readonly NarrationStepTiming[] {
		return kept;
	}

	/** Forget everything, for a new voice session. */
	function reset(): void {
		explanationEndedAt = null;
		arrived = null;
		utterancesBetween = 0;
		kept = [];
	}

	return { stepArrived, voiceStarted, voiceFinished, measurements, reset };
}

/** This canvas's clock. */
const narrationTiming = createNarrationTiming();

/** Where the measurements are read. */
const NARRATION_TIMING_ROUTE = "/api/voice/narration-timing";

/**
 * Answer with every step measured so far.
 * @param _req The request.
 * @param res Its response.
 */
function readNarrationTiming(_req: Request, res: Response): void {
	res.json({ success: true, steps: narrationTiming.measurements() });
}

/**
 * Mount the route the measurements are read through.
 * @param app The express application.
 */
function mountNarrationTimingRoute(app: Express): void {
	app.get(NARRATION_TIMING_ROUTE, readNarrationTiming);
}

export {
	NARRATION_TIMING_ROUTE,
	createNarrationTiming,
	mountNarrationTimingRoute,
	narrationTiming,
	type NarrationStepTiming,
	type NarrationTiming,
};
