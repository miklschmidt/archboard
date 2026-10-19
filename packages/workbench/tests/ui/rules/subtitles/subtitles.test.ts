// Whether subtitles stay with the voice.
//
// The voice model's transcript arrives a word at a time as it is spoken, so a word is shown when
// it arrives. What is guarded is what a person would notice: what was said before the subtitles
// began watching is not replayed; a subtitle goes when the linger runs out on the latest word,
// which is also what an interruption looks like, and returns with the next; a cue fills the box's
// two lines and ends early only where a sentence ends on the second; and a cue on screen is never
// cut differently because more words arrived, so the text a person is reading does not re-flow.

import { describe, expect, test } from "bun:test";

import { cuesOf, wordsOf } from "#ui/rules/subtitles/cues.ts";
import { progressMark, subtitleShowing } from "#ui/rules/subtitles/recency.ts";

describe("subtitle recency", () => {
	const before = { itemId: "item-1", words: 12 };
	const watch = { from: progressMark(before), lapsed: null };

	test("what had been said before watching began is not shown, and the next word is", () => {
		expect(subtitleShowing(before, watch)).toBe(false);
		expect(subtitleShowing({ itemId: "item-1", words: 13 }, watch)).toBe(true);
	});

	test("it goes when the linger ran out on the latest word, and comes back with the next", () => {
		const latest = { itemId: "item-1", words: 13 };
		const lapsed = { ...watch, lapsed: progressMark(latest) };
		expect(subtitleShowing(latest, lapsed)).toBe(false);
		expect(subtitleShowing({ itemId: "item-1", words: 14 }, lapsed)).toBe(true);
	});

	test("another utterance shows from its first word, never before it has one", () => {
		expect(subtitleShowing({ itemId: "item-2", words: 0 }, watch)).toBe(false);
		expect(subtitleShowing({ itemId: "item-2", words: 1 }, watch)).toBe(true);
		// The same count of words in another utterance is still something new.
		expect(subtitleShowing({ itemId: "item-2", words: 12 }, watch)).toBe(true);
	});
});

/**
 * How many lines a text takes in a box some characters wide that breaks lines at spaces, as a
 * browser does: the line measure the cues are cut against, stated in characters.
 * @param width How many characters a line holds.
 * @returns The line count.
 */
function wrappedAt(width: number): (text: string) => number {
	return (text) => {
		let lines = 1;
		let used = 0;
		for (const word of text.split(" ")) {
			const needed = used === 0 ? word.length : used + 1 + word.length;
			if (needed > width && used > 0) {
				lines += 1;
				used = word.length;
			} else {
				used = needed;
			}
		}
		return lines;
	};
}

describe("subtitle cues", () => {
	const text =
		"An agent states meaning through the command line. The server checks the write, takes the lease of the board, commits the whole family to disk and only then answers. Nothing else writes a board, which is refreshingly strict.";
	const words = wordsOf(text);
	const lines = wrappedAt(40);
	const cues = cuesOf(words, lines);

	test("hold every word once, in order, on two lines at most", () => {
		expect(cues.flatMap((cue) => cue.words)).toEqual(words);
		expect(
			cues.every(
				(cue, index) => cue.start === cues.slice(0, index).reduce((n, c) => n + c.words.length, 0),
			),
		).toBe(true);
		expect(cues.every((cue) => lines(cue.words.join(" ")) <= 2)).toBe(true);
	});

	test("end at a sentence's end on the second line, and otherwise where a third would begin", () => {
		expect(cues.map((cue) => cue.words.join(" "))).toEqual([
			// The sentence ends on the second line.
			"An agent states meaning through the command line.",
			// Both lines are full: "family" would begin a third.
			"The server checks the write, takes the lease of the board, commits the whole",
			// A sentence that ends on the first line does not end the cue.
			"family to disk and only then answers. Nothing else writes a board, which is",
			"refreshingly strict.",
		]);
	});

	/**
	 * The words of each cue once only some of the utterance has arrived.
	 * @param received How many words have arrived.
	 * @returns Each cue's words, in order.
	 */
	function cutAfter(received: number): string[][] {
		return cuesOf(words.slice(0, received), lines).map((cue) => Array.from(cue.words));
	}

	test("a cue already on screen is never cut differently because more words arrived", () => {
		const whole = cutAfter(words.length);
		for (let received = 1; received <= words.length; received += 1) {
			const soFar = cutAfter(received);
			const growing = soFar.pop() ?? [];
			expect(soFar).toEqual(whole.slice(0, soFar.length));
			// The cue being spoken is the beginning of the cue it will become.
			expect(whole[soFar.length]?.slice(0, growing.length)).toEqual(growing);
		}
	});
});
