// The socket session: attaching, the subscribe handshake, recovery snapshots,
// pushed events, close and disposal. One run at a time; the canvas remains
// the only owner that opens or closes the actual socket.

import type {
	BrowserWorkbenchGatewayMessage,
	BrowserWorkbenchSnapshotMessage,
	BrowserWorkbenchSocket,
	BrowserWorkbenchState,
} from "@/ui/workbench-transport/contract";
import {
	incompatible,
	isCurrent,
	markStale,
	nextRequestId,
	retire,
	setBackoff,
	setState,
	stoppedState,
	streamHost,
	type TransportCore,
} from "@/ui/workbench-transport/lib/core";
import {
	createSocketRun,
	isWireError,
	messageOf,
	sendRequest,
	socketOpen,
	transportFailure,
	waitForOpen,
	type RequestSpec,
	type SocketRun,
	type SocketRunHost,
} from "@/ui/workbench-transport/lib/socket-run";
import { applyMessage } from "@/ui/workbench-transport/lib/stream";
import { parseBrowserSnapshotMessage } from "@/ui/workbench-transport/lib/wire";

const CLOSED_REASON = "The Codex workbench connection was closed.";

/**
 * The socket run's view of the core.
 * @param core The core.
 * @returns The host.
 */
function socketHost(core: TransportCore): SocketRunHost {
	/**
	 * Whether a run is current.
	 * @param run The run.
	 * @returns True while current.
	 */
	function isCurrentRun(run: SocketRun): boolean {
		return isCurrent(core, run);
	}
	/**
	 * A fresh request id.
	 * @returns The id.
	 */
	function requestId(): string {
		return nextRequestId(core);
	}
	/**
	 * Reduce a pushed message.
	 * @param run The run.
	 * @param message The message.
	 */
	function onRunGatewayMessage(run: SocketRun, message: BrowserWorkbenchGatewayMessage): void {
		onGatewayMessage(core, run, message);
	}
	/**
	 * The socket closed.
	 * @param run The run.
	 */
	function onRunClose(run: SocketRun): void {
		onClose(core, run);
	}
	/**
	 * Stop on an incompatibility.
	 * @param run The run.
	 * @param error The wire error.
	 */
	function incompatibleRun(run: SocketRun, error: unknown): void {
		incompatible(core, run, error);
	}
	return {
		isCurrent: isCurrentRun,
		nextRequestId: requestId,
		onGatewayMessage: onRunGatewayMessage,
		onClose: onRunClose,
		incompatible: incompatibleRun,
	};
}

/**
 * Send a request on a run.
 * @param core The core.
 * @param run The run.
 * @param spec The request.
 * @returns The answer's value.
 */
function request(core: TransportCore, run: SocketRun, spec: RequestSpec): Promise<unknown> {
	return sendRequest(run, socketHost(core), spec);
}

/**
 * Parse a snapshot answer, stopping the run when it is unreadable.
 * @param core The core.
 * @param run The run.
 * @param value The answer.
 * @returns The snapshot message.
 */
function parseSnapshotOrStop(
	core: TransportCore,
	run: SocketRun,
	value: unknown,
): BrowserWorkbenchSnapshotMessage {
	try {
		return parseBrowserSnapshotMessage(value);
	} catch (error) {
		incompatible(core, run, error);
		throw error;
	}
}

/**
 * Fetch and apply a full snapshot.
 * @param core The core.
 * @param run The run.
 * @returns The snapshot message.
 */
async function fetchSnapshot(
	core: TransportCore,
	run: SocketRun,
): Promise<BrowserWorkbenchSnapshotMessage> {
	const value = await request(core, run, { action: "snapshot", kind: "snapshot" });
	const message = parseSnapshotOrStop(core, run, value);
	if (isCurrent(core, run)) {
		applyMessage(run, message, true, streamHost(core));
	}
	return message;
}

/**
 * Ask for a full snapshot, sharing one request while it is in flight.
 * @param core The core.
 * @param run The run.
 * @returns The snapshot message.
 */
