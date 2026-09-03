import { PANE_DEBOUNCE_MS } from "../../shared/timing/timing";

export interface CanvasDeadlineClock {
	set(delayMs: number, callback: () => void): unknown;
	clear(handle: unknown): void;
}

const browserClock: CanvasDeadlineClock = {
	set: (delayMs, callback) => setTimeout(callback, delayMs),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface PaneReportDeadline {
	readonly pending: boolean;
	schedule(send: () => void, immediate?: boolean): void;
	cancel(): void;
}

/** Owns the replaceable debounce between a pane change and its registry report. */
export function createPaneReportDeadline(
	clock: CanvasDeadlineClock = browserClock,
): PaneReportDeadline {
	let handle: unknown = null;
	const cancel = (): void => {
		if (handle === null) return;
		clock.clear(handle);
		handle = null;
	};
	return {
		get pending() {
			return handle !== null;
		},
		schedule(send, immediate = false) {
			cancel();
			if (immediate) {
				send();
				return;
			}
			handle = clock.set(PANE_DEBOUNCE_MS, () => {
				handle = null;
				send();
			});
		},
		cancel,
	};
}

export interface HoldRenewalDeadline {
	readonly pending: boolean;
	schedule(delayMs: number, renew: () => void): boolean;
	cancel(): void;
}

/** Owns the single renewal deadline for one pane's current human hold. */
export function createHoldRenewalDeadline(
	clock: CanvasDeadlineClock = browserClock,
): HoldRenewalDeadline {
	let handle: unknown = null;
	const cancel = (): void => {
		if (handle === null) return;
		clock.clear(handle);
		handle = null;
	};
	return {
		get pending() {
			return handle !== null;
		},
		schedule(delayMs, renew) {
			if (handle !== null) return false;
			handle = clock.set(delayMs, () => {
				handle = null;
				renew();
			});
			return true;
		},
		cancel,
	};
}
