import { expect, test } from "bun:test";

import type { PaneSocket, WorkbenchTransportState } from "@/ui/canvas/workbench-port";
import {
	attachCanvasWorkbenchAfterRegistration,
	createCanvasPaneRegistration,
	createCanvasPaneReportSequencer,
	type CanvasPaneRegistration,
	type CanvasPaneReportCurrent,
	type CanvasPaneReportDispatch,
	type CanvasPaneReportEffects,
	type CanvasPaneReportOutcome,
	type CanvasPaneReportSequencer,
} from "@/ui/canvas/workbench-socket";

/** A socket that never sends. */
class FakeSocket extends EventTarget implements PaneSocket {
	readyState = 1;

	/** Nothing goes anywhere. */
	send(): void {
		// A fake socket has no server.
	}

	/** Close it. */
	close(): void {
		this.readyState = 3;
	}
}

const CONNECTED_STATE: WorkbenchTransportState = {
	kind: "readiness",
	state: "thread_capable",
	connection: "connected",
	snapshot: {},
	sequence: 1,
};

const REGISTERED: CanvasPaneReportOutcome = { settled: true, registered: true };
const REFUSED: CanvasPaneReportOutcome = { settled: true, registered: false };
const FAILED: CanvasPaneReportOutcome = { settled: false };

/**
 * One in-flight pane report, dispatched under whatever identity the pane held
 * at the time. Nothing here re-implements the decision; it only holds the
 * dispatch identity the way the pane's closure does.
 * @param sequencer The sequencer.
 * @param current The pane's identity now.
 * @returns The dispatch.
 */
function dispatch(
	sequencer: CanvasPaneReportSequencer,
	current: CanvasPaneReportCurrent,
): CanvasPaneReportDispatch {
	return {
		request: sequencer.begin(current.generation),
		socket: current.socket,
		registration: current.registration,
	};
}

/**
 * The freshness half of applying a decision.
 * @param effects What the sequencer permits.
 * @param freshness Where freshness changes go.
 */
function applyFreshness(effects: CanvasPaneReportEffects, freshness: string[]): void {
	if (effects.clearPublishedReport) {
		freshness.push("cleared");
	} else if (effects.acceptPaneListing) {
		freshness.push("published");
	}
}

/**
 * The pane applying the decision, the way the session applies it.
 * @param effects What the sequencer permits.
 * @param registration The registration to acknowledge, if any.
 * @param health Where health changes go.
 * @param freshness Where freshness changes go.
 */
function applied(
	effects: CanvasPaneReportEffects,
	registration: CanvasPaneRegistration | null,
	health: (boolean | null)[],
	freshness: string[],
): void {
	if (effects.superseded) {
		return;
	}
	if (effects.acknowledgeRegistration) {
		registration?.acknowledge(true);
	}
	if (effects.connectionHealth !== null) {
		health.push(effects.connectionHealth);
	}
	applyFreshness(effects, freshness);
}

/**
 * An attach released after registration that records which socket it attached.
 * @param registration The registration.
 * @param isCurrent Whether the registration is still the pane's.
 * @param socket The socket the attach is for.
 * @param attached Where attached sockets go.
 * @returns The attached state, or null.
 */
function attachRecording(
	registration: CanvasPaneRegistration,
	isCurrent: () => boolean,
	socket: PaneSocket,
	attached: PaneSocket[],
): Promise<WorkbenchTransportState | null> {
	/**
	 * Record the attach.
	 * @returns The connected state.
	 */
	async function attach(): Promise<WorkbenchTransportState> {
		attached.push(socket);
		await Promise.resolve();
		return CONNECTED_STATE;
	}
	return attachCanvasWorkbenchAfterRegistration({ registration, isCurrent, attach });
}

/**
 * Always current.
 * @returns True.
 */
function always(): boolean {
	return true;
}

test("a newer same-generation pane report wins over an older refusal and an older failure", () => {
	for (const stale of [REFUSED, FAILED]) {
		const socket = new FakeSocket();
		const registration = createCanvasPaneRegistration(socket, 1);
		const current: CanvasPaneReportCurrent = { socket, generation: 1, registration };
		const sequencer = createCanvasPaneReportSequencer();
		const health: (boolean | null)[] = [];
		const freshness: string[] = [];

		const older = dispatch(sequencer, current);
		const newer = dispatch(sequencer, current);
		expect(newer.request.requestId).toBeGreaterThan(older.request.requestId);

		applied(sequencer.settle(newer, current, REGISTERED), registration, health, freshness);
		expect(health).toEqual([true]);
		expect(freshness).toEqual(["published"]);

		const olderEffects = sequencer.settle(older, current, stale);
		expect(olderEffects.superseded).toBeTrue();
		applied(olderEffects, registration, health, freshness);
		expect(health).toEqual([true]);
		expect(freshness).toEqual(["published"]);
	}
});

