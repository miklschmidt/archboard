import type { CodexProcessChild } from "@/runtime/codex-process";
import type { CoordinatorPersistedState } from "@/runtime/codex-coordinator";
import type { IdentityAuthorities } from "@/shared/codex-workbench-identity";
import { CodexWorkbenchCompositionError } from "@/server/canvas/lib/codex-workbench-error";
import { appendFailure, failureMessage } from "@/server/canvas/lib/codex-workbench-failures";
import type {
	CodexTransportExit,
	CodexWorkbenchGeneration,
	CodexWorkbenchSnapshot,
} from "@/server/canvas/lib/codex-workbench-generation-lifecycle";
import {
	assertTransaction,
	beginGenerationCleanup,
	invalidateTransaction,
	isCurrentRuntime,
	releaseRegistration,
	reserveTicket,
	revokePublicDispatch,
	snapshot,
	stopProcess,
	type CandidateReadiness,
	type CodexWorkbenchExitHandler,
	type CodexWorkbenchGenerationInput,
	type CodexWorkbenchOwnerPublication,
	type CodexWorkbenchOwnerRuntime,
	type CodexWorkbenchOwnerSlots,
	type LifecycleTransaction,
	type OwnerLocalState,
} from "@/server/canvas/lib/codex-workbench-owner-state";

/**
 * What a replacement generation may adopt from the session the previous one
 * established: nothing when it never initialized, and otherwise how far it got.
 * @param runtime The runtime.
 * @returns The adopted session, or null.
 */
function adoptedSession(
	runtime: CodexWorkbenchOwnerRuntime,
): "login-capable" | "thread-capable" | null {
	if (!runtime.sessionInitialized) {
		return null;
	}
	return runtime.accountReady ? "thread-capable" : "login-capable";
}

/**
 * Everything one generation is built from: which child and process it runs
 * against, what the previous generation had already established, and the two
 * authority checks it must pass to publish anything.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param local The owner's own state.
 * @param transaction The transaction building it.
 * @param generation Its number.
 * @param child The Codex child it runs against.
 * @param readiness Where it records what its session reached.
 * @param initialIdentity The identity acquired with the child, when there is one.
 * @param adoptedCoordinator The coordinator state it inherits, when there is one.
 * @returns The generation's input.
 */
function generationInput(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	transaction: LifecycleTransaction,
	generation: number,
	child: CodexProcessChild,
	readiness: CandidateReadiness,
	initialIdentity: IdentityAuthorities | null = null,
	adoptedCoordinator: CoordinatorPersistedState | null = null,
): CodexWorkbenchGenerationInput {
	const kernel =
		runtime.identityLedger === null || runtime.transport === null
			? null
			: { identityLedger: runtime.identityLedger, transport: runtime.transport };
	return Object.freeze({
		generation,
		child,
		process: runtime.process,
		kernel,
		initialIdentity,
		adoptedSession: adoptedSession(runtime),
		adoptedCoordinator,
		/** Refuse a retired activation that tries to change production readiness. */
		assertActivationCurrent: () => {
			assertTransaction(
				published,
				runtime,
				local,
				transaction,
				"A retired Codex activation cannot mutate production readiness.",
			);
		},
		/**
		 * Record what this generation's session reached, so a replacement can adopt it.
		 * @param accountReady Whether the account is signed in.
		 */
		markSessionReady: (accountReady: boolean) => {
			assertTransaction(
				published,
				runtime,
				local,
				transaction,
				"A retired Codex activation cannot publish session readiness.",
			);
			readiness.initialized = true;
			readiness.accountReady = accountReady;
		},
		/**
		 * The one terminal path a generation may take to end its own epoch.
		 * @returns The snapshot the owner ended in.
		 */
		shutdownOwner: () => terminalShutdown(published, runtime, local),
	});
}

/**
 * Shut the workbench owner down for good: revoke dispatch, tear down every
 * generation it owns, stop the Codex process, and release the runtime in
 * whichever state that left.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param local The owner's own state.
 * @param priorFailure A failure the caller already has, to report with it.
 * @returns The snapshot the owner ended in.
 */
function terminalShutdown(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	priorFailure: Error | null = null,
): Promise<CodexWorkbenchSnapshot> {
	if (local.shutdownPromise !== null) {
		return local.shutdownPromise;
	}
	reserveTicket(runtime);
	invalidateTransaction(local);
	revokePublicDispatch(published, runtime);
	runtime.exitBridge.handler = null;
	local.nextChild = null;
	const processChildUnsubscribe = local.processChildUnsubscribe;
	local.processChildUnsubscribe = null;
	processChildUnsubscribe?.();
	if (isCurrentRuntime(published, runtime)) {
		published.state = "stopping";
	}
	let synchronousFailure = priorFailure;
	local.currentGeneration = null;
	// Each stop call revokes one graph before this function reaches its first await.
	const graphCleanups = Array.from(local.resources.keys(), (generation) =>
		beginGenerationCleanup(local, generation, "shutdown"),
	);
	const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
		let failure = await settleCleanups(
			graphCleanups,
			synchronousFailure,
			"Codex graph shutdown failed.",
		);
		const processFailure = await stopProcess(local, runtime);
		if (processFailure !== null) {
			failure = appendFailure(failure, processFailure, "Codex process shutdown failed.");
		}
		releaseRegistration(
			published,
			runtime,
			failure === null ? "idle" : "failed",
			failure === null ? null : failureMessage(failure),
		);
		if (failure !== null) {
			throw new CodexWorkbenchCompositionError(
				"shutdown_failed",
				"The production Codex workbench did not shut down cleanly.",
				failure,
			);
		}
		return snapshot(published, runtime);
	})().finally(() => {
		synchronousFailure = null;
		local.shutdownPromise = null;
	});
	local.shutdownPromise = operation;
	return operation;
}

