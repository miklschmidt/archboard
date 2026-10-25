import { captureThreadProfile } from "#runtime/rules/host/instructions.ts";
import {
	CodexCoordinatorError,
	type CodexCoordinator,
	type CodexCoordinatorOptions,
	type CoordinatorConfiguredSettings,
	type CoordinatorEpochSnapshot,
	type CoordinatorEnsureInput,
	type CoordinatorPersistedState,
	type CoordinatorReplaceInput,
	type CoordinatorReviewHashes,
	type CoordinatorSnapshot,
} from "#runtime/protocol/coordinator/contract.ts";
import {
	COORDINATOR_EFFORT,
	COORDINATOR_MODEL,
	listCoordinatorModels,
	selectCoordinatorModel,
	type CoordinatorModelSelection,
} from "#runtime/services/coordinator/model.ts";
import { createCodexThreadUnload } from "#runtime/operations/thread-unload/unload.ts";
import { reviewedCoordinatorHashes } from "#runtime/rules/coordinator/review.ts";
import { assertCurrentEpoch, decideCandidate } from "#runtime/services/coordinator/reuse.ts";
import { createCoordinatorStarter } from "#runtime/services/coordinator/start.ts";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import {
	coordinatorError,
	emptySnapshot,
	failedSnapshot,
	freezePersistence,
	inspectSnapshot,
	readySnapshot,
} from "#runtime/state/coordinator/state.ts";

/**
 * The settings the coordinator is asked for with the chosen model.
 * @param selection - The chosen model and service tier.
 * @returns The configured settings.
 */
function configuredSettings(selection: CoordinatorModelSelection): CoordinatorConfiguredSettings {
	return Object.freeze({
		model: COORDINATOR_MODEL,
		effort: COORDINATOR_EFFORT,
		serviceTier: selection.configuredServiceTier,
	});
}

/** What a replacement has reached, kept apart from the published coordinator until it is ready. */
interface StagedCoordinator {
	snapshot: CoordinatorSnapshot;
	persistence: CoordinatorPersistedState | null;
}

/**
 * Build the module that keeps one conversation's current coordinator thread. Each `ensure`
 * either proves the coordinator it already has is still the reviewed one and reuses it, leaves a
 * thread it cannot prove as inspect-only, or starts a fresh one. Each `replace` starts a fresh
 * one in place of the current one, which a voice start asks for once the current coordinator has
 * carried a voice session (TASK-301). Calls are serialised, so two of them can never start two
 * coordinators at once. Other conversations keep coordinators of their own in the same epoch
 * (TASK-373), so only the starts this module made are its evidence.
 * @param starterOptions - The session, epoch store, identity authority and durable state.
 * @returns The coordinator module.
 */
