// When a recording moves on (TASK-304).
//
// What is guarded is what a viewer of the video would notice: a step is left only once the voice
// has finished explaining it and gone quiet, never while its last words are still playing; what
// the voice said before a step was asked for is not that step's explanation; the talk ends after
// the last step's pause; and a recording that cannot go on stops rather than showing a silent
// step or a dead voice.

import { describe, expect, test } from "bun:test";

import { RECORDING_MS } from "@archboard/timing";
import {
	pace,
	type PaceObservation,
	type PaceState,
} from "#ui/rules/walkthrough-recording/pacing.ts";

const LIVE = { kind: "live" } as const;

/**
 * What the page sees, with the voice live and nothing said unless given.
 * @param now The clock.
 * @param overrides What differs.
 * @returns The observation.
 */
function seen(now: number, overrides: Partial<PaceObservation> = {}): PaceObservation {
	return {
		now,
		voice: LIVE,
		audible: false,
		transcript: [],
		place: null,
		...overrides,
	};
}

/**
 * The voice's line about a step.
 * @param itemId The line.
 * @param final Whether the voice ended its turn.
 * @returns The line.
 */
function line(itemId: string, final: boolean): PaceObservation["transcript"][number] {
	return { itemId, speaker: "assistant", final };
}

/**
 * Run one tick and return the new state and what the page is told to do.
 * @param state Where the talk is.
 * @param observed What the page sees.
 * @returns The turn.
 */
function tick(state: PaceState, observed: PaceObservation): ReturnType<typeof pace> {
	return pace(state, observed);
}

describe("recording pace", () => {
	test("a step is left only once its explanation is final and the voice has been quiet a while", () => {
		let state: PaceState = { kind: "starting", since: 0 };
		let turn = tick(state, seen(10));
		expect(turn.action.kind).toBe("begin");
		state = turn.state;
		expect(tick(state, seen(10 + RECORDING_MS.lead - 1)).action.kind).toBe("none");
		turn = tick(state, seen(10 + RECORDING_MS.lead));
		expect(turn.action).toEqual({ kind: "show", beat: 0 });
		state = turn.state;
		const at = 10 + RECORDING_MS.lead;
		const place = { beat: 0, of: 2, arrived: true };
		// Still speaking, then a final line whose audio is still playing: neither moves on.
		state = tick(
			state,
			seen(at + 500, { place, transcript: [line("a", false)], audible: true }),
		).state;
		turn = tick(state, seen(at + 900, { place, transcript: [line("a", true)], audible: true }));
		expect(turn.action.kind).toBe("none");
		state = turn.state;
		// Final and quiet: the pause begins, and only its end moves on.
		state = tick(state, seen(at + 1000, { place, transcript: [line("a", true)] })).state;
		expect(
			tick(
				state,
				seen(at + 1000 + RECORDING_MS.quiet - 1, { place, transcript: [line("a", true)] }),
			).action.kind,
		).toBe("none");
		turn = tick(
			state,
			seen(at + 1000 + RECORDING_MS.quiet, { place, transcript: [line("a", true)] }),
		);
		expect(turn.action).toEqual({ kind: "show", beat: 1 });
	});

	test("what the voice said before a step was asked for does not explain it", () => {
		const said = [line("before", true)];
		let turn = tick({ kind: "lead", since: 0 }, seen(RECORDING_MS.lead, { transcript: said }));
		const place = { beat: 0, of: 2, arrived: true };
		let state = turn.state;
		turn = tick(
			state,
			seen(RECORDING_MS.lead + RECORDING_MS.quiet * 3, { place, transcript: said }),
		);
		expect(turn.action.kind).toBe("none");
		state = turn.state;
		turn = tick(
			state,
			seen(RECORDING_MS.lead + RECORDING_MS.speechStart + 1, { place, transcript: said }),
		);
		expect(turn.action.kind).toBe("fail");
		expect(turn.state.kind).toBe("failed");
	});

	test("the talk ends after the last step's pause", () => {
		const place = { beat: 0, of: 1, arrived: true };
		const said = [line("only", true)];
		let state: PaceState = {
			kind: "step",
			beat: 0,
			since: 0,
			heard: new Set(),
			landed: true,
			quietSince: 0,
		};
		let turn = tick(state, seen(RECORDING_MS.quiet, { place, transcript: said }));
		expect(turn.state.kind).toBe("tail");
		state = turn.state;
		expect(tick(state, seen(RECORDING_MS.quiet + RECORDING_MS.tail - 1)).action.kind).toBe("none");
		turn = tick(state, seen(RECORDING_MS.quiet + RECORDING_MS.tail));
		expect(turn.action).toEqual({ kind: "finish" });
	});

	test("only a step's first arrival is bounded: a redraw mid-explanation holds it, and fails nothing", () => {
		const at = RECORDING_MS.speechStart + 5000;
		const landed: PaceState = {
			kind: "step",
			beat: 0,
			since: 0,
			heard: new Set(),
			landed: true,
			quietSince: null,
		};
		const redrawing = { beat: 0, of: 2, arrived: false };
		const turn = tick(landed, seen(at, { place: redrawing, transcript: [line("a", true)] }));
		expect(turn.action.kind).toBe("none");
		const never: PaceState = { ...landed, landed: false };
		expect(
			tick(never, seen(at, { place: redrawing, transcript: [line("a", true)] })).action.kind,
		).toBe("fail");
	});

	test("a voice that fails, or stops mid-talk, fails the recording with a reason", () => {
		const refused = tick(
			{ kind: "starting", since: 0 },
			seen(5, {
				voice: { kind: "failed", reason: "Realtime negotiation was unavailable or failed." },
			}),
		);
		expect(refused.action).toEqual({
			kind: "fail",
			reason: "Realtime negotiation was unavailable or failed.",
		});
		const dropped = tick({ kind: "lead", since: 0 }, seen(5, { voice: { kind: "other" } }));
		expect(dropped.action.kind).toBe("fail");
	});
});
