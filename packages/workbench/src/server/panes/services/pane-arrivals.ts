// What a pane says of itself, and the layout changes the server asks the shell for.

import { logger } from "@archboard/diagnostics/logger";
import { durationMs, waitUntil } from "@archboard/timing";

import { panesFull, resolvePane } from "#server/panes/rules/pane-addressing.ts";
import { panesInOrder, type PaneRegistration } from "#server/panes/rules/pane-layout.ts";
import { semanticPaneContextFor } from "#server/panes/services/context.ts";
import {
	arrivedOnModel,
	onScreenPanes,
	paneIsLive,
	paneKeysOnScreen,
	paneOf,
	paneResponse,
	paneVaultOf,
	panes,
	primaryPane,
	sendKeylessToPane,
	type PaneRef,
} from "#server/panes/services/registry.ts";
import { messageOf } from "#server/request/services/request-fields.ts";
import { publishPaneContext } from "#server/workbench-host/services/wiring-hooks.ts";

/** What a pane's report came to: whether it now stands, and how many panes are on screen after it. */
interface PaneRegistrationAnswer {
	/** False for a report the pane has to send again: it was not registered. */
	registered: boolean;
	/** Present when the pane was moved into another vault and has to report from there. */
	code?: "PANE_MOVED";
	paneCount: number;
}

/**
 * Take what a pane says it is showing.
 *
 * A pane exists exactly as long as the socket that owns it. A report arriving
 * without one is either a pane on its way out — React tears the canvas down
 * in its own order, so a last change can be reported after the close — or one
 * whose socket has said which pane it is for but has not yet taken that
 * pane's authority. Registering either would answer `registered: true` to a
 * pane nothing can be sent to: the socket's listeners are attached with its
 * authority, so a workbench request answered in that window is dropped on the
 * floor. The tab reports again, and the next one lands.
 *
 * A pane is in the vault the server last put it in (ADR 0050). A report naming
 * another was sent before the pane heard of its move, which this answer can
 * overtake, so the code says to wait for the move and report from there.
 *
 * A pane that was asked for and has now arrived is acknowledged here:
 * registration is the acknowledgement, not a reply (see the pane layout section).
 * @param registration The latest pane telemetry, filed under the vault its call named.
 * @returns Whether it was registered, and how many panes are on screen.
 */
function registerPane(registration: PaneRegistration): PaneRegistrationAnswer {
	if (!paneIsLive(registration.clientId)) {
		return { registered: false, paneCount: onScreenPanes().length };
	}
	if (paneVaultOf(registration.clientId) !== registration.vault) {
		return { registered: false, code: "PANE_MOVED", paneCount: onScreenPanes().length };
	}
	const previous = panes.get(registration.clientId);
	panes.set(registration.clientId, registration);
	if (previous === undefined) {
		notePaneOpened(registration);
		warnOfSharedPaneId(registration);
	}
	noteWhatChanged(previous, registration);
	return { registered: true, paneCount: onScreenPanes().length };
}

/**
 * Say so when a second browser presents a pane id another live browser already holds.
 *
 * The server is one operator's, but nothing stops a second browser (the ChatGPT desktop app,
 * on 2026-09-22) opening it too, and then "pane A" names two panes. Voice and narration address
 * the browser that started them (TASK-294); anything that still goes by the shell id alone may
 * land on the other one, and this line is how that is read afterwards. A recording page shares
 * the id with nobody: nothing goes by the shell id to it.
 * @param registration The pane that just arrived.
 */
function warnOfSharedPaneId(registration: PaneRegistration): void {
	if (registration.recording === true) {
		return;
	}
	const others = onScreenPanes().filter(
		(one) => one.paneId === registration.paneId && one.clientId !== registration.clientId,
	);
	if (others.length > 0) {
		const ids = others.map((one) => one.clientId).join(", ");
		logger().warn(
			`Pane ${registration.paneId} is presented by two browsers: ${registration.clientId} ` +
				`arrived while ${ids} still holds it. Voice addresses the browser it was started from.`,
		);
	}
}

/**
 * Act on what this registration says that the last one did not.
 * @param previous What this pane said last time, or nothing when it is new.
 * @param registration What it says now.
 */
