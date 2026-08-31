import type {
	ChildEpoch,
	ChildId,
	OperationId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	EpochExecutionProof,
	EpochOperationRecord,
	EpochTransaction,
} from "../../codex-epoch/index.js";
import type { ThreadLinkBindingSnapshot, ThreadLinkTarget } from "../../codex-thread-link/index.js";
import { compensateAfterBindFailure } from "./cleanup.js";
import {
	WORKHORSE_INSTRUCTION_HASH,
	WORKHORSE_MANIFEST_HASH,
	WORKHORSE_OPERATION_KIND,
	WORKHORSE_RPC,
	WORKHORSE_THREAD_SOURCE,
	createWorkhorseThreadStartParams,
} from "./model.js";
import type {
	CodexWorkhorseStart,
	CodexWorkhorseStartOptions,
	WorkhorseSnapshot,
	WorkhorseStartInput,
	WorkhorseStartResponse,
	WorkhorseStartTransaction,
} from "./contract.js";
import {
	emptySnapshot,
	errorMessage,
	failedSnapshot,
	inspectSnapshot,
	mutationOutcome,
	readySnapshot,
	startingSnapshot,
} from "./state.js";
import {
	isCommittedStartRecord,
	isCurrentStartProof,
	isExecutableWorkhorseBinding,
	validateWorkhorseStartResponse,
	type ValidatedWorkhorseStart,
} from "./validation.js";

