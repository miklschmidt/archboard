import type {
	CodexProcess,
	CodexProcessChild,
	CodexProcessSnapshot,
} from "@/runtime/codex-process";
import type { IdentityAuthorities } from "@/shared/codex-workbench-identity";
import { CodexWorkbenchCompositionError } from "@/server/canvas/lib/codex-workbench-error";
import { appendFailure, failureMessage } from "@/server/canvas/lib/codex-workbench-failures";
import {
	CODEX_WORKBENCH_OWNER,
	createCodexWorkbenchGenerationLifecycle,
	type CodexTransportExit,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationHooks,
	type CodexWorkbenchSnapshot,
	type CodexWorkbenchState,
	type CodexWorkbenchStopReason,
	type CreateCodexWorkbenchGenerationLifecycleOptions,
} from "@/server/canvas/lib/codex-workbench-generation-lifecycle";
import {
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
	reserveTicket,
	snapshot,
	stopProcess,
	terminalProcessAcquisitionFailure,
	type CandidateReadiness,
	type CodexWorkbenchExitBridge,
	type CodexWorkbenchExitHandler,
	type CodexWorkbenchGenerationFactory,
	type CodexWorkbenchGenerationInput,
	type CodexWorkbenchKernelAcquisition,
	type CodexWorkbenchOwner,
	type CodexWorkbenchOwnerOptions,
	type CodexWorkbenchOwnerPublication,
	type CodexWorkbenchOwnerRuntime,
	type CodexWorkbenchOwnerSlots,
	type CodexWorkbenchStableKernel,
	type LifecycleTransaction,
	type OwnerLocalState,
} from "@/server/canvas/lib/codex-workbench-owner-state";
import {
	generationInput,
	publishReadySlots,
	replaceExitHandler,
	terminalShutdown,
} from "@/server/canvas/lib/codex-workbench-owner-transitions";

/**
 * Install one stable process port for one canvas application lifetime. Every
 * graph remains only in replaceable source closures, and the publication that
 * dispatches to them is owner-local: nothing outside this call can observe or
 * hand back a previous lifetime's state (ADR 0021).
 * @param options How to create the process, the kernel and each generation.
 * @returns The owner.
 */