export function createCodexCoordinator(starterOptions: CodexCoordinatorOptions): CodexCoordinator {
	const options = {
		...starterOptions,
		profile: captureThreadProfile(starterOptions.profile, "coordinator"),
	};
	if (options.workingDirectory.length === 0) {
		throw new CodexCoordinatorError(
			"invalid_input",
			"The coordinator requires a working directory.",
		);
	}
	let retainedPersistence = options.persisted ? freezePersistence(options.persisted) : null;
	// The coordinator starts this module made: another conversation's are not its evidence.
	const startedOperations = new Set<string>();
	let current: CoordinatorSnapshot = emptySnapshot("unbound", null);
	// While a replacement runs, what it reaches is staged here and the current coordinator stays.
	let staged: StagedCoordinator | null = null;
	let ensureTail: Promise<void> = Promise.resolve();
	/**
	 * Record the snapshot a start or a refusal has reached: staged while a replacement runs,
	 * published otherwise.
	 * @param snapshot - The new snapshot.
	 */
	const publish = (snapshot: CoordinatorSnapshot): void => {
		if (staged === null) {
			current = snapshot;
		} else {
			staged.snapshot = snapshot;
		}
	};
	const starter = createCoordinatorStarter(options, {
		setSnapshot: publish,
		/**
		 * The snapshot as it stands now, staged or published.
		 * @returns The snapshot.
		 */
		snapshot: () => staged?.snapshot ?? current,
		/**
		 * Retain the durable state a started coordinator can be reclaimed from.
		 * @param persistence - The durable state, or null when there is none to keep.
		 */
		setPersistence: (persistence) => {
			if (staged === null) {
				retainedPersistence = persistence;
			} else {
				staged.persistence = persistence;
			}
		},
	});
	const retirement = createCodexThreadUnload(options);

	/**
	 * Run one coordinator step behind every step enqueued before it.
	 * @param step - The step.
	 * @returns The snapshot the step settled as.
	 */
	const serialized = (step: () => Promise<CoordinatorSnapshot>): Promise<CoordinatorSnapshot> => {
		const run = ensureTail.then(step);
		ensureTail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};

	/**
	 * Ensure the workbench has a coordinator, behind every step enqueued before it.
	 * @param input - The durable candidate and the server operation identity, when supplied.
	 * @returns The snapshot the ensure settled as.
	 */
	const ensure = (input: CoordinatorEnsureInput = {}): Promise<CoordinatorSnapshot> =>
		serialized(() => ensureOne(input));

	/**
	 * Start a fresh coordinator in place of the current one, behind every step enqueued before it.
	 * @param input - The server operation identity the fresh start runs under.
	 * @returns The fresh coordinator's ready snapshot.
	 * @throws {CodexCoordinatorError} When the fresh coordinator did not become ready; the current
	 * one is then left exactly as it was.
	 */
	const replace = (input: CoordinatorReplaceInput): Promise<CoordinatorSnapshot> =>
		serialized(() => replaceOne(input));

	/**
	 * Run one ensure: choose the model, prove the reviewed artifacts and the epoch, then decide
	 * about whatever coordinator is retained.
	 * @param input - The durable candidate and the server operation identity, when supplied.
	 * @returns The snapshot the ensure settled as.
	 */
	async function ensureOne(input: CoordinatorEnsureInput): Promise<CoordinatorSnapshot> {
		current = emptySnapshot("unbound", null);
		const selection = await selectModel();
		const reviewed = reviewedHashes();
		const configured = configuredSettings(selection);
		const epochSnapshot = currentEpochSnapshot(configured);
		const candidate = input.persisted === undefined ? retainedPersistence : input.persisted;
		const decision = await decideCandidate(
			candidate,
			configured,
			reviewed,
			epochSnapshot,
			options,
			(operationId) => startedOperations.has(operationId),
		);
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
				`${decision.reason} A fresh server operation id is required before replacement.`,
			);
		}
		startedOperations.add(operationId);
		return starter.start(operationId, selection, configured, reviewed, epochSnapshot);
	}

	/**
	 * Start a fresh coordinator with everything it reaches staged, so the current coordinator stays
	 * published and retained until the fresh one is started, confirmed and committed. Only then are
	 * both swapped, in one step. A start that ends anywhere else leaves the current coordinator as it
	 * was: its thread was never reused, so a thread the start may have left behind is never driven.
	 * A swap retires the thread it replaced: it is unsubscribed once nothing runs on it, so Codex
	 * unloads it, and the caller is told how that went without waiting for it.
	 * @param input - The server operation identity the fresh start runs under, and who is told
	 * what became of the retired thread.
	 * @returns The fresh coordinator's ready snapshot.
	 * @throws {CodexCoordinatorError} When the fresh coordinator did not become ready.
	 */
	async function replaceOne(input: CoordinatorReplaceInput): Promise<CoordinatorSnapshot> {
		const { operationId } = input;
		if (operationId.length === 0) {
			throw new CodexCoordinatorError(
				"invalid_input",
				"A fresh server operation id is required before replacement.",
			);
		}
		const stage: StagedCoordinator = { snapshot: current, persistence: retainedPersistence };
		staged = stage;
		try {
			const selection = await selectModel();
			const reviewed = reviewedHashes();
			const configured = configuredSettings(selection);
			const epochSnapshot = currentEpochSnapshot(configured);
			startedOperations.add(operationId);
			const started = await starter.start(
				operationId,
				selection,
				configured,
				reviewed,
				epochSnapshot,
			);
			if (started.state !== "ready") {
				throw new CodexCoordinatorError(
					"transaction_failed",
					`A fresh coordinator did not become ready: ${started.reason ?? started.state}`,
				);
			}
			const retired = current;
			current = started;
			retainedPersistence = stage.persistence;
			if (retired.state === "ready" && retired.threadId !== null) {
				void retirement.unload(retired.threadId).then(input.onRetired);
			}
			return current;
		} finally {
			staged = null;
		}
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
			publish(failedSnapshot(failure.message, null));
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
			return reviewedCoordinatorHashes("", options.profile);
		} catch (error) {
			const failure = coordinatorError(
				error,
				"invalid_input",
				"Reviewed coordinator inputs are not intact.",
			);
			publish(failedSnapshot(failure.message, null));
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
			publish(failedSnapshot(failure.message, configured));
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
		replace,
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
		/**
		 * Take one session notification for the start handshake and the retired threads.
		 * @param event - The transport notification.
		 */
		onNotification: (event: TransportServerNotification) => {
			starter.onNotification(event);
			retirement.onNotification(event);
		},
	});
}
