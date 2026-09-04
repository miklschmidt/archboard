import { expect, test } from "bun:test";

import type {
	BrowserWorkbenchSocket,
	BrowserWorkbenchState,
} from "../../workbench-transport/index.js";
import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import {
	attachCanvasWorkbenchAfterRegistration,
	createCanvasPaneRegistration,
	createCanvasPaneReportSequencer,
	type CanvasPaneReportCurrent,
	type CanvasPaneReportEffects,
	type CanvasPaneReportOutcome,
	type CanvasPaneReportSequencer,
} from "../workbench-socket.js";

class FakeSocket extends EventTarget implements BrowserWorkbenchSocket {
	readyState = 1;

	send(): void {}

	close(): void {
		this.readyState = 3;
	}
}

const CONNECTED_STATE: BrowserWorkbenchState = {
	kind: "readiness",
	state: "thread_capable",
	connection: "connected",
	snapshot: {} as BrowserSnapshot,
	sequence: 1,
};

const REGISTERED: CanvasPaneReportOutcome = { settled: true, registered: true };
const REFUSED: CanvasPaneReportOutcome = { settled: true, registered: false };
const FAILED: CanvasPaneReportOutcome = { settled: false };

/**
 * One in-flight pane report, dispatched under whatever identity the pane held
 * at the time. Nothing here re-implements the decision; it only holds the
 * dispatch identity the way the hook's closure does.
 */
function dispatch(sequencer: CanvasPaneReportSequencer, current: CanvasPaneReportCurrent) {
	return {
		request: sequencer.begin(current.generation),
		socket: current.socket,
		registration: current.registration,
	};
}

/** The pane applying the decision, the way useCanvasSession applies it. */
function applied(
	effects: CanvasPaneReportEffects,
	registration: { acknowledge: (registered: boolean) => boolean } | null,
	health: (boolean | null)[],
	freshness: string[],
): void {
	if (effects.superseded) return;
	if (effects.acknowledgeRegistration) registration?.acknowledge(true);
	if (effects.connectionHealth !== null) health.push(effects.connectionHealth);
	if (effects.clearPublishedReport) freshness.push("cleared");
	else if (effects.acceptPaneListing) freshness.push("published");
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

test("a newer refusal ignores an older success, and a later report recovers health", () => {
	const socket = new FakeSocket();
	const registration = createCanvasPaneRegistration(socket, 1);
	const current: CanvasPaneReportCurrent = { socket, generation: 1, registration };
	const sequencer = createCanvasPaneReportSequencer();
	const health: (boolean | null)[] = [];
	const freshness: string[] = [];
	let attachCount = 0;
	const attachPromise = attachCanvasWorkbenchAfterRegistration({
		registration,
		isCurrent: () => true,
		attach: async () => {
			attachCount += 1;
			return CONNECTED_STATE;
		},
	});

	const olderSuccess = dispatch(sequencer, current);
	const newerRefusal = dispatch(sequencer, current);
	applied(sequencer.settle(newerRefusal, current, REFUSED), registration, health, freshness);
	expect(health).toEqual([false]);
	expect(freshness).toEqual(["cleared"]);

	expect(sequencer.settle(olderSuccess, current, REGISTERED).superseded).toBeTrue();
	expect(health).toEqual([false]);

	// The one-shot attach latch is released by the first current positive result,
	// after the earlier refusal, and never released twice.
	applied(
		sequencer.settle(dispatch(sequencer, current), current, REGISTERED),
		registration,
		health,
		freshness,
	);
	applied(
		sequencer.settle(dispatch(sequencer, current), current, FAILED),
		registration,
		health,
		freshness,
	);
	applied(
		sequencer.settle(dispatch(sequencer, current), current, REGISTERED),
		registration,
		health,
		freshness,
	);
	expect(health).toEqual([false, true, false, true]);
	expect(freshness).toEqual(["cleared", "published", "cleared", "published"]);
	return attachPromise.then((state) => {
		expect(state).toBe(CONNECTED_STATE);
		expect(attachCount).toBe(1);
		return undefined;
	});
});

test("a stale socket generation or registration cannot change the current pane", async () => {
	const firstSocket = new FakeSocket();
	const secondSocket = new FakeSocket();
	const firstRegistration = createCanvasPaneRegistration(firstSocket, 1);
	const secondRegistration = createCanvasPaneRegistration(secondSocket, 2);
	const sequencer = createCanvasPaneReportSequencer();
	const health: (boolean | null)[] = [];
	const freshness: string[] = [];
	const attachedSockets: BrowserWorkbenchSocket[] = [];
	let current: CanvasPaneReportCurrent = {
		socket: firstSocket,
		generation: 1,
		registration: firstRegistration,
	};
	const firstAttach = attachCanvasWorkbenchAfterRegistration({
		registration: firstRegistration,
		isCurrent: () => current.registration === firstRegistration,
		attach: async () => {
			attachedSockets.push(firstSocket);
			return CONNECTED_STATE;
		},
	});
	const staleReport = dispatch(sequencer, current);

	current = { socket: secondSocket, generation: 2, registration: secondRegistration };
	const secondAttach = attachCanvasWorkbenchAfterRegistration({
		registration: secondRegistration,
		isCurrent: () => current.registration === secondRegistration,
		attach: async () => {
			attachedSockets.push(secondSocket);
			return CONNECTED_STATE;
		},
	});
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
	const dispatched = {
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
