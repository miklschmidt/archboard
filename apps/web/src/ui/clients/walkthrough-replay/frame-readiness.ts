// When a frame of a talk is ready to capture.
//
// The talk's clock stands still while the page is waited on, so waiting costs
// the recording nothing: a frame is captured only once its fonts are loaded,
// whatever it is waiting for is there, and the page under it has stopped
// changing for two turns of the browser's event loop. Layout workers, font
// loads and React's commits all run on the browser's own time, and this is
// where the stepped clock waits for them.

import { REPLAY_MS } from "@archboard/timing";

/**
 * One turn of the browser's event loop.
 * @returns Once it has turned.
 */
async function turn(): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

/** Watches a page for the moment a frame of it is ready. */
class FrameReadiness {
	#changes = 0;

	/**
	 * Watch what is under an element.
	 * @param root The element.
	 */
	constructor(root: Element) {
		new MutationObserver((records) => {
			this.#changes += records.length;
		}).observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
	}

	/**
	 * Wait until nothing is pending and the page has stopped changing.
	 * @param pending What the frame still waits for, in words, or null when nothing.
	 * @param frame Which frame, for the refusal.
	 * @returns Once the frame is ready.
	 * @throws {Error} Naming what was pending when it is not ready in time.
	 */
	async until(pending: () => string | null, frame: number): Promise<void> {
		const deadline = performance.now() + REPLAY_MS.frameReady;
		let quiet = 0;
		let seen = this.#changes;
		while (quiet < 2) {
			// oxlint-disable-next-line no-await-in-loop -- each look waits for the fonts the last one may have started loading
			const waiting = await waitingFor(pending);
			quiet = waiting === null && this.#changes === seen ? quiet + 1 : 0;
			seen = this.#changes;
			if (performance.now() > deadline) throw notReady(frame, waiting);
			// oxlint-disable-next-line no-await-in-loop -- the page is looked at again only after the browser has had a turn
			await turn();
		}
	}
}

/**
 * What a frame waits for, fonts first.
 * @param pending What else it waits for, in words, or null when nothing.
 * @returns What it waits for, or null when nothing.
 */
async function waitingFor(pending: () => string | null): Promise<string | null> {
	await document.fonts.ready;
	return document.fonts.status === "loaded" ? pending() : "the fonts";
}

/**
 * Why a frame was not ready in time.
 * @param frame The frame.
 * @param waiting What it waited for, or null when only the page kept changing.
 * @returns The refusal.
 */
function notReady(frame: number, waiting: string | null): Error {
	return new Error(
		`Frame ${frame} was not ready within ${REPLAY_MS.frameReady / 1000} s: it waited for ${waiting ?? "the page to stop changing"}.`,
	);
}

export { FrameReadiness };
