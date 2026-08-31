import {
	CodexCoordinatorError,
	type CodexCoordinator,
	type CodexCoordinatorOptions,
	type CoordinatorConfiguredSettings,
	type CoordinatorEpochSnapshot,
	type CoordinatorEnsureInput,
	type CoordinatorReviewHashes,
	type CoordinatorSnapshot,
} from "./contract.js";
import {
	COORDINATOR_EFFORT,
	COORDINATOR_MODEL,
	listCoordinatorModels,
	selectCoordinatorModel,
	type CoordinatorModelSelection,
} from "./model.js";
import { reviewedCoordinatorHashes } from "./review.js";
import { assertCurrentEpoch, decideCandidate } from "./reuse.js";
import { createCoordinatorStarter } from "./start.js";
import {
	coordinatorError,
	emptySnapshot,
	failedSnapshot,
	freezePersistence,
	inspectSnapshot,
	readySnapshot,
} from "./state.js";

export function createCodexCoordinator(options: CodexCoordinatorOptions): CodexCoordinator {
	if (options.checkoutRoot.length === 0) {
		throw new CodexCoordinatorError("invalid_input", "The coordinator requires a checkout root.");
	}
	let retainedPersistence = options.persisted ? freezePersistence(options.persisted) : null;
	let current: CoordinatorSnapshot = emptySnapshot("unbound", null);
	let ensureTail: Promise<void> = Promise.resolve();
	const starter = createCoordinatorStarter(options, {
		setSnapshot: (snapshot) => {
			current = snapshot;
		},
		snapshot: () => current,
		setPersistence: (persistence) => {
			retainedPersistence = persistence;
		},
	});

	const ensure = (input: CoordinatorEnsureInput = {}): Promise<CoordinatorSnapshot> => {
		const run = ensureTail.then(() => ensureOne(input));
		ensureTail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};

	async function ensureOne(input: CoordinatorEnsureInput): Promise<CoordinatorSnapshot> {
		current = emptySnapshot("unbound", null);
		let selection: CoordinatorModelSelection;
		try {
			selection = selectCoordinatorModel(await listCoordinatorModels(options.session));
		} catch (error) {
			const failure = coordinatorError(
				error,
				"model_list_failed",
				"Coordinator model selection failed.",
			);
			current = failedSnapshot(failure.message, null);
			throw failure;
		}

		let reviewed: CoordinatorReviewHashes;
		try {
			reviewed = reviewedCoordinatorHashes("");
		} catch (error) {
			const failure = coordinatorError(
				error,
				"invalid_input",
				"Reviewed coordinator inputs are not intact.",
			);
			current = failedSnapshot(failure.message, null);
			throw failure;
		}
		const configured: CoordinatorConfiguredSettings = Object.freeze({
			model: COORDINATOR_MODEL,
			effort: COORDINATOR_EFFORT,
			serviceTier: selection.configuredServiceTier,
		});

		let epochSnapshot: CoordinatorEpochSnapshot;
		try {
			epochSnapshot = options.epoch.snapshot();
			assertCurrentEpoch(epochSnapshot, options);
		} catch (error) {
			const failure = coordinatorError(
				error,
				"epoch_unavailable",
				"The coordinator cannot establish a current Codex epoch.",
			);
			current = failedSnapshot(failure.message, configured);
			throw failure;
		}

		const candidate = input.persisted === undefined ? retainedPersistence : input.persisted;
		const decision = await decideCandidate(candidate, configured, reviewed, epochSnapshot, options);
		if (decision.kind === "reuse") {
			retainedPersistence = decision.persistence;
			current = readySnapshot(decision.persistence);
			return current;
		}
		if (decision.kind === "inspect") {
			retainedPersistence = null;
			current = inspectSnapshot(
				decision.threadId,
				decision.operationId,
				configured,
				candidate?.settings ?? null,
				candidate?.review ?? null,
				decision.reason,
			);
			return current;
		}

		const operationId = input.operationId;
		if (operationId === undefined || operationId.length === 0) {
			retainedPersistence = null;
			current = inspectSnapshot(
				decision.threadId,
				null,
				configured,
				candidate?.settings ?? null,
				candidate?.review ?? null,
				`${decision.reason} A fresh host operation id is required before replacement.`,
			);
			return current;
		}
		return starter.start(operationId, selection, configured, reviewed, epochSnapshot);
	}

	return Object.freeze({
		ensure,
		snapshot: () => current,
		persisted: () => retainedPersistence,
		onNotification: starter.onNotification,
	});
}
