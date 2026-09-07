import {
	CodexProcessError,
	type CodexProcess,
	type CodexProcessChild,
	type CodexProcessSnapshot,
} from "@/runtime/codex-process";
import type { CoordinatorPersistedState } from "@/runtime/codex-coordinator";
import type { CodexTransport } from "@/runtime/codex-transport";
import type { IdentityAuthorities, IdentityLedger } from "@/shared/codex-workbench-identity";
import type { CodexWorkbenchGateway } from "@/server/codex-workbench";
import { CodexWorkbenchCompositionError } from "@/server/canvas/lib/codex-workbench-error";
import { appendFailure } from "@/server/canvas/lib/codex-workbench-failures";
import {
	CODEX_WORKBENCH_OWNER,
	type CodexTransportExit,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchSnapshot,
	type CodexWorkbenchState,
	type CodexWorkbenchStopReason,
} from "@/server/canvas/lib/codex-workbench-generation-lifecycle";

interface CodexWorkbenchStableKernel {
	readonly identityLedger: IdentityLedger;
	readonly transport: CodexTransport;
}

interface CodexWorkbenchKernelAcquisition {
	readonly kernel: CodexWorkbenchStableKernel;
	readonly identity: IdentityAuthorities;
}

interface CodexWorkbenchGenerationInput {
	readonly generation: number;
	readonly child: CodexProcessChild;
	readonly process: CodexProcess;
	readonly kernel: CodexWorkbenchStableKernel | null;
	readonly initialIdentity: IdentityAuthorities | null;
	readonly adoptedSession: "login-capable" | "thread-capable" | null;
	readonly adoptedCoordinator: CoordinatorPersistedState | null;
	readonly assertActivationCurrent: () => void;
	readonly markSessionReady: (accountReady: boolean) => void;
	/**
	 * The one terminal path a generation may take to end its own epoch. It
	 * revokes public dispatch, cleans every live graph, and stops the child, so a
	 * fail-closed epoch teardown cannot leave the owner reporting "ready".
	 */
	readonly shutdownOwner: () => Promise<CodexWorkbenchSnapshot>;
}

type CodexWorkbenchGenerationFactory = (
	input: CodexWorkbenchGenerationInput,
) => Promise<CodexWorkbenchGeneration>;

interface CodexWorkbenchOwnerOptions {
	readonly createProcess: () => CodexProcess;
	readonly createKernel: (input: CodexWorkbenchGenerationInput) => CodexWorkbenchKernelAcquisition;
	readonly createGeneration: CodexWorkbenchGenerationFactory;
}

interface CodexWorkbenchOwner {
	readonly start: () => Promise<CodexWorkbenchSnapshot>;
	readonly snapshot: () => CodexWorkbenchSnapshot;
	readonly gateway: () => CodexWorkbenchGateway;
	readonly shutdown: () => Promise<CodexWorkbenchSnapshot>;
}

type CodexWorkbenchOwnerSlots = CodexWorkbenchOwner;

interface CodexWorkbenchExitHandler {
	handle: (event: CodexTransportExit) => void;
}

interface CodexWorkbenchExitBridge {
	event: CodexTransportExit | null;
	handler: CodexWorkbenchExitHandler | null;
}

interface CodexWorkbenchOwnerRuntime {
	readonly process: CodexProcess;
	identityLedger: IdentityLedger | null;
	transport: CodexTransport | null;
	operation: number;
	sessionInitialized: boolean;
	accountReady: boolean;
	released: boolean;
	readonly exitBridge: CodexWorkbenchExitBridge;
}

/**
 * The owner's process-lifetime publication. It lives for one canvas application
 * lifetime inside `installCodexWorkbenchOwnerLifecycle` and is never handed to a
 * caller: backend source changes take effect only through a full restart
 * (ADR 0021), so no module replacement ever observes it.
 */
interface CodexWorkbenchOwnerPublication {
	generation: number;
	state: CodexWorkbenchState;
	failure: string | null;
	current: CodexWorkbenchOwnerSlots | null;
	runtime: CodexWorkbenchOwnerRuntime | null;
}

const releasedSnapshots = new WeakMap<CodexWorkbenchOwnerRuntime, CodexWorkbenchSnapshot>();

/**
 * A publication before anything has started.
 * @returns The empty publication.
 */
function emptyPublication(): CodexWorkbenchOwnerPublication {
	return { generation: 0, state: "idle", failure: null, current: null, runtime: null };
}