function refreshFor(core: TransportCore, run: SocketRun): Promise<BrowserWorkbenchSnapshotMessage> {
	if (run.refreshPromise !== null) {
		return run.refreshPromise;
	}
	const tracked = fetchSnapshot(core, run).finally(() => {
		if (run.refreshPromise === tracked) {
			run.refreshPromise = null;
		}
	});
	run.refreshPromise = tracked;
	return tracked;
}

/**
 * Ask for a recovery snapshot once, ignoring its failure.
 * @param core The core.
 * @param run The run.
 */
function recover(core: TransportCore, run: SocketRun): void {
	if (isCurrent(core, run) && run.refreshPromise === null) {
		refreshFor(core, run).catch(() => undefined);
	}
}

/**
 * Whether a failed reconciliation leaves a readiness state that must be marked stale.
 * @param core The core.
 * @param run The run.
 * @param error What failed.
 * @returns True when the published state can no longer be trusted.
 */
function leavesUnreconciled(core: TransportCore, run: SocketRun, error: unknown): boolean {
	return isCurrent(core, run) && !isWireError(error) && core.ownerState.kind === "readiness";
}

/**
 * After a result that carried no sequence, resync through a versioned snapshot.
 * @param core The core.
 * @param run The run.
 */
async function reconcileAfterUnsequencedResult(core: TransportCore, run: SocketRun): Promise<void> {
	if (!isCurrent(core, run)) {
		return;
	}
	try {
		await refreshFor(core, run);
	} catch (error) {
		if (leavesUnreconciled(core, run, error)) {
			markStale(core, run, run.sequence ?? 0, "The result snapshot could not be reconciled.");
		}
	}
}

/**
 * Reduce a pushed gateway message, recovering from gaps and stale delivery.
 * @param core The core.
 * @param run The run.
 * @param message The message.
 */
function onGatewayMessage(
	core: TransportCore,
	run: SocketRun,
	message: BrowserWorkbenchGatewayMessage,
): void {
	const status = applyMessage(run, message, false, streamHost(core));
	if (status === "gap" || status === "stale") {
		recover(core, run);
	}
}

/**
 * The socket closed under the run.
 * @param core The core.
 * @param run The run.
 */
function onClose(core: TransportCore, run: SocketRun): void {
	if (!isCurrent(core, run)) {
		return;
	}
	retire(
		core,
		run,
		"response_lost",
		"The Codex workbench socket closed before all responses arrived.",
	);
	core.currentLease = null;
	setBackoff(core, run, "The Codex workbench socket closed.");
}

/**
 * Record a failed handshake: incompatibility stops, anything else backs off.
 * @param core The core.
 * @param run The run.
 * @param error What failed.
 */
function handshakeFailed(core: TransportCore, run: SocketRun, error: unknown): void {
	if (!isCurrent(core, run)) {
		return;
	}
	if (isWireError(error)) {
		incompatible(core, run, error);
		return;
	}
	const reason = messageOf(error, "The Codex workbench connection failed.");
	retire(core, run, "socket_unavailable", reason);
	core.currentLease = null;
	setBackoff(core, run, reason);
}

/**
 * Wait for the socket and subscribe.
 * @param core The core.
 * @param run The run.
 */
async function handshake(core: TransportCore, run: SocketRun): Promise<void> {
	try {
		await waitForOpen(run);
		if (!isCurrent(core, run)) {
			return;
		}
		const value = await request(core, run, { action: "subscribe", kind: "snapshot" });
		applyMessage(run, parseBrowserSnapshotMessage(value), true, streamHost(core));
	} catch (error) {
		handshakeFailed(core, run, error);
	}
}

/**
 * Attach a socket, replacing any earlier run.
 * @param core The core.
 * @param socket The socket.
 * @returns The state after the handshake settles.
 */
