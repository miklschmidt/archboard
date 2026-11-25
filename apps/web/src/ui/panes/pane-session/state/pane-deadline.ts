// The one replaceable deadline a pane keeps: the debounce before it tells the
// server what it is showing.
//
// A pane report is what the server answers `browser panes` from, so it must be
// current; it is also raised by every resize, focus change and model move, so
// sending one per event would be a request per animation frame. The debounce is
// the compromise, and `immediate` is the escape for the one case that cannot
// wait — a pane arriving on a model, which the next CLI turn reads.

import { after } from "@archboard/timing";

/** The debounce between a pane change and its registry report. */
interface PaneReportDeadline {
	readonly pending: boolean;
	schedule(send: () => void, immediate?: boolean): void;
	cancel(): void;
}

/**
 * Own the replaceable debounce between a pane change and its registry report.
 * @returns The deadline.
 */
function createPaneReportDeadline(): PaneReportDeadline {
	let handle: (() => void) | null = null;
	/** Drop the pending timer, if any. */
	function cancel(): void {
		handle?.();
		handle = null;
	}
	/**
	 * Replace the pending report with this one.
	 * @param send What sends the report.
	 * @param immediate Send now rather than after the debounce.
	 */
	function schedule(send: () => void, immediate = false): void {
		cancel();
		if (immediate) {
			send();
			return;
		}
		handle = after("pane.report", () => {
			handle = null;
			send();
		});
	}
	return {
		/**
		 * Whether a deadline is armed.
		 * @returns True while one is pending.
		 */
		get pending() {
			return handle !== null;
		},
		schedule,
		cancel,
	};
}

export { createPaneReportDeadline };
