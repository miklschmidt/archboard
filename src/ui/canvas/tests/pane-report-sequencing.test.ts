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
	type CanvasPaneRegistration,
	type CanvasPaneReportRequest,
	type CanvasPaneReportSequencer,
} from "../workbench-socket.js";

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
	let resolveDeferred!: (value: T) => void;
	let rejectDeferred!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolve, reject) => {
		resolveDeferred = resolve;
		rejectDeferred = reject;
	});
	return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}

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

interface CurrentPaneReport {
	readonly socket: BrowserWorkbenchSocket;
	readonly generation: number;
	readonly registration: CanvasPaneRegistration;
}

interface DispatchedPaneReport {
	readonly request: CanvasPaneReportRequest;
	readonly response: Deferred<{ registered: boolean }>;
	readonly settled: Promise<void>;
}

function dispatchPaneReport(
	sequencer: CanvasPaneReportSequencer,
	generation: number,
	reportSocket: BrowserWorkbenchSocket,
	current: { value: CurrentPaneReport },
	health: boolean[],
	freshness: string[],
): DispatchedPaneReport {
	const response = deferred<{ registered: boolean }>();
	const reportRequest = sequencer.begin(generation);
	const reportRegistration = current.value.registration;
	const isCurrent = (): boolean => {
		const currentPane = current.value;
		return (
			currentPane.socket === reportSocket &&
			currentPane.generation === generation &&
			currentPane.registration === reportRegistration
		);
	};
	const apply = (registered: boolean): void => {
		if (!isCurrent()) return;
		if (registered) reportRegistration.acknowledge(true);
		health.push(registered);
		freshness.push(registered ? "published" : "cleared");
	};
	const settled = response.promise.then(
		(result) => {
			sequencer.settle(reportRequest, current.value.generation, result, (currentResult) => {
				apply(currentResult.registered);
			});
			return undefined;
		},
		() => {
			sequencer.settle(reportRequest, current.value.generation, undefined, () => apply(false));
			return undefined;
		},
	);
	return { request: reportRequest, response, settled };
}

test("newer same-generation pane-report success wins over older rejection and negative result", async () => {
	for (const staleKind of ["rejection", "negative"] as const) {
		const socket = new FakeSocket();
		const registration = createCanvasPaneRegistration(socket, 1);
		const current: { value: CurrentPaneReport } = {
			value: { socket, generation: 1, registration },
		};
		const sequencer = createCanvasPaneReportSequencer();
		const health: boolean[] = [];
		const freshness: string[] = [];
		let attachCount = 0;
		let subscribeCount = 0;
		const attachPromise = attachCanvasWorkbenchAfterRegistration({
			registration,
			isCurrent: () =>
				current.value.socket === socket &&
				current.value.generation === 1 &&
				current.value.registration === registration,
			attach: async () => {
				attachCount += 1;
				subscribeCount += 1;
				return CONNECTED_STATE;
			},
		});
		const older = dispatchPaneReport(sequencer, 1, socket, current, health, freshness);
		const newer = dispatchPaneReport(sequencer, 1, socket, current, health, freshness);
		expect(newer.request.requestId).toBeGreaterThan(older.request.requestId);

		newer.response.resolve({ registered: true });
		await newer.settled;
		expect(health).toEqual([true]);
		expect(freshness).toEqual(["published"]);
		expect(await attachPromise).toBe(CONNECTED_STATE);

		if (staleKind === "rejection") older.response.reject(new Error("older report lost"));
		else older.response.resolve({ registered: false });
		await older.settled;
		expect(health).toEqual([true]);
		expect(freshness).toEqual(["published"]);
		expect(attachCount).toBe(1);
		expect(subscribeCount).toBe(1);
	}
});

