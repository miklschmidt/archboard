// Where a talk stands at each frame of its rendering.
//
// What these catch: a step or a word shown a frame early or later than the
// first frame at or after it happened; an utterance that grows shown as two
// subtitles; a playback that tells the stage about a frame on which nothing
// happened, which would draw the frame again for nothing; and an orb that
// follows the voice of another frame than the one drawn.

import { describe, expect, test } from "bun:test";

import type { Talk } from "@archboard/walkthrough/talk";
import { TalkPlayback, frameOf } from "#ui/state/walkthrough-replay/talk-playback.ts";

/**
 * A playback of some events, of a walkthrough of id "wk".
 * @param events The events.
 * @param levels How loud the voice is on each frame.
 * @returns The playback.
 */
function playbackOf(
	events: readonly Talk["events"][number][],
	levels: readonly number[] = [],
): TalkPlayback {
	return new TalkPlayback(
		{
			events,
			board: {
				name: "Pipeline",
				variant: null,
				version: 1,
				walkthrough: { id: "wk", name: "For the board" },
				steps: 2,
			},
		},
		levels,
	);
}

describe("a talk played frame by frame", () => {
	test("shows an event on the first frame at or after it happened", () => {
		expect([0, 1, 1599, 1600, 1601, 3200].map(frameOf)).toEqual([0, 1, 1, 1, 2, 2]);
		const playback = playbackOf([
			{ kind: "step", at: 1601, beat: 0 },
			{ kind: "step", at: 3200, beat: 1 },
			{ kind: "end", at: 4800 },
		]);
		expect(playback.playTo(1)).toBeNull();
		expect(playback.playTo(2)).toBe(1);
		expect(playback.moment().step).toMatchObject({ walkthrough: "wk", beat: 1, answers: false });
	});

	test("keeps one subtitle line per utterance, as it now reads", () => {
		const playback = playbackOf([
			{ kind: "said", at: 0, itemId: "a1", text: "Two", final: false },
			{ kind: "said", at: 1600, itemId: "a1", text: "Two parts.", final: true },
			{ kind: "said", at: 3200, itemId: "a2", text: "Then", final: false },
			{ kind: "end", at: 4800 },
		]);
		playback.playTo(1);
		expect(playback.moment().transcript).toEqual([
			{ itemId: "a1", speaker: "assistant", text: "Two parts.", final: true },
		]);
		playback.playTo(2);
		expect(playback.moment().transcript.map((line) => line.itemId)).toEqual(["a1", "a2"]);
	});

	test("tells its listeners only on a frame where something shown changed", () => {
		const playback = playbackOf([
			{ kind: "drawn", at: 0, version: 1 },
			{ kind: "step", at: 3200, beat: 0 },
			{ kind: "end", at: 4800 },
		]);
		let told = 0;
		playback.subscribe(() => {
			told += 1;
		});
		playback.playTo(0);
		playback.playTo(1);
		expect(told).toBe(0);
		playback.playTo(2);
		expect(told).toBe(1);
	});

	test("is as loud on each frame as the voice was then, silent before the first, and says when that changes", () => {
		const playback = playbackOf([{ kind: "end", at: 6400 }], [0, 0.3, 0.3, 0.1]);
		let told = 0;
		playback.level.subscribe(() => {
			told += 1;
		});
		const heard = [playback.level.read()];
		for (const frame of [0, 1, 2, 3]) {
			playback.playTo(frame);
			heard.push(playback.level.read());
		}
		expect(heard).toEqual([0, 0, 0.3, 0.3, 0.1]);
		expect(told).toBe(2);
	});
});