/**
 * Whether this runtime is still the published one, and has not been released.
 * @param published What the owner publishes.
 * @param runtime The runtime asking.
 * @returns True when it is current.
 */
function isCurrentRuntime(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
): boolean {
	return published.runtime === runtime && !runtime.released;
}

/**
 * Whether an operation still owns the runtime it started under: a later
 * operation takes the next ticket, and everything the earlier one does after
 * that must be refused.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param ticket The ticket the operation took.
 * @returns True when the operation is still the current one.
 */
function ownsTicket(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	ticket: number,
): boolean {
	return isCurrentRuntime(published, runtime) && runtime.operation === ticket;
}

/**
 * Take the next operation ticket, which retires every operation before it.
 * @param runtime The runtime.
 * @returns The new ticket.
 */
function reserveTicket(runtime: CodexWorkbenchOwnerRuntime): number {
	runtime.operation += 1;
	return runtime.operation;
}

/**
 * What the workbench owner reports about itself: the live state while this
 * runtime is current, and the state it was released in afterwards.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @returns The snapshot.
 */
function snapshot(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
): CodexWorkbenchSnapshot {
	const current = isCurrentRuntime(published, runtime);
	if (!current) {
		return (
			releasedSnapshots.get(runtime) ??
			Object.freeze({
				owner: CODEX_WORKBENCH_OWNER,
				state: "idle",
				generation: 0,
				childPid: null,
				ready: false,
				failure: null,
			})
		);
	}
	return Object.freeze({
		owner: CODEX_WORKBENCH_OWNER,
		state: published.state,
		generation: published.generation,
		childPid: runtime.process.currentChild()?.pid ?? null,
		ready: published.state === "ready",
		failure: published.failure,
	});
}

/**
 * The failure a terminal Codex process means for a startup still waiting for a
 * child: waiting longer cannot produce one.
 * @param current What the process reports.
 * @returns The failure, or null while the process may still produce a child.
 */
function terminalProcessAcquisitionFailure(current: CodexProcessSnapshot): Error | null {
	if (current.state !== "terminal_failure") {
		return null;
	}
	return new CodexProcessError({
		code: current.failure?.code ?? "shutdown_failed",
		terminal: true,
		message:
			current.failure?.message ??
			"The Codex process became terminal before the workbench acquired a replacement child.",
	});
}

/**
 * Take the owner's public dispatch away, so nothing new reaches a graph that
 * is being retired.
 * @param published What the owner publishes.
 * @param runtime The runtime being retired.
 */
function revokePublicDispatch(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
): void {
	if (published.runtime === runtime) {
		published.current = null;
	}
}

/**
 * Release one runtime for good, remembering the snapshot it ended in so a
 * caller holding a retired handle is told the truth rather than the live
 * owner's state.
 * @param published What the owner publishes.
 * @param runtime The runtime being released.
 * @param state The state it ended in.
 * @param failure Why, when it failed.
 */
function releaseRegistration(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	state: CodexWorkbenchState,
	failure: string | null,
): void {
	if (runtime.released) {
		return;
	}
	releasedSnapshots.set(
		runtime,
		Object.freeze({
			owner: CODEX_WORKBENCH_OWNER,
			state,
			generation: state === "failed" ? published.generation : 0,
			childPid: null,
			ready: false,
			failure,
		}),
	);
	runtime.released = true;
	runtime.exitBridge.handler = null;
	runtime.identityLedger = null;
	runtime.transport = null;
	if (published.runtime !== runtime) {
		return;
	}
	published.state = state;
	published.failure = failure;
	published.current = null;
	published.runtime = null;
}

/**
 * Stop the Codex process, once at a time. A failed verified stop keeps the
 * process owner reachable: a later application force pass must make a fresh
 * TERM/KILL-and-observe attempt rather than replay the first failure forever.
 * @param local The owner's own state.
 * @param runtime The runtime.
 * @returns The stop's failure, or null when it stopped.
 */
