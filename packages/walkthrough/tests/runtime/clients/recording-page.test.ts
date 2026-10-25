import { expect, test } from "bun:test";

import { RECORDER_MS } from "@archboard/timing";
import type { RecordingState } from "#shared/protocol/recording-page.ts";
import { drive, type RecordingPageHandle } from "#runtime/clients/recording-page.ts";

// An interrupt stops a recording at whatever call it lands in. A page call is
// where the recorder spends most of its time, and an interrupt that lands in
// one used to be lost: the recorder went on polling a page it had been told to
// leave, and on to saving the voice.

const LOADING: RecordingState = {
	phase: "loading",
	walkthrough: "w1",
	step: null,
	of: null,
	failure: null,
	durationMs: null,
};

test("an interrupt that lands while the page is answering ends the recording at that call", async () => {
	const controller = new AbortController();
	const interrupt = new Error("interrupted");
	let asked = 0;
	const page: RecordingPageHandle = {
		/**
		 * Answer that the page is still loading, after the interrupt has landed.
		 * @returns The page's state.
		 */
		evaluate: async () => {
			asked += 1;
			controller.abort(interrupt);
			return LOADING;
		},
		saveBlob: async () => 0,
	};
	const recording = drive(page, {
		voice: "never-written.wav",
		signal: controller.signal,
		onProgress: () => undefined,
	});
	// Several polls' worth: a recorder that missed the interrupt is still polling by then.
	const stillGoing = Bun.sleep(RECORDER_MS.poll * 4).then(() => "still recording");
	await expect(Promise.race([recording, stillGoing])).rejects.toBe(interrupt);
	expect(asked).toBe(1);
});