function installCodexWorkbenchOwnerLifecycle(
	options: CodexWorkbenchOwnerOptions,
): CodexWorkbenchOwner {
	const published = emptyPublication();
	let processOwner: CodexProcess;
	try {
		processOwner = options.createProcess();
	} catch (error) {
		published.state = "failed";
		published.failure = failureMessage(error);
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			"The production Codex process owner could not be created.",
			error,
		);
	}
	const local: OwnerLocalState = {
		currentGeneration: null,
		transaction: null,
		resources: new Map(),
		cleanupHistory: new WeakMap(),
		startPromise: null,
		shutdownPromise: null,
		processStopPromise: null,
		nextChild: null,
		processChildUnsubscribe: null,
		recoveryBarrier: Promise.resolve(null),
		restart: null,
	};
	const exitBridge: CodexWorkbenchExitBridge = {
		event: null,
		handler: null,
	};
	const runtime: CodexWorkbenchOwnerRuntime = {
		process: processOwner,
		identityLedger: null,
		transport: null,
		operation: 0,
		sessionInitialized: false,
		accountReady: false,
		released: false,
		exitBridge,
	};
	published.runtime = runtime;
	replaceExitHandler(published, runtime, local);
	local.processChildUnsubscribe = runtime.process.onChild((child) => local.nextChild?.(child));
	/**
	 * The owner's current dispatch, refused while there is none: a workbench
	 * between generations answers nothing rather than answering wrongly.
	 * @returns The slots.
	 */
	const dispatchSlots = (): CodexWorkbenchOwnerSlots => {
		if (published.current === null) {
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench has no active owner dispatch.",
			);
		}
		return published.current;
	};

	/**
	 * Make a built generation the current one: check it adopted the kernel this
	 * startup acquired, activate it, and publish it as ready. Every step
	 * re-checks that this startup is still the owner's, so a superseded startup
	 * cannot publish anything.
	 * @param candidate The generation.
	 * @param transaction The transaction that built it.
	 * @param readiness What its session reached.
	 */
	const commitGeneration = async (
		candidate: CodexWorkbenchGeneration,
		transaction: LifecycleTransaction,
		readiness: CandidateReadiness,
	): Promise<void> => {
		if (
			runtime.identityLedger !== candidate.identityLedger ||
			runtime.transport !== candidate.transport
		) {
			throw new CodexWorkbenchCompositionError(
				"startup_failed",
				"The first Codex generation did not adopt its synchronously acquired kernel.",
			);
		}
		assertTransaction(
			published,
			runtime,
			local,
			transaction,
			"A retired Codex startup cannot activate a generation.",
		);
		transaction.phase = "candidate_activation";
		local.currentGeneration = candidate;
		await candidate.activate();
		assertTransaction(
			published,
			runtime,
			local,
			transaction,
			"A retired Codex startup cannot publish readiness.",
		);
		runtime.sessionInitialized = readiness.initialized;
		runtime.accountReady = readiness.accountReady;
		published.state = "ready";
		transaction.phase = "committed";
		local.transaction = null;
		publishReadySlots(published, runtime, local, candidate);
	};

	/**
	 * Give up on a startup that failed: tear down whatever generation it had
	 * built, stop the process it acquired, release the runtime, and report every
	 * failure the abandonment itself produced beside the original one.
	 * @param error What the startup threw.
	 * @param candidate The generation it had built, when it had one.
	 * @param ticket The startup's ticket, so a superseded startup releases nothing.
	 * @returns The failure to throw.
	 */
	const abandonStartup = async (
		error: unknown,
		candidate: CodexWorkbenchGeneration | null,
		ticket: number,
	): Promise<Error> => {
		let failure = error instanceof Error ? error : new Error(String(error));
		if (candidate !== null) {
			const cleanupFailure = await beginGenerationCleanup(local, candidate, "shutdown");
			if (local.currentGeneration === candidate) {
				local.currentGeneration = null;
			}
			if (cleanupFailure !== null) {
				failure = appendFailure(failure, cleanupFailure, "Codex startup and cleanup both failed.");
			}
		}
		if (ownsTicket(published, runtime, ticket)) {
			failure = await releaseFailedStartup(failure);
		}
		return new CodexWorkbenchCompositionError(
			"startup_failed",
			"The production Codex workbench did not become ready.",
			failure,
		);
	};

	/**
	 * Release the runtime a failed startup was holding: stop listening for a
	 * child, stop the process, and publish the failure as the owner's state.
	 * @param priorFailure What the startup already failed with.
	 * @returns That failure, with the process stop's own failure beside it.
	 */
	const releaseFailedStartup = async (priorFailure: Error): Promise<Error> => {
		let failure = priorFailure;
		runtime.exitBridge.handler = null;
		local.nextChild = null;
		const processChildUnsubscribe = local.processChildUnsubscribe;
		local.processChildUnsubscribe = null;
		processChildUnsubscribe?.();
		const processFailure = await stopProcess(local, runtime);
		if (processFailure !== null) {
			failure = appendFailure(failure, processFailure, "Codex startup process cleanup failed.");
		}
		invalidateTransaction(local);
		releaseRegistration(published, runtime, "failed", failureMessage(failure));
		return failure;
	};

	const initialSlots: CodexWorkbenchOwnerSlots = {
		/**
		 * Start one generation: acquire a child and its kernel, build the graph
		 * against them, activate it, and publish it as ready. A start that fails
		 * anywhere tears down whatever it acquired and releases the runtime.
		 * @returns The snapshot the owner reached.
		 */
		start: () => {
			if (local.startPromise !== null) {
				return local.startPromise;
			}
			if (!isCurrentRuntime(published, runtime)) {
				return Promise.reject(
					new CodexWorkbenchCompositionError(
						"not_started",
						"The Codex workbench source generation cannot start this retired runtime.",
					),
				);
			}
			const ticket = reserveTicket(runtime);
			published.state = "starting";
			published.failure = null;
			const generationNumber = ++published.generation;
			const readiness: CandidateReadiness = { initialized: false, accountReady: false };
			const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
				let candidate: CodexWorkbenchGeneration | null = null;
				let resolveChild!: (prepared: {
					readonly child: CodexProcessChild;
					readonly transaction: LifecycleTransaction;
					readonly initialIdentity: IdentityAuthorities;
				}) => void;
				let rejectChild!: (error: unknown) => void;
				const childReady = new Promise<{
					readonly child: CodexProcessChild;
					readonly transaction: LifecycleTransaction;
					readonly initialIdentity: IdentityAuthorities;
				}>((resolve, reject) => {
					resolveChild = resolve;
					rejectChild = reject;
				});
				let acceptedChild = false;
				/**
				 * Take the first child the process produces, acquire its kernel, and
				 * hand both to the startup. A later child is not this startup's.
				 * @param child The child.
				 */
				const receiveChild = (child: CodexProcessChild) => {
					if (acceptedChild) {
						return;
					}
					acceptedChild = true;
					try {
						if (
							!ownsTicket(published, runtime, ticket) ||
							!ownsProcessChild(runtime.process, child)
						) {
							throw new CodexWorkbenchCompositionError(
								"not_started",
								"A retired Codex startup cannot acquire a child kernel.",
							);
						}
						const transaction: LifecycleTransaction = {
							ticket,
							child,
							phase: "starting",
							transport: null,
						};
						local.transaction = transaction;
						const acquisition = options.createKernel(
							generationInput(
								published,
								runtime,
								local,
								transaction,
								generationNumber,
								child,
								readiness,
							),
						);
						runtime.identityLedger = acquisition.kernel.identityLedger;
						runtime.transport = acquisition.kernel.transport;
						transaction.transport = acquisition.kernel.transport;
						attachExitBridge(runtime, acquisition.kernel.transport);
						resolveChild({ child, transaction, initialIdentity: acquisition.identity });
					} catch (error) {
						rejectChild(error);
					}
				};
				local.nextChild = receiveChild;
				/**
				 * Fail the startup when the process becomes terminal before it
				 * produced a child: waiting longer cannot produce one.
				 * @param current What the process reports.
				 */
				const observeProcess = (current: CodexProcessSnapshot): void => {
					if (!ownsTicket(published, runtime, ticket) || local.nextChild !== receiveChild) {
						return;
					}
					const failure = terminalProcessAcquisitionFailure(current);
					if (failure !== null) {
						rejectChild(failure);
					}
				};
				let processSnapshotUnsubscribe: (() => void) | null = null;
				try {
					processSnapshotUnsubscribe = runtime.process.subscribe(observeProcess);
					observeProcess(runtime.process.snapshot());
					const processStart = runtime.process.start().catch((error) => {
						rejectChild(error);
						throw error;
					});
					void processStart.catch(() => undefined);
					const { child, transaction, initialIdentity } = await childReady;
					const recoveryFailure = await local.recoveryBarrier;
					if (recoveryFailure !== null) {
						throw recoveryFailure;
					}
					assertTransaction(
						published,
						runtime,
						local,
						transaction,
						"A retired Codex startup cannot construct a generation.",
					);
					candidate = await options.createGeneration(
						generationInput(
							published,
							runtime,
							local,
							transaction,
							generationNumber,
							child,
							readiness,
							initialIdentity,
						),
					);
					ownGeneration(local, candidate);
					assertTransaction(
						published,
						runtime,
						local,
						transaction,
						"A retired Codex startup cannot install child-exit observation.",
					);
					await commitGeneration(candidate, transaction, readiness);
					return snapshot(published, runtime);
				} catch (error) {
					throw await abandonStartup(error, candidate, ticket);
				} finally {
					processSnapshotUnsubscribe?.();
					if (local.nextChild === receiveChild) {
						local.nextChild = null;
					}
					local.startPromise = null;
				}
			})();
			local.startPromise = operation;
			return operation;
		},
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
		/** A workbench that is not ready has no browser gateway to hand out. */
		gateway: () => {
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench browser gateway is not ready.",
			);
		},
	};
	published.current = initialSlots;
	/**
	 * Start again after a child exit: the owner returns to its initial dispatch
	 * and begins a new generation, and a start that fails is the new state
	 * rather than something a caller must be told twice.
	 */
	local.restart = () => {
		if (!isCurrentRuntime(published, runtime) || runtime.released) {
			return;
		}
		published.current = initialSlots;
		void initialSlots.start().catch(() => undefined);
	};
	return Object.freeze({
		/**
		 * Start the workbench, through whichever dispatch is current.
		 * @returns The snapshot the owner reached.
		 */
		start: () => dispatchSlots().start(),
		// Keep terminal ownership in this returned handle after public dispatch
		// is revoked. The Canvas lifetime may need one force retry to prove the
		// detached process group is gone.
		/**
		 * Shut the workbench down for good.
		 * @returns The snapshot it ended in.
		 */
		shutdown: () => terminalShutdown(published, runtime, local),
		/**
		 * What the workbench reports about itself.
		 * @returns The snapshot.
		 */
		snapshot: () => snapshot(published, runtime),
		/**
		 * The browser gateway of whichever generation is current.
		 * @returns The gateway.
		 */
		gateway: () => dispatchSlots().gateway(),
	});
}

export {
	CODEX_WORKBENCH_OWNER,
	createCodexWorkbenchGenerationLifecycle,
	installCodexWorkbenchOwnerLifecycle,
};
export type {
	CodexTransportExit,
	CodexWorkbenchComponents,
	CodexWorkbenchExitBridge,
	CodexWorkbenchExitHandler,
	CodexWorkbenchGeneration,
	CodexWorkbenchGenerationFactory,
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchGenerationInput,
	CodexWorkbenchKernelAcquisition,
	CodexWorkbenchOwner,
	CodexWorkbenchOwnerOptions,
	CodexWorkbenchOwnerPublication,
	CodexWorkbenchOwnerRuntime,
	CodexWorkbenchOwnerSlots,
	CodexWorkbenchSnapshot,
	CodexWorkbenchStableKernel,
	CodexWorkbenchState,
	CodexWorkbenchStopReason,
	CreateCodexWorkbenchGenerationLifecycleOptions,
};