function stopProcess(
	local: OwnerLocalState,
	runtime: CodexWorkbenchOwnerRuntime,
): Promise<Error | null> {
	if (local.processStopPromise !== null) {
		return local.processStopPromise;
	}
	const attempt = (async (): Promise<Error | null> => {
		try {
			await runtime.process.stop();
			return null;
		} catch (error) {
			return error instanceof Error ? error : new Error(String(error));
		}
	})();
	const operation = attempt.then((result) => {
		// A failed verified stop keeps the process owner reachable. A later
		// application force pass must perform a fresh TERM/KILL-and-observe
		// attempt rather than replay the first failure forever.
		if (result !== null && local.processStopPromise === operation) {
			local.processStopPromise = null;
		}
		return result;
	});
	local.processStopPromise = operation;
	return operation;
}

interface CandidateReadiness {
	initialized: boolean;
	accountReady: boolean;
}

type LifecycleTransactionPhase = "starting" | "candidate_activation" | "committed" | "invalidated";

interface LifecycleTransaction {
	readonly ticket: number;
	readonly child: CodexProcessChild;
	phase: LifecycleTransactionPhase;
	transport: CodexTransport | null;
}

interface GenerationResource {
	readonly generation: CodexWorkbenchGeneration;
	cleanup: Promise<Error | null> | null;
}

interface OwnerLocalState {
	currentGeneration: CodexWorkbenchGeneration | null;
	transaction: LifecycleTransaction | null;
	readonly resources: Map<CodexWorkbenchGeneration, GenerationResource>;
	readonly cleanupHistory: WeakMap<CodexWorkbenchGeneration, Promise<Error | null>>;
	startPromise: Promise<CodexWorkbenchSnapshot> | null;
	shutdownPromise: Promise<CodexWorkbenchSnapshot> | null;
	processStopPromise: Promise<Error | null> | null;
	nextChild: ((child: CodexProcessChild) => void) | null;
	processChildUnsubscribe: (() => void) | null;
	recoveryBarrier: Promise<Error | null>;
	restart: (() => void) | null;
}

/**
 * Whether the child a startup is working with is still the process's own.
 * @param process The process owner.
 * @param child The child.
 * @returns True when the process still has exactly that child.
 */
function ownsProcessChild(process: CodexProcess, child: CodexProcessChild): boolean {
	const current = process.currentChild();
	return (
		current !== null &&
		current.pid === child.pid &&
		current.stdin === child.stdin &&
		current.stdout === child.stdout &&
		current.stderr === child.stderr
	);
}

/**
 * Whether a lifecycle transaction still holds everything it started with: its
 * ticket, its phase, its child, its transport, and an owner still starting.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param local The owner's own state.
 * @param transaction The transaction.
 * @returns True when the transaction may still act.
 */
function ownsTransaction(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	transaction: LifecycleTransaction,
): boolean {
	return (
		isOpenTransaction(local, transaction) &&
		stillStartingFor(published, runtime, transaction) &&
		transportStillOpen(transaction)
	);
}

/**
 * Whether a transaction is the one in flight and has not already ended.
 * @param local The owner's own state.
 * @param transaction The transaction.
 * @returns True when it is still open.
 */
function isOpenTransaction(local: OwnerLocalState, transaction: LifecycleTransaction): boolean {
	return (
		local.transaction === transaction &&
		transaction.phase !== "invalidated" &&
		transaction.phase !== "committed"
	);
}

/**
 * Whether the owner is still starting under this transaction's own ticket,
 * against the child it acquired, with no child exit observed since.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param transaction The transaction.
 * @returns True when nothing has superseded it.
 */
function stillStartingFor(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	transaction: LifecycleTransaction,
): boolean {
	return (
		ownsTicket(published, runtime, transaction.ticket) &&
		published.state === "starting" &&
		runtime.exitBridge.event === null &&
		ownsProcessChild(runtime.process, transaction.child)
	);
}

/**
 * Whether the transport a transaction acquired is still open, which a
 * transaction that has not acquired one yet cannot fail.
 * @param transaction The transaction.
 * @returns True when it may still act.
 */
function transportStillOpen(transaction: LifecycleTransaction): boolean {
	const transport = transaction.transport;
	if (transport === null) {
		return true;
	}
	try {
		return transport.inspect().state === "open";
	} catch {
		return false;
	}
}

/**
 * Refuse a transaction that no longer holds what it started with, saying what
 * it was trying to do.
 * @param published What the owner publishes.
 * @param runtime The runtime.
 * @param local The owner's own state.
 * @param transaction The transaction.
 * @param message What it was trying to do.
 */
function assertTransaction(
	published: CodexWorkbenchOwnerPublication,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	transaction: LifecycleTransaction,
	message: string,
): void {
	if (!ownsTransaction(published, runtime, local, transaction)) {
		throw new CodexWorkbenchCompositionError("not_started", message);
	}
}

