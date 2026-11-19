// When a frame of a talk is ready to capture.
//
// The talk's clock stands still while the page is waited on, so waiting costs
// the recording nothing: a frame is captured only once its fonts are loaded,
// whatever it is waiting for is there, and the page under it has stopped
// changing for two turns of the browser's event loop. Layout workers, font
// loads and React's commits all run on the browser's own time, and this is
// where the stepped clock waits for them.

import { waitUntil } from "@archboard/timing";
import { PAGE_CLOCK } from "#ui/walkthroughs/replay/clients/page-clock.ts";

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
		const look: { quiet: number; seen: number; waiting: string | null } = {
			quiet: 0,
			seen: this.#changes,
			waiting: null,
		};
		const ready = await waitUntil(
			"replay.frameReady",
			async () => {
				if (look.quiet >= 2) return true;
				look.waiting = await waitingFor(pending);
				look.quiet = look.waiting === null && this.#changes === look.seen ? look.quiet + 1 : 0;
				look.seen = this.#changes;
				return undefined;
			},
			{ clock: PAGE_CLOCK },
		);
		if (!ready.ok) throw notReady(frame, look.waiting, ready.boundSeconds);
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
 * @param seconds How long it was waited on.
 * @returns The refusal.
 */
function notReady(frame: number, waiting: string | null, seconds: number): Error {
	return new Error(
		`Frame ${frame} was not ready within ${seconds} s: it waited for ${waiting ?? "the page to stop changing"}.`,
	);
}

export { FrameReadiness };
