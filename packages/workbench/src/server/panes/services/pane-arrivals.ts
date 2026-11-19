import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import { durationMs, waitUntil } from "@archboard/timing";

import { panes } from "#server/panes/services/registry.ts";

/**
 * Record what a pane reports. A pane that was asked for and has now arrived is acknowledged here:
 * registration is the acknowledgement, not a reply (see the pane layout section).
 * @param registration The latest pane telemetry.
 * @returns What the pane reported before, or undefined for a pane that is new.
 */
function registerPane(registration: PaneRegistration): PaneRegistration | undefined {
	const previous = panes.get(registration.clientId);
	panes.set(registration.clientId, registration);
	if (previous === undefined) {
		notePaneOpened(registration);
	}
	return previous;
}

// ─── Pane layout acknowledgements ─────────────────────────────
//
// Layout lives in the shell, in the browser, and the server used to learn a
// pane existed only when its socket registered. The layout routes ask the
// browser to change its layout and then wait for the registry to agree. The
// acknowledgement is the pane appearing in `panes` or its socket closing —
// never a promise from the shell — because a registration is the only evidence
// anywhere in this process that a pane exists.

interface PendingPaneOpen {
	resolve: (pane: PaneRegistration) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
	/** The panes that already existed, so the new one can be told from them. */
	known: Set<string>;
}
const pendingPaneOpens = new Set<PendingPaneOpen>();

interface PendingPaneClose {
	clientId: string;
	resolve: () => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}
const pendingPaneCloses = new Set<PendingPaneClose>();

/**
 * Wait for a pane the shell was asked to open, bounded by the layout timeout.
 * @returns The promise of the pane, the panes that already existed, and how to stop waiting.
 */
function expectPaneOpen(): {
	opened: Promise<PaneRegistration>;
	known: ReadonlySet<string>;
	cancel: () => void;
} {
	let pending!: PendingPaneOpen;
	const opened = new Promise<PaneRegistration>((resolve, reject) => {
		pending = {
			resolve,
			reject,
			known: new Set(panes.keys()),
			timeout: setTimeout(() => {
				pendingPaneOpens.delete(pending);
				reject(
					new Error(
						"The browser was asked for another pane and none appeared within 10 seconds. " +
							"The tab may be running an older build of the canvas — reload it and try again.",
					),
				);
			}, durationMs("pane.layoutTimeout")),
		};
		pendingPaneOpens.add(pending);
	});
	return {
		opened,
		known: pending.known,
		/** Stop waiting: the request that asked is giving up. */
		cancel: () => {
			pendingPaneOpens.delete(pending);
			clearTimeout(pending.timeout);
		},
	};
}

/**
 * Wait for a pane the shell was asked to close, bounded by the layout timeout.
 * @param clientId The pane's client id.
 * @param place How the answer names the pane.
 * @returns The promise of the close and how to stop waiting.
 */
function expectPaneClose(
	clientId: string,
	place: string,
): { closed: Promise<void>; cancel: () => void } {
	let pending!: PendingPaneClose;
	const closed = new Promise<void>((resolve, reject) => {
		pending = {
			clientId,
			resolve,
			reject,
			timeout: setTimeout(() => {
				pendingPaneCloses.delete(pending);
				reject(
					new Error(
						`The browser was asked to close the ${place} pane and it is still there after 10 seconds. ` +
							"The tab may be running an older build of the canvas — reload it and try again.",
					),
				);
			}, durationMs("pane.layoutTimeout")),
		};
		pendingPaneCloses.add(pending);
	});
	return {
		closed,
		/** Stop waiting: the request that asked is giving up. */
		cancel: () => {
			pendingPaneCloses.delete(pending);
			clearTimeout(pending.timeout);
		},
	};
}

/**
 * A pane has registered: settle every open request that was waiting for a
 * pane it did not already know. A recording page's is not a pane anybody asked for.
 * @param registration The pane that arrived.
 */
function notePaneOpened(registration: PaneRegistration): void {
	if (registration.recording === true) {
		return;
	}
	for (const pending of pendingPaneOpens) {
		if (pending.known.has(registration.clientId)) {
			continue;
		}
		pendingPaneOpens.delete(pending);
		clearTimeout(pending.timeout);
		pending.resolve(registration);
	}
}

/**
 * A pane's socket has closed: settle every close request waiting on it.
 * @param clientId The client id of the pane that went.
 */
function notePaneClosed(clientId: string): void {
	for (const pending of pendingPaneCloses) {
		if (pending.clientId !== clientId) {
			continue;
		}
		pendingPaneCloses.delete(pending);
		clearTimeout(pending.timeout);
		pending.resolve();
	}
}

/**
 * Fail every layout request still waiting, because the server is stopping.
 */
function rejectPendingLayouts(): void {
	for (const pending of pendingPaneOpens) {
		clearTimeout(pending.timeout);
		pending.reject(new Error("The Archboard server stopped before the pane opened."));
	}
	for (const pending of pendingPaneCloses) {
		clearTimeout(pending.timeout);
		pending.reject(new Error("The Archboard server stopped before the pane closed."));
	}
	pendingPaneOpens.clear();
	pendingPaneCloses.clear();
}

/**
 * Wait until the panes the layout change moved have reported themselves since
 * it was asked for.
 *
 * The answer to a layout change names where a pane ended up, and "left" and
 * "right" are read off the rectangles the panes report. So the report has to
 * be the one taken after the shell re-laid them out, not the one from before.
 *
 * Only the panes named are waited on: the ones the shell was asked to open
 * or close and the ones sharing the screen whose rectangle changes with them.
 * A pane that registers meanwhile, or one that has gone since, is not asked
 * and not waited for, and the wait ends the moment the last named pane has
 * re-reported (TASK-153). "pane.settleCap" is the bound, never the delay.
 * @param askedAt When the layout change was asked for, as an ISO timestamp.
 * @param moved The client ids whose rectangles the change affects.
 */
async function settleAfterLayout(askedAt: string, moved: Iterable<string>): Promise<void> {
	const waitedOn = new Set(moved);
	await waitUntil("pane.settleCap", () => {
		for (const clientId of waitedOn) {
			const pane = panes.get(clientId);
			if (!pane || pane.at > askedAt) {
				waitedOn.delete(clientId);
			}
		}
		return waitedOn.size === 0 ? true : undefined;
	});
}

export {
	expectPaneClose,
	expectPaneOpen,
	notePaneClosed,
	registerPane,
	rejectPendingLayouts,
	settleAfterLayout,
};