test("a newer failure ignores older success, then current recovery keeps one attach and subscribe", async () => {
	const socket = new FakeSocket();
	const registration = createCanvasPaneRegistration(socket, 1);
	const current: { value: CurrentPaneReport } = {
		value: { socket, generation: 1, registration },
	};
	const sequencer = createCanvasPaneReportSequencer();
	const health: boolean[] = [];
	const freshness: string[] = [];
	let attachCount = 0;
	let subscribeCount = 0;
	const attachPromise = attachCanvasWorkbenchAfterRegistration({
		registration,
		isCurrent: () => current.value.registration === registration,
		attach: async () => {
			attachCount += 1;
			subscribeCount += 1;
			return CONNECTED_STATE;
		},
	});

	const olderSuccess = dispatchPaneReport(sequencer, 1, socket, current, health, freshness);
	const newerFailure = dispatchPaneReport(sequencer, 1, socket, current, health, freshness);
	newerFailure.response.resolve({ registered: false });
	await newerFailure.settled;
	expect(health).toEqual([false]);
	expect(freshness).toEqual(["cleared"]);
	expect(attachCount).toBe(0);

	olderSuccess.response.resolve({ registered: true });
	await olderSuccess.settled;
	expect(health).toEqual([false]);
	expect(freshness).toEqual(["cleared"]);
	expect(attachCount).toBe(0);

	const recovery = dispatchPaneReport(sequencer, 1, socket, current, health, freshness);
	recovery.response.resolve({ registered: true });
	await recovery.settled;
	expect(health).toEqual([false, true]);
	expect(freshness).toEqual(["cleared", "published"]);
	expect(await attachPromise).toBe(CONNECTED_STATE);
	expect(attachCount).toBe(1);
	expect(subscribeCount).toBe(1);

	const currentFailure = dispatchPaneReport(sequencer, 1, socket, current, health, freshness);
	currentFailure.response.resolve({ registered: false });
	await currentFailure.settled;
	const currentRecovery = dispatchPaneReport(sequencer, 1, socket, current, health, freshness);
	currentRecovery.response.resolve({ registered: true });
	await currentRecovery.settled;
	expect(health).toEqual([false, true, false, true]);
	expect(freshness).toEqual(["cleared", "published", "cleared", "published"]);
	expect(attachCount).toBe(1);
	expect(subscribeCount).toBe(1);
});

test("a stale socket generation cannot mutate the current pane report or transport", async () => {
	const firstSocket = new FakeSocket();
	const secondSocket = new FakeSocket();
	const firstRegistration = createCanvasPaneRegistration(firstSocket, 1);
	const secondRegistration = createCanvasPaneRegistration(secondSocket, 2);
	const current: { value: CurrentPaneReport } = {
		value: { socket: firstSocket, generation: 1, registration: firstRegistration },
	};
	const sequencer = createCanvasPaneReportSequencer();
	const health: boolean[] = [];
	const freshness: string[] = [];
	const attachedSockets: BrowserWorkbenchSocket[] = [];
	let subscribeCount = 0;
	const firstAttach = attachCanvasWorkbenchAfterRegistration({
		registration: firstRegistration,
		isCurrent: () => current.value.registration === firstRegistration,
		attach: async () => {
			attachedSockets.push(firstSocket);
			subscribeCount += 1;
			return CONNECTED_STATE;
		},
	});
	const staleReport = dispatchPaneReport(sequencer, 1, firstSocket, current, health, freshness);

	current.value = { socket: secondSocket, generation: 2, registration: secondRegistration };
	const secondAttach = attachCanvasWorkbenchAfterRegistration({
		registration: secondRegistration,
		isCurrent: () => current.value.registration === secondRegistration,
		attach: async () => {
			attachedSockets.push(secondSocket);
			subscribeCount += 1;
			return CONNECTED_STATE;
		},
	});
	const currentReport = dispatchPaneReport(sequencer, 2, secondSocket, current, health, freshness);
	currentReport.response.resolve({ registered: true });
	await currentReport.settled;
	staleReport.response.resolve({ registered: true });
	await staleReport.settled;

	expect(health).toEqual([true]);
	expect(freshness).toEqual(["published"]);
	expect(await secondAttach).toBe(CONNECTED_STATE);
	expect(attachedSockets).toEqual([secondSocket]);
	expect(subscribeCount).toBe(1);
	// Resolve the retired gate only to dispose the test's pending promise; its
	// current-generation check must still prevent an old attach.
	expect(firstRegistration.acknowledge(true)).toBeTrue();
	expect(await firstAttach).toBeNull();
	expect(attachedSockets).toEqual([secondSocket]);
});
