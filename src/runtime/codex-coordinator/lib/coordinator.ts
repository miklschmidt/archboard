import {
	CodexCoordinatorError,
	type CodexCoordinator,
	type CodexCoordinatorOptions,
	type CoordinatorConfiguredSettings,
	type CoordinatorEpochSnapshot,
	type CoordinatorEnsureInput,
	type CoordinatorPersistedState,
	type CoordinatorReviewHashes,
	type CoordinatorSnapshot,
} from "@/runtime/codex-coordinator/lib/contract";
import {
	COORDINATOR_EFFORT,
	COORDINATOR_MODEL,
	listCoordinatorModels,
	selectCoordinatorModel,
	type CoordinatorModelSelection,
} from "@/runtime/codex-coordinator/lib/model";
import { reviewedCoordinatorHashes } from "@/runtime/codex-coordinator/lib/review";
import { assertCurrentEpoch, decideCandidate } from "@/runtime/codex-coordinator/lib/reuse";
import { createCoordinatorStarter } from "@/runtime/codex-coordinator/lib/start";
import {
	coordinatorError,
	emptySnapshot,
	failedSnapshot,
	freezePersistence,
	inspectSnapshot,
	readySnapshot,
} from "@/runtime/codex-coordinator/lib/state";

/**
 * Build the module that keeps exactly one coordinator thread for the workbench. Each `ensure`
 * either proves the coordinator it already has is still the reviewed one and reuses it, leaves a
 * thread it cannot prove as inspect-only, or starts a fresh one. Calls are serialised, so two
 * ensures can never start two coordinators.
 * @param options - The session, epoch store, identity authority and durable state.
 * @returns The coordinator module.
 */
