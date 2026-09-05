// The browser workbench transport: one socket run at a time, one published
// state, one lease, and the command paths that carry a person's action to
// the gateway exactly once against the target it was composed for. This file
// only composes the session, lease, command and prepared-action owners over
// one core.

import type { BrowserCommandLease, BrowserSnapshot } from "@/shared/codex-browser-model";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchAccountReadResult,
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandIntent,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchSnapshotMessage,
	BrowserWorkbenchSocket,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
	BrowserWorkbenchTransportOptions,
} from "@/ui/workbench-transport/contract";
import { buildCapabilities } from "@/ui/workbench-transport/lib/capabilities";
import { command } from "@/ui/workbench-transport/lib/command";
import {
	capabilityContext,
	captureTarget,
	createTransportCore,
	requireRun,
	type TransportCore,
} from "@/ui/workbench-transport/lib/core";
import {
	accountRead,
	claimLease,
	releaseLease,
	renewLease,
} from "@/ui/workbench-transport/lib/lease";
import { captureCommandIntent, executeCommand } from "@/ui/workbench-transport/lib/prepared";
import {
	attach,
	close,
	detach,
	dispose,
	refreshFor,
	setMediaReady,
} from "@/ui/workbench-transport/lib/session";
import { transportFailure } from "@/ui/workbench-transport/lib/socket-run";

/**
 * Exact-authority owners must not replace the lease between a prepared
 * action's acquisition and its one dispatch.
 * @param core The core.
 * @param operation The lease or command operation.
 * @returns Its result, or a refusal while a command is being prepared.
 */
function withAvailableAuthority<Result>(
	core: TransportCore,
	operation: () => Promise<Result>,
): Promise<Result> {
	if (core.preparingCommand) {
		return Promise.reject(
			transportFailure(
				"not_ready",
				"Another browser command is being prepared. Wait for it to finish.",
			),
		);
	}
	return operation();
}

/**
 * Adapt one canvas pane socket to the browser workbench gateway.
 * @param transportOptions Clock and request-id sources.
 * @returns The transport.
 */
function createBrowserWorkbenchTransport(
	transportOptions: BrowserWorkbenchTransportOptions = {},
): BrowserWorkbenchTransport {
	const core = createTransportCore(transportOptions);

	/**
	 * Attach a socket.
	 * @param socket The socket.
	 * @returns The state after the handshake settles.
	 */
	function attachSocket(socket: BrowserWorkbenchSocket): Promise<BrowserWorkbenchState> {
		return attach(core, socket);
	}

	/**
	 * Detach the current run, or the run on one socket.
	 * @param socket The socket to detach, or any.
	 * @returns Settles when detached.
	 */
	function detachSocket(socket?: BrowserWorkbenchSocket): Promise<void> {
		return detach(core, socket);
	}

	/**
	 * Tell the gateway the browser is done, then stop.
	 * @returns Settles when stopped.
	 */
	function closeTransport(): Promise<void> {
		return close(core);
	}

	/**
	 * Ask for a full snapshot on the current run.
	 * @returns The snapshot message.
	 */
	async function refresh(): Promise<BrowserWorkbenchSnapshotMessage> {
		return refreshFor(core, requireRun(core));
	}

	/**
	 * Report media readiness.
	 * @param ready Whether media is ready.
	 * @returns The snapshot message.
	 */
	async function reportMediaReady(ready: boolean): Promise<BrowserWorkbenchSnapshotMessage> {
		return setMediaReady(core, requireRun(core), ready);
	}

	/**
	 * Claim a lease unless a command is being prepared.
	 * @returns The lease.
	 */
	function claim(): Promise<BrowserCommandLease> {
		return withAvailableAuthority(core, () => claimLease(core));
	}

	/**
	 * Renew the lease unless a command is being prepared.
	 * @returns The renewed lease.
	 */
	function renew(): Promise<BrowserCommandLease> {
		return withAvailableAuthority(core, () => renewLease(core));
	}

	/**
	 * Release the lease unless a command is being prepared.
	 * @returns The released lease, or null.
	 */
	function release(): Promise<BrowserCommandLease | null> {
		return withAvailableAuthority(core, () => releaseLease(core));
	}

	/**
	 * Read the account.
	 * @returns The account result.
	 */
	function readAccount(): Promise<BrowserWorkbenchAccountReadResult> {
		return accountRead(core);
	}

	/**
	 * Send a command under the current lease unless a command is being prepared.
	 * @param draft The draft.
	 * @param target The target captured when the action was offered.
	 * @returns The result.
	 */
	function sendCommand(
		draft: BrowserCommandDraft,
		target?: BrowserWorkbenchCommandTarget,
	): Promise<BrowserWorkbenchCommandResult> {
		return withAvailableAuthority(core, () => command(core, draft, target));
	}

	/**
	 * A human action: acquire fresh authority once, revalidate, dispatch once.
	 * @param draft The draft.
	 * @param intent The intent captured when the action was offered.
	 * @returns The result.
	 */
	function execute(
		draft: BrowserCommandDraft,
		intent?: BrowserWorkbenchCommandIntent,
	): Promise<BrowserWorkbenchCommandResult> {
		return executeCommand(core, draft, intent);
	}

	/**
	 * Capture the displayed link, with exact authority when a lease is live.
	 * @returns The frozen intent.
	 */
	function captureIntent(): BrowserWorkbenchCommandIntent {
		return captureCommandIntent(core);
	}

	/**
	 * The lease identity plus the link it is captured against, on the current run.
	 * @returns The frozen target.
	 */
	function captureCommandTarget(): BrowserWorkbenchCommandTarget {
		return captureTarget(core, requireRun(core));
	}

	/**
	 * The reduced snapshot of the current run.
	 * @returns The snapshot, or null.
	 */
	function snapshot(): BrowserSnapshot | null {
		return core.activeRun?.snapshot ?? null;
	}

	/**
	 * The sequence of the current run's snapshot.
	 * @returns The sequence, or null.
	 */
	function sequence(): number | null {
		return core.activeRun?.sequence ?? null;
	}

	/**
	 * The lease this browser holds.
	 * @returns The lease, or null.
	 */
	function lease(): BrowserCommandLease | null {
		return core.currentLease;
	}

	/**
	 * The published state.
	 * @returns The state.
	 */
	function state(): BrowserWorkbenchState {
		return core.ownerState;
	}

	/**
	 * The capability matrix as it stands now.
	 * @returns The capabilities.
	 */
	function capabilities(): BrowserWorkbenchCapabilities {
		return buildCapabilities(capabilityContext(core));
	}

	/**
	 * Hear every state, lease and capability change.
	 * @param listener The listener.
	 * @returns A function that stops listening.
	 */
	function subscribe(listener: () => void): () => void {
		core.listeners.add(listener);
		return () => core.listeners.delete(listener);
	}

	/**
	 * Stop everything for good.
	 * @returns Settles when disposed.
	 */
	function disposeTransport(): Promise<void> {
		return dispose(core);
	}

	return Object.freeze({
		attach: attachSocket,
		detach: detachSocket,
		close: closeTransport,
		refresh,
		setMediaReady: reportMediaReady,
		claimLease: claim,
		renewLease: renew,
		releaseLease: release,
		accountRead: readAccount,
		command: sendCommand,
		executeCommand: execute,
		captureCommandIntent: captureIntent,
		captureCommandTarget,
		snapshot,
		sequence,
		lease,
		state,
		capabilities,
		subscribe,
		dispose: disposeTransport,
	});
}

export { createBrowserWorkbenchTransport };