async function attach(
	core: TransportCore,
	socket: BrowserWorkbenchSocket,
): Promise<BrowserWorkbenchState> {
	const previous = core.activeRun;
	if (core.disposed || (previous?.socket === socket && !previous.closed)) {
		return core.ownerState;
	}
	if (previous !== null) {
		retire(core, previous, "replaced", "The workbench socket was replaced.");
	}
	const run = createSocketRun(socket, socketHost(core));
	core.activeRun = run;
	core.currentLease = null;
	setState(core, {
		kind: "connection",
		state: "reconnecting",
		connection: "reconnecting",
		snapshot: null,
		sequence: null,
		reason: "Connecting to the Codex workbench.",
	});
	await handshake(core, run);
	return core.ownerState;
}

/**
 * Detach the current run, or the run on one socket.
 * @param core The core.
 * @param socket The socket to detach, or any.
 */
async function detach(core: TransportCore, socket?: BrowserWorkbenchSocket): Promise<void> {
	const run = core.activeRun;
	if (run === null || (socket !== undefined && run.socket !== socket)) {
		return;
	}
	const hadSnapshot = run.snapshot !== null;
	retire(core, run, "replaced", "The Codex workbench transport was detached.");
	core.currentLease = null;
	setState(
		core,
		stoppedState(
			hadSnapshot
				? "The Codex workbench transport was detached."
				: "No Codex workbench socket is attached.",
		),
	);
}

/**
 * Stop after the close request: retire the run, or settle a backoff left behind.
 * @param core The core.
 * @param run The run the close was sent on.
 */
function settleClosed(core: TransportCore, run: SocketRun): void {
	if (core.activeRun === run) {
		retire(core, run, "replaced", CLOSED_REASON);
		core.currentLease = null;
		setState(core, stoppedState(CLOSED_REASON));
		return;
	}
	const { ownerState } = core;
	if (
		core.activeRun === null &&
		ownerState.kind === "connection" &&
		ownerState.state === "backoff"
	) {
		setState(core, stoppedState(CLOSED_REASON));
	}
}

/**
 * Tell the gateway the browser is done, then stop.
 * @param core The core.
 */
async function close(core: TransportCore): Promise<void> {
	const run = core.activeRun;
	if (run === null) {
		const { ownerState } = core;
		if (ownerState.kind === "connection" && ownerState.state !== "stopped") {
			setState(core, stoppedState(CLOSED_REASON));
		}
		return;
	}
	if (isCurrent(core, run) && socketOpen(run.socket)) {
		await request(core, run, { action: "close", kind: "control" }).catch(() => undefined);
	}
	settleClosed(core, run);
}

/**
 * Stop everything for good.
 * @param core The core.
 */
async function dispose(core: TransportCore): Promise<void> {
	if (core.disposed) {
		return;
	}
	core.disposed = true;
	if (core.activeRun !== null) {
		retire(core, core.activeRun, "replaced", "The Codex workbench transport was disposed.");
	}
	core.activeRun = null;
	core.currentLease = null;
	setState(core, stoppedState("The Codex workbench transport was disposed."));
}

/**
 * Report the gateway's media readiness and adopt the snapshot it answers with.
 * @param core The core.
 * @param run The run.
 * @param ready Whether media is ready.
 * @returns The snapshot message.
 */
async function setMediaReady(
	core: TransportCore,
	run: SocketRun,
	ready: boolean,
): Promise<BrowserWorkbenchSnapshotMessage> {
	const value = await request(core, run, { action: "mediaReady", kind: "media", extra: { ready } });
	try {
		const message = parseBrowserSnapshotMessage(value);
		if (isCurrent(core, run)) {
			applyMessage(run, message, true, streamHost(core));
		}
		return message;
	} catch (error) {
		incompatible(core, run, error);
		throw transportFailure(
			"incompatible_contract",
			messageOf(error, "The media readiness result is incompatible."),
			undefined,
			{ outcome: "outcome_unknown", cause: error },
		);
	}
}

export {
	attach,
	close,
	detach,
	dispose,
	reconcileAfterUnsequencedResult,
	refreshFor,
	request,
	setMediaReady,
};