function noteWhatChanged(
	previous: PaneRegistration | undefined,
	registration: PaneRegistration,
): void {
	const paneKey = registration.paneKey;
	const moved = previous?.paneKey !== paneKey;
	if (moved && paneKey !== null) {
		arrivedOnModel(registration.clientId, paneKey);
	}
	const userChanged = focusChange(previous, registration);
	if (moved || userChanged.length > 0) {
		publishPaneContext(registration.clientId, "focus", userChanged);
	}
}

/**
 * What of a registration the user changed by hand. Which pane they are in moves only by their
 * own hand, because nothing the server sends a browser changes it (ADR 0034); a pane that only
 * moved to another model says so in its reading, which carries its own marks, and a pane that
 * has just opened has moved nowhere.
 * @param previous What this pane said last time, or nothing when it is new.
 * @param registration What it says now.
 * @returns The focus, or nothing.
 */
function focusChange(
	previous: PaneRegistration | undefined,
	registration: PaneRegistration,
): readonly "focus"[] {
	return previous !== undefined && previous.focused !== registration.focused ? ["focus"] : [];
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

// ─── Pane layout ──────────────────────────────────────────────
//
// Layout lives in the shell, in the browser, and the server used to learn a
// pane existed only when its socket registered. That made splitting something
// only a user could do: an agent told to put a proposal beside the current
// architecture had no second pane and no way to ask for one, so it reused the
// pane in front of the human and overwrote what was there (TASK-033).
//
// These two operations ask the browser to change its layout and then wait for
// the registry to agree. How long they wait is in timing, because the settle
// cap is waiting out "pane.report", which is a number on the other side of the
// browser boundary.

/** Why a layout change was refused: no browser, a rule of the layout, or a browser that did not answer. */
type LayoutRefusal =
	| { ok: false; refusal: "no-browser" }
	| { ok: false; refusal: "full" | "only-pane" | "spec" | "timeout"; error: string };

/** Which panes are on screen after a layout change, in reading order. */
type OnScreen = ReturnType<typeof paneKeysOnScreen>;

/** The pane a split made, and the screen after it. */
type PaneOpened =
	| { ok: true; pane: PaneRef | null; paneCount: number; onScreen: OnScreen }
	| LayoutRefusal;

/** The pane a close took off the screen, and the screen after it. */
type PaneClosed =
	| {
			ok: true;
			closed: {
				paneId: string;
				clientId: string;
				place: string;
				position: number;
				paneKey: string | null;
			};
			paneCount: number;
			onScreen: OnScreen;
	  }
	| LayoutRefusal;

/**
 * The model a pane shows, for a refusal to say.
 * @param pane The pane.
 * @returns The phrase.
 */
function shownBy(pane: PaneRegistration): string {
	const context = semanticPaneContextFor(pane.clientId);
	if (context?.architecture == null) return "nothing yet";
	return context.architecture.display?.model ?? context.architecture.model;
}

/**
 * The refusal when the screen already shows as many panes as it can.
 * @param onScreen The panes on screen.
 * @returns What the refusal says.
 */
function tooManyPanes(onScreen: PaneRegistration[]): string {
	const showing = panesInOrder(onScreen)
		.map((entry) => `${entry.place} (${shownBy(entry.pane)})`)
		.join(", ");
	return (
		`The canvas is already showing ${onScreen.length} panes: ${showing}. ` +
		"Point one of them at another reading with `browser show <name> --pane <spec>`, " +
		"or close one first with `browser close <spec>`."
	);
}

/**
 * Split the canvas: one more pane, side by side with what is already there.
 *
 * It takes no model. What lands in the new pane is a separate act — `browser
 * show ... --pane <the pane this answered with>` — so that showing a model
 * stays the one thing that decides which model a pane holds (ADR 0020).
 *
 * The browser is asked only after the wait for its answer is in place, so an
 * answer cannot arrive unheard, and a request the browser could not take stops
 * that wait at once.
 * @returns The pane it made and the screen after, or why it made none.
 */
async function openPane(): Promise<PaneOpened> {
	const answering = primaryPane();
	if (!answering) {
		return { ok: false, refusal: "no-browser" };
	}
	const onScreen = onScreenPanes();
	if (panesFull(onScreen)) {
		return { ok: false, refusal: "full", error: tooManyPanes(onScreen) };
	}
	const askedAt = new Date().toISOString();
	const { opened, known, cancel } = expectPaneOpen();
	if (!sendKeylessToPane(answering.clientId, { type: "pane_open" })) {
		cancel();
		return { ok: false, refusal: "no-browser" };
	}
	try {
		const pane = await opened;
		// The new pane and every pane already on screen when the split was
		// asked for: the shell re-lays all of them side by side.
		await settleAfterLayout(askedAt, [...known, pane.clientId]);
		const paneCount = onScreenPanes().length;
		logger().info(`Pane opened on request: ${pane.paneId} (${paneCount} on screen)`);
		const { pane: placed } = paneResponse(paneOf(pane.clientId) ?? pane);
		return { ok: true, pane: placed, paneCount, onScreen: paneKeysOnScreen() };
	} catch (error) {
		return { ok: false, refusal: "timeout", error: messageOf(error) };
	}
}

/**
 * Which pane a close request names, and how to call it in the answer.
 * @param registrations Every pane on screen.
 * @param spec The pane spec, possibly empty.
 * @returns The pane and its place.
 */
function closeTarget(
	registrations: PaneRegistration[],
	spec: string,
): { target: PaneRegistration; place: string; position: number } {
	if (!spec) {
		throw new Error(
			"Say which pane to close. " +
				panesInOrder(registrations)
					.map((entry) => `\`browser close ${entry.place}\` drops ${shownBy(entry.pane)}`)
					.join(", ") +
				".",
		);
	}
	const target = resolvePane(registrations, spec);
	const placed = panesInOrder(registrations).find(
		(entry) => entry.pane.clientId === target.clientId,
	);
	return { target, place: placed?.place ?? spec, position: placed?.position ?? 0 };
}

/**
 * Close one pane, named the way every other pane is named.
 *
 * Always named: unlike opening a model, which can only land somewhere visible
 * and wrong, closing takes a model off the screen, and guessing which one is
 * the mistake that costs the human the half they were reading. Closing the only
 * pane is refused, because it would leave the canvas showing nothing with no
 * way back except reloading the browser.
 * @param spec The pane the caller named, trimmed, or empty when it named none.
 * @returns The pane it closed and the screen after, or why it closed none.
 */
async function closePane(spec: string): Promise<PaneClosed> {
	const registrations = onScreenPanes();
	if (registrations.length === 0) {
		return { ok: false, refusal: "no-browser" };
	}
	if (registrations.length === 1) {
		return {
			ok: false,
			refusal: "only-pane",
			error:
				"That is the only pane on screen, and closing it would leave the canvas showing nothing " +
				"with no way back except reloading the browser. The architecture is unaffected either way — " +
				"point the pane somewhere else with `browser show <name> --pane <spec>` instead.",
		};
	}
	let target: PaneRegistration;
	let place: string;
	let position: number;
	try {
		({ target, place, position } = closeTarget(registrations, spec));
	} catch (error) {
		return { ok: false, refusal: "spec", error: messageOf(error) };
	}
	const askedAt = new Date().toISOString();
	const { closed, cancel } = expectPaneClose(target.clientId, place);
	if (!sendKeylessToPane(target.clientId, { type: "pane_close" })) {
		cancel();
		return { ok: false, refusal: "no-browser" };
	}
	try {
		await closed;
		// The panes that stay: closing one widens the rest.
		await settleAfterLayout(
			askedAt,
			registrations
				.map((entry) => entry.clientId)
				.filter((clientId) => clientId !== target.clientId),
		);
		const paneCount = onScreenPanes().length;
		logger().info(`Pane closed on request: ${target.paneId} (${paneCount} left on screen)`);
		const { paneId, clientId, paneKey } = target;
		return {
			ok: true,
			closed: { paneId, clientId, place, position, paneKey },
			paneCount,
			onScreen: paneKeysOnScreen(),
		};
	} catch (error) {
		return { ok: false, refusal: "timeout", error: messageOf(error) };
	}
}

export { closePane, notePaneClosed, openPane, registerPane, rejectPendingLayouts };
export type { LayoutRefusal };