test("a newer refusal ignores an older success, and a later report recovers health", async () => {
	const socket = new FakeSocket();
	const registration = createCanvasPaneRegistration(socket, 1);
	const current: CanvasPaneReportCurrent = { socket, generation: 1, registration };
	const sequencer = createCanvasPaneReportSequencer();
	const health: (boolean | null)[] = [];
	const freshness: string[] = [];
	const attached: PaneSocket[] = [];
	const attachPromise = attachRecording(registration, always, socket, attached);

	const olderSuccess = dispatch(sequencer, current);
	const newerRefusal = dispatch(sequencer, current);
	applied(sequencer.settle(newerRefusal, current, REFUSED), registration, health, freshness);
	expect(health).toEqual([false]);
	expect(freshness).toEqual(["cleared"]);

	expect(sequencer.settle(olderSuccess, current, REGISTERED).superseded).toBeTrue();
	expect(health).toEqual([false]);

	// The one-shot attach latch is released by the first current positive result,
	// after the earlier refusal, and never released twice.
	for (const outcome of [REGISTERED, FAILED, REGISTERED]) {
		applied(
			sequencer.settle(dispatch(sequencer, current), current, outcome),
			registration,
			health,
			freshness,
		);
	}
	expect(health).toEqual([false, true, false, true]);
	expect(freshness).toEqual(["cleared", "published", "cleared", "published"]);
	expect(await attachPromise).toBe(CONNECTED_STATE);
	expect(attached).toEqual([socket]);
});

test("a stale socket generation or registration cannot change the current pane", async () => {
	const firstSocket = new FakeSocket();
	const secondSocket = new FakeSocket();
	const firstRegistration = createCanvasPaneRegistration(firstSocket, 1);
	const secondRegistration = createCanvasPaneRegistration(secondSocket, 2);
	const sequencer = createCanvasPaneReportSequencer();
	const health: (boolean | null)[] = [];
	const freshness: string[] = [];
	const attachedSockets: PaneSocket[] = [];
	let current: CanvasPaneReportCurrent = {
		socket: firstSocket,
		generation: 1,
		registration: firstRegistration,
	};
	const firstAttach = attachRecording(
		firstRegistration,
		() => current.registration === firstRegistration,
		firstSocket,
		attachedSockets,
	);
	const staleReport = dispatch(sequencer, current);

	current = { socket: secondSocket, generation: 2, registration: secondRegistration };
	const secondAttach = attachRecording(
		secondRegistration,
		() => current.registration === secondRegistration,
		secondSocket,
		attachedSockets,
	);
	const currentReport = dispatch(sequencer, current);
	applied(
		sequencer.settle(currentReport, current, REGISTERED),
		secondRegistration,
		health,
		freshness,
	);
	expect(sequencer.settle(staleReport, current, REGISTERED).superseded).toBeTrue();

	expect(health).toEqual([true]);
	expect(freshness).toEqual(["published"]);
	expect(await secondAttach).toBe(CONNECTED_STATE);
	expect(attachedSockets).toEqual([secondSocket]);
	// Resolve the retired gate only to dispose the test's pending promise; its
	// current-generation check must still prevent an old attach.
	expect(firstRegistration.acknowledge(true)).toBeTrue();
	expect(await firstAttach).toBeNull();
	expect(attachedSockets).toEqual([secondSocket]);
});

test("a report dispatched from a replaced socket on the same generation changes nothing", () => {
	const reportSocket = new FakeSocket();
	const replacementSocket = new FakeSocket();
	const registration = createCanvasPaneRegistration(replacementSocket, 1);
	const sequencer = createCanvasPaneReportSequencer();
	const dispatched: CanvasPaneReportDispatch = {
		request: sequencer.begin(1),
		socket: reportSocket,
		registration: null,
	};
	const effects = sequencer.settle(
		dispatched,
		{ socket: replacementSocket, generation: 1, registration },
		REGISTERED,
	);
	expect(effects).toMatchObject({
		superseded: false,
		acknowledgeRegistration: false,
		connectionHealth: null,
		clearPublishedReport: false,
		acceptPaneListing: false,
		applyStaleBuild: false,
	});
});