export function createCodexWorkhorseStart(
	options: CodexWorkhorseStartOptions,
): CodexWorkhorseStart {
	let latest = emptySnapshot();
	let tail: Promise<void> = Promise.resolve();

	const snapshot = (): WorkhorseSnapshot => latest;
	const start = (input: WorkhorseStartInput): Promise<WorkhorseSnapshot> => {
		const run = tail.then(() => execute(input));
		tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};

	async function execute(input: WorkhorseStartInput): Promise<WorkhorseSnapshot> {
		const childId = options.identity.validator.childId;
		const epoch = options.identity.validator.epoch;
		const operationId = options.operation.issuer.mintOperationId();
		try {
			options.operation.validator.assertCurrentOperationId(operationId);
		} catch (error) {
			latest = failedSnapshot(
				input.paneId,
				operationId,
				`The workhorse operation identity is not current: ${errorMessage(error)}`,
			);
			return latest;
		}

		latest = startingSnapshot(input.paneId, childId, epoch, operationId);
		let transaction: WorkhorseStartTransaction;
		try {
			const epochSnapshot = options.epoch.snapshot();
			transaction = options.epoch.stageOperation({
				childId,
				epoch,
				operationId,
				kind: WORKHORSE_OPERATION_KIND,
				rpc: WORKHORSE_RPC,
				workspaceRoot: options.checkoutRoot,
				instructionHash: WORKHORSE_INSTRUCTION_HASH,
				manifestHash: WORKHORSE_MANIFEST_HASH,
				expected: epochSnapshot.cas,
			});
			assertTransaction(
				transaction,
				childId,
				epoch,
				operationId,
				WORKHORSE_OPERATION_KIND,
				WORKHORSE_RPC,
			);
		} catch (error) {
			latest = failedSnapshot(
				input.paneId,
				operationId,
				`The workhorse start transaction could not be staged: ${errorMessage(error)}`,
			);
			return latest;
		}

		let startParams: ReturnType<typeof createWorkhorseThreadStartParams>;
		try {
			startParams = createWorkhorseThreadStartParams(options.checkoutRoot);
		} catch (error) {
			if (rollback(options, transaction, "The workhorse start profile was not valid.")) {
				latest = failedSnapshot(
					input.paneId,
					operationId,
					`The workhorse start profile was not valid: ${errorMessage(error)}`,
				);
				return latest;
			}
			markUnknown(
				options,
				transaction,
				"The workhorse start profile was invalid and local rollback durability is unknown.",
				null,
			);
			latest = inspectSnapshot({
				paneId: input.paneId,
				childId,
				epoch,
				threadId: null,
				operationId,
				outcome: "outcome_unknown",
				start: null,
				binding: null,
				cleanup: null,
				reason: `The workhorse start profile was invalid: ${errorMessage(error)}`,
			});
			return latest;
		}

		let response: WorkhorseStartResponse;
		try {
			response = await options.session.threadStart(startParams);
		} catch (error) {
			return settleStartFailure(input, childId, epoch, operationId, transaction, error);
		}

		let started: ValidatedWorkhorseStart;
		try {
			started = validateWorkhorseStartResponse(response, options);
		} catch (error) {
			markUnknown(
				options,
				transaction,
				"The workhorse thread/start confirmation was invalid.",
				null,
			);
			latest = inspectSnapshot({
				paneId: input.paneId,
				childId,
				epoch,
				threadId: null,
				operationId,
				outcome: "outcome_unknown",
				start: null,
				binding: null,
				cleanup: null,
				reason: `The workhorse thread/start confirmation was invalid: ${errorMessage(error)}`,
			});
			return latest;
		}

		let committed: EpochOperationRecord;
		try {
			committed = options.epoch.commitOperation(transaction, {
				threadId: started.threadId,
				threadSource: WORKHORSE_THREAD_SOURCE,
			});
		} catch (error) {
			markUnknown(
				options,
				transaction,
				"The workhorse start was returned but could not be durably committed.",
				started.threadId,
			);
			latest = inspectSnapshot({
				paneId: input.paneId,
				childId,
				epoch,
				threadId: started.threadId,
				operationId,
				outcome: "outcome_unknown",
				start: started.facts,
				binding: null,
				cleanup: null,
				reason: `The workhorse start was confirmed, but durable ownership failed: ${errorMessage(error)}`,
			});
			return latest;
		}
		if (
			!isCommittedStartRecord(
				committed,
				childId,
				epoch,
				operationId,
				started.threadId,
				options.checkoutRoot,
			)
		) {
			latest = inspectSnapshot({
				paneId: input.paneId,
				childId,
				epoch,
				threadId: started.threadId,
				operationId,
				outcome: "outcome_unknown",
				start: started.facts,
				binding: null,
				cleanup: null,
				reason: "The workhorse start returned a non-canonical durable ownership record.",
			});
			return latest;
		}

		let proof: EpochExecutionProof;
		try {
			proof = options.epoch.assertCurrent({
				childId,
				epoch,
				operationId,
				threadId: started.threadId,
			});
			const proofSnapshot = options.epoch.snapshot();
			if (
				proof.manifestRevision !== proofSnapshot.manifest.revision ||
				!isCurrentStartProof(
					proof,
					childId,
					epoch,
					operationId,
					started.threadId,
					options.checkoutRoot,
				)
			) {
				throw new Error("the current workhorse ownership proof is non-canonical");
			}
		} catch (error) {
			latest = await compensateAfterBindFailure(
				options,
				input,
				childId,
				epoch,
				operationId,
				started,
				null,
				`The committed workhorse could not be bound: ${errorMessage(error)}`,
			);
			return latest;
		}

		let binding: ThreadLinkBindingSnapshot;
		try {
			const target: ThreadLinkTarget = {
				threadId: started.threadId,
				childId,
				epoch,
				operationId,
				provenance: proof,
			};
			binding = await options.threadLink.classifyAndBind(input.paneId, input.expected, target);
		} catch (error) {
			latest = await compensateAfterBindFailure(
				options,
				input,
				childId,
				epoch,
				operationId,
				started,
				null,
				`The workhorse thread link could not be bound: ${errorMessage(error)}`,
			);
			return latest;
		}

		if (isExecutableWorkhorseBinding(binding, input.paneId, childId, epoch, started.threadId)) {
			latest = readySnapshot(input.paneId, childId, epoch, operationId, started.facts, binding);
			return latest;
		}
		latest = await compensateAfterBindFailure(
			options,
			input,
			childId,
			epoch,
			operationId,
			started,
			binding,
			"The workhorse thread link did not become executable.",
		);
		return latest;
	}

	async function settleStartFailure(
		input: WorkhorseStartInput,
		childId: ChildId,
		epoch: ChildEpoch,
		operationId: OperationId,
		transaction: WorkhorseStartTransaction,
		error: unknown,
	): Promise<WorkhorseSnapshot> {
		if (mutationOutcome(error) === "not_delivered") {
			if (rollback(options, transaction, "The workhorse thread/start was not delivered.")) {
				latest = failedSnapshot(
					input.paneId,
					operationId,
					"The workhorse thread/start was not delivered; the staged operation was rolled back.",
				);
				return latest;
			}
			markUnknown(
				options,
				transaction,
				"The workhorse thread/start was not delivered, but local rollback durability is unknown.",
				null,
			);
			latest = inspectSnapshot({
				paneId: input.paneId,
				childId,
				epoch,
				threadId: null,
				operationId,
				outcome: "outcome_unknown",
				start: null,
				binding: null,
				cleanup: null,
				reason:
					"The workhorse thread/start was not delivered, but local rollback durability is unknown.",
			});
			return latest;
		}
		markUnknown(options, transaction, "The workhorse thread/start outcome is unknown.", null);
		latest = inspectSnapshot({
			paneId: input.paneId,
			childId,
			epoch,
			threadId: null,
			operationId,
			outcome: "outcome_unknown",
			start: null,
			binding: null,
			cleanup: null,
			reason: "The workhorse thread/start outcome is unknown; it was not retried or inferred.",
		});
		return latest;
	}

	return Object.freeze({ start, snapshot });
}

function assertTransaction(
	transaction: EpochTransaction,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	kind: string,
	rpc: string,
): void {
	const record = transaction.record;
	if (
		record.correlation.childId !== childId ||
		record.correlation.epoch !== epoch ||
		record.correlation.operationId !== operationId ||
		record.operation.id !== operationId ||
		record.operation.kind !== kind ||
		record.operation.rpc !== rpc ||
		record.status !== "staged" ||
		record.outcome !== "pending"
	) {
		throw new Error("the epoch store returned a non-canonical staged transaction");
	}
}

function rollback(
	options: CodexWorkhorseStartOptions,
	transaction: WorkhorseStartTransaction,
	reason: string,
): boolean {
	try {
		options.epoch.rollbackOperation(transaction, reason);
		return true;
	} catch {
		return false;
	}
}

function markUnknown(
	options: CodexWorkhorseStartOptions,
	transaction: WorkhorseStartTransaction,
	reason: string,
	threadId: ThreadId | null,
): boolean {
	try {
		const confirmation =
			threadId === null ? undefined : { threadId, threadSource: WORKHORSE_THREAD_SOURCE };
		options.epoch.markOutcomeUnknown(transaction, reason, confirmation);
		return true;
	} catch {
		return false;
	}
}