/**
 * End the transaction in flight, so nothing it does afterwards is accepted.
 * @param local The owner's own state.
 */
function invalidateTransaction(local: OwnerLocalState): void {
	if (local.transaction !== null) {
		local.transaction.phase = "invalidated";
	}
	local.transaction = null;
}

/**
 * Take ownership of one generation, so its teardown is this owner's to run.
 * @param local The owner's own state.
 * @param generation The generation.
 * @returns Its resource record.
 */
function ownGeneration(
	local: OwnerLocalState,
	generation: CodexWorkbenchGeneration,
): GenerationResource {
	const existing = local.resources.get(generation);
	if (existing !== undefined) {
		return existing;
	}
	const resource: GenerationResource = { generation, cleanup: null };
	local.resources.set(generation, resource);
	return resource;
}

/**
 * Begin tearing one generation down, once: a second call joins the first, and
 * a generation already torn down answers with what that teardown produced.
 * @param local The owner's own state.
 * @param generation The generation.
 * @param reason Why it is stopping.
 * @returns The teardown's failure, or null when it was clean.
 */
function beginGenerationCleanup(
	local: OwnerLocalState,
	generation: CodexWorkbenchGeneration,
	reason: CodexWorkbenchStopReason,
): Promise<Error | null> {
	const completed = local.cleanupHistory.get(generation);
	if (completed !== undefined) {
		return completed;
	}
	const resource = ownGeneration(local, generation);
	if (resource.cleanup !== null) {
		return resource.cleanup;
	}
	let stop: Promise<void>;
	try {
		stop = generation.stop(reason);
	} catch (error) {
		stop = Promise.reject(error);
	}
	const cleanup = (async (): Promise<Error | null> => {
		let failure: Error | null = null;
		try {
			await stop;
		} catch (error) {
			failure = appendFailure(failure, error, "Codex graph shutdown failed.");
		}
		try {
			generation.finishStop();
		} catch (error) {
			failure = appendFailure(failure, error, "Codex final listener cleanup failed.");
		}
		local.resources.delete(generation);
		return failure;
	})();
	resource.cleanup = cleanup;
	local.cleanupHistory.set(generation, cleanup);
	return cleanup;
}

/**
 * Listen once, for this process's whole life, for the Codex child's exit.
 *
 * This is the only process-lifetime listener. Its closure reaches exactly the
 * terminal latch and the replaceable source handler, never lifecycle authority,
 * so a generation replaced under it cannot be reached through it.
 * @param runtime The runtime that owns the bridge.
 * @param transport The transport it must be listening to.
 */
function attachExitBridge(runtime: CodexWorkbenchOwnerRuntime, transport: CodexTransport): void {
	if (runtime.transport !== transport) {
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			"The retained child-exit bridge does not own the acquired transport.",
		);
	}
	const bridge = runtime.exitBridge;
	// This is the only process-lifetime listener. Its closure reaches exactly the
	// terminal latch and replaceable source handler, never lifecycle authority.
	transport.onExit((event) => {
		if (bridge.event !== null) {
			return;
		}
		bridge.event = Object.freeze({ ...event });
		bridge.handler?.handle(bridge.event);
	});
}

export {
	assertTransaction,
	attachExitBridge,
	beginGenerationCleanup,
	emptyPublication,
	invalidateTransaction,
	isCurrentRuntime,
	ownGeneration,
	ownsProcessChild,
	ownsTicket,
	releaseRegistration,
	releasedSnapshots,
	reserveTicket,
	revokePublicDispatch,
	snapshot,
	stopProcess,
	terminalProcessAcquisitionFailure,
};
export type {
	CandidateReadiness,
	CodexWorkbenchExitBridge,
	CodexWorkbenchExitHandler,
	CodexWorkbenchGenerationFactory,
	CodexWorkbenchGenerationInput,
	CodexWorkbenchKernelAcquisition,
	CodexWorkbenchOwner,
	CodexWorkbenchOwnerOptions,
	CodexWorkbenchOwnerPublication,
	CodexWorkbenchOwnerRuntime,
	CodexWorkbenchOwnerSlots,
	CodexWorkbenchStableKernel,
	GenerationResource,
	LifecycleTransaction,
	LifecycleTransactionPhase,
	OwnerLocalState,
};