export function createCodexCoordinator(options: CodexCoordinatorOptions): CodexCoordinator {
	if (options.checkoutRoot.length === 0) {
		throw new CodexCoordinatorError("invalid_input", "The coordinator requires a checkout root.");
	}
	let retainedPersistence = options.persisted ? freezePersistence(options.persisted) : null;
	let current: CoordinatorSnapshot = emptySnapshot("unbound", null);
	let ensureTail: Promise<void> = Promise.resolve();
	const starter = createCoordinatorStarter(options, {
		/**
		 * Record the snapshot the starter has reached.
		 * @param snapshot - The new snapshot.
		 */
		setSnapshot: (snapshot) => {
			current = snapshot;
		},
		/**
		 * The snapshot as it stands now.
		 * @returns The current snapshot.
		 */
		snapshot: () => current,
		/**
		 * Retain the durable state a started coordinator can be reclaimed from.
		 * @param persistence - The durable state, or null when there is none to keep.
		 */
		setPersistence: (persistence) => {
			retainedPersistence = persistence;
		},
	});

	/**
	 * Ensure the workbench has a coordinator, behind every ensure enqueued before it.
	 * @param input - The durable candidate and the host operation identity, when supplied.
	 * @returns The snapshot the ensure settled as.
	 */
	const ensure = (input: CoordinatorEnsureInput = {}): Promise<CoordinatorSnapshot> => {
		const run = ensureTail.then(() => ensureOne(input));
		ensureTail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};

	/**
	 * Run one ensure: choose the model, prove the reviewed artifacts and the epoch, then decide
	 * about whatever coordinator is retained.
	 * @param input - The durable candidate and the host operation identity, when supplied.
	 * @returns The snapshot the ensure settled as.
	 */
	async function ensureOne(input: CoordinatorEnsureInput): Promise<CoordinatorSnapshot> {
		current = emptySnapshot("unbound", null);
		const selection = await selectModel();
		const reviewed = reviewedHashes();
		const configured: CoordinatorConfiguredSettings = Object.freeze({
			model: COORDINATOR_MODEL,
			effort: COORDINATOR_EFFORT,
			serviceTier: selection.configuredServiceTier,
		});
		const epochSnapshot = currentEpochSnapshot(configured);
		const candidate = input.persisted === undefined ? retainedPersistence : input.persisted;
		const decision = await decideCandidate(candidate, configured, reviewed, epochSnapshot, options);
		if (decision.kind === "reuse") {
			retainedPersistence = decision.persistence;
			current = readySnapshot(decision.persistence);
			return current;
		}
		if (decision.kind === "inspect") {
			return inspectDecision(
				decision.threadId,
				decision.operationId,
				configured,
				candidate,
				decision.reason,
			);
		}
		const operationId = input.operationId;
		if (operationId === undefined || operationId.length === 0) {
			return inspectDecision(
				decision.threadId,
				null,
				configured,
				candidate,
				`${decision.reason} A fresh host operation id is required before replacement.`,
			);
		}
		return starter.start(operationId, selection, configured, reviewed, epochSnapshot);
	}

	/**
	 * Choose the coordinator's model from what the account may use. A coordinator that cannot be
	 * given its reviewed model is not started at all.
	 * @returns The model selection.
	 * @throws {CodexCoordinatorError} When the model list cannot be read or holds no usable model.
	 */
	async function selectModel(): Promise<CoordinatorModelSelection> {
		try {
			return selectCoordinatorModel(await listCoordinatorModels(options.session));
		} catch (error) {
			const failure = coordinatorError(
				error,
				"model_list_failed",
				"Coordinator model selection failed.",
			);
			current = failedSnapshot(failure.message, null);
			throw failure;
		}
	}

	/**
	 * Re-derive the reviewed instruction and manifest hashes, which is what proves the coordinator
	 * about to be started is the reviewed one.
	 * @returns The review hashes.
	 * @throws {CodexCoordinatorError} When a reviewed artifact has drifted.
	 */
	function reviewedHashes(): CoordinatorReviewHashes {
		try {
			return reviewedCoordinatorHashes("");
		} catch (error) {
			const failure = coordinatorError(
				error,
				"invalid_input",
				"Reviewed coordinator inputs are not intact.",
			);
			current = failedSnapshot(failure.message, null);
			throw failure;
		}
	}

	/**
	 * The current durable epoch, refused when there is none: everything the coordinator does is
	 * recorded against an epoch, so there is nothing to do without one.
	 * @param configured - The settings the coordinator was asked for, kept on the failure snapshot.
	 * @returns The epoch snapshot.
	 * @throws {CodexCoordinatorError} When no current epoch can be established.
	 */
	function currentEpochSnapshot(
		configured: CoordinatorConfiguredSettings,
	): CoordinatorEpochSnapshot {
		try {
			const epochSnapshot = options.epoch.snapshot();
			assertCurrentEpoch(epochSnapshot, options);
			return epochSnapshot;
		} catch (error) {
			const failure = coordinatorError(
				error,
				"epoch_unavailable",
				"The coordinator cannot establish a current Codex epoch.",
			);
			current = failedSnapshot(failure.message, configured);
			throw failure;
		}
	}

	/**
	 * Leave a thread inspect-only and stop retaining it: the workbench can see what is there, but
	 * will not drive a coordinator it could not prove.
	 * @param threadId - The thread that was considered.
	 * @param operationId - The operation identity it was considered under, when there is one.
	 * @param configured - The settings the coordinator was asked for.
	 * @param candidate - The durable candidate, when there was one.
	 * @param reason - Why the thread cannot be driven.
	 * @returns The published snapshot.
	 */
	function inspectDecision(
		threadId: CoordinatorSnapshot["threadId"],
		operationId: string | null,
		configured: CoordinatorConfiguredSettings,
		candidate: CoordinatorPersistedState | null,
		reason: string,
	): CoordinatorSnapshot {
		retainedPersistence = null;
		current = inspectSnapshot(
			threadId,
			operationId,
			configured,
			candidate?.settings ?? null,
			candidate?.review ?? null,
			reason,
		);
		return current;
	}

	return Object.freeze({
		ensure,
		/**
		 * The coordinator's current snapshot.
		 * @returns The snapshot.
		 */
		snapshot: () => current,
		/**
		 * The durable state a later run can reclaim this coordinator from.
		 * @returns The retained state, or null when there is none.
		 */
		persisted: () => retainedPersistence,
		onNotification: starter.onNotification,
	});
}