/**
 * Whether this exit is the one this runtime is waiting for: its own bridge
 * event, naming the child and epoch its identity ledger runs against.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param exit What the transport reported.
 * @returns True when the exit is this runtime's.
 */
function ownsChildExit(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	exit: CodexTransportExit,
): boolean {
	if (!isCurrentRuntime(published, runtime) || runtime.exitBridge.event !== exit) {
		return false;
	}
	const ledger = runtime.identityLedger;
	return ledger !== null && exit.child === ledger.childId && exit.epoch === ledger.epoch;
}

/**
 * Wait for every generation teardown in turn, keeping each failure beside the
 * one before it: a teardown that fails must not stop the ones behind it.
 * @param cleanups The teardowns, in the order they were begun.
 * @param priorFailure What has failed already, if anything.
 * @param message What these failures together mean.
 * @returns The failure to carry on with, or null when every teardown was clean.
 */
async function settleCleanups(
	cleanups: readonly Promise<Error | null>[],
	priorFailure: Error | null,
	message: string,
): Promise<Error | null> {
	let failure = priorFailure;
	for (const cleanup of cleanups) {
		// oxlint-disable-next-line no-await-in-loop -- teardowns settle in the order they were begun, each fully before the next
		const cleanupFailure = await cleanup;
		if (cleanupFailure !== null) {
			failure = appendFailure(failure, cleanupFailure, message);
		}
	}
	return failure;
}

/**
 * Settle one generation against its child's exit, turning a synchronous
 * refusal into the same rejected settlement an asynchronous one produces.
 * @param generation The generation, or null when none was current.
 * @param exit What the transport reported.
 * @returns The settlement.
 */
function retireGeneration(
	generation: CodexWorkbenchGeneration | null,
	exit: CodexTransportExit,
): Promise<void> {
	if (generation === null) {
		return Promise.resolve();
	}
	try {
		return generation.retireChild(exit);
	} catch (error) {
		return Promise.reject(error);
	}
}

/**
 * The Codex child this owner's current generation ran against has exited.
 *
 * Dispatch is revoked at once, the generation settles against the exit and is
 * torn down, and the owner starts again: a child that goes is a new epoch, not
 * the end of the workbench.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param local The owner's own state.
 * @param exit What the transport reported.
 */
function observeChildExit(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	exit: CodexTransportExit,
): void {
	if (!ownsChildExit(published, runtime, exit)) {
		return;
	}
	reserveTicket(runtime);
	invalidateTransaction(local);
	revokePublicDispatch(published, runtime);
	published.state = "starting";
	published.failure = null;
	const settlementOwner = local.currentGeneration;
	local.currentGeneration = null;
	const settlement = retireGeneration(settlementOwner, exit);
	const graphCleanups = Array.from(local.resources.keys(), (generation) =>
		beginGenerationCleanup(local, generation, "child_exit"),
	);
	const operation = (async (): Promise<Error | null> => {
		let failure: Error | null = null;
		try {
			await settlement;
		} catch (error) {
			failure = appendFailure(failure, error, "Codex child settlement failed.");
		}
		return settleCleanups(graphCleanups, failure, "Codex child graph cleanup failed.");
	})();
	local.recoveryBarrier = operation;
	runtime.identityLedger = null;
	runtime.transport = null;
	runtime.sessionInitialized = false;
	runtime.accountReady = false;
	runtime.exitBridge.event = null;
	local.restart?.();
}

/**
 * Point the process-lifetime exit bridge at this runtime's own handler,
 * replacing whichever generation's handler it had.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param local The owner's own state.
 * @returns The installed handler.
 */
function replaceExitHandler(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
): CodexWorkbenchExitHandler {
	const handler: CodexWorkbenchExitHandler = {
		/**
		 * Take the child's exit.
		 * @param event What the transport reported.
		 */
		handle: (event) => {
			observeChildExit(published, runtime, local, event);
		},
	};
	runtime.exitBridge.handler = handler;
	return handler;
}

/**
 * Publish the owner's ready dispatch, which answers from the generation that
 * has just become current.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param local The owner's own state.
 * @param generation The generation now current.
 * @returns The published slots.
 */
function publishReadySlots(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	generation: CodexWorkbenchGeneration,
): CodexWorkbenchOwnerSlots {
	const slots: CodexWorkbenchOwnerSlots = {
		/**
		 * A ready workbench is already started.
		 * @returns Its snapshot.
		 */
		start: () => Promise.resolve(snapshot(published, runtime)),
		/**
		 * Shut the workbench down.
		 * @returns The snapshot it ended in.
		 */
		shutdown: () => terminalShutdown(published, runtime, local),
		/**
		 * What the workbench reports about itself.
		 * @returns The snapshot.
		 */
		snapshot: () => snapshot(published, runtime),
		/**
		 * The browser gateway this generation owns, refused unless it is ready.
		 * @returns The gateway.
		 */
		gateway: () => {
			if (!isCurrentRuntime(published, runtime) || published.state !== "ready") {
				throw new CodexWorkbenchCompositionError(
					"not_started",
					"The production Codex workbench browser gateway is not ready.",
				);
			}
			return generation.gateway;
		},
	};
	published.current = slots;
	replaceExitHandler(published, runtime, local);
	return slots;
}

export {
	generationInput,
	observeChildExit,
	publishReadySlots,
	replaceExitHandler,
	terminalShutdown,
};
