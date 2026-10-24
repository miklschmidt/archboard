import { emptyManifest } from "#runtime/store/epoch/manifest.ts";
import {
	type ActiveEpoch,
	type EpochOperationRecord,
} from "#runtime/store/epoch/manifest-contract.ts";
import {
	type EpochConfirmation,
	type EpochExecutionRequest,
	type EpochSnapshot,
	type EpochStageInput,
	type EpochTransaction,
} from "#runtime/store/epoch/contract.ts";
import { type CoordinatorEpochPort } from "#runtime/protocol/coordinator/contract.ts";
import type { IdentityAuthority } from "@archboard/codex-app-server/identity";

class FakeEpoch implements CoordinatorEpochPort {
	readonly records: EpochOperationRecord[] = [];
	readonly assertRequests: EpochExecutionRequest[] = [];
	unknownCalls = 0;
	private revision = 0;

	constructor(
		authority: IdentityAuthority,
		private readonly stageError: Error | null = null,
		private readonly commitError: Error | null = null,
		private readonly activeEpoch: ActiveEpoch | null = {
			childId: authority.validator.childId,
			epoch: authority.validator.epoch,
			operationId: "epoch-start",
		},
	) {}

	snapshot(): EpochSnapshot {
		return {
			manifest: { ...emptyManifest(), activeEpoch: this.activeEpoch, records: this.records },
			cas: { revision: this.revision, bytesHash: null },
			manifestPath: "/tmp/fake-epoch-manifest.json",
		};
	}

	stageOperation(input: EpochStageInput): EpochTransaction {
		if (this.stageError !== null) {
			throw this.stageError;
		}
		const record: EpochOperationRecord = {
			correlation: {
				childId: input.childId,
				epoch: input.epoch,
				operationId: input.operationId,
			},
			operation: {
				id: input.operationId,
				kind: input.kind,
				rpc: input.rpc ?? null,
			},
			status: "staged",
			outcome: "pending",
			provenance: {
				childId: input.childId,
				epoch: input.epoch,
				threadId: null,
				turnId: null,
				threadSource: null,
				workspaceRoot: input.workspaceRoot,
				instructionHash: input.instructionHash,
				manifestHash: input.manifestHash,
				confirmedAtMs: null,
			},
			reason: null,
			createdAtMs: 1,
			updatedAtMs: 1,
		};
		this.records.push(record);
		this.revision += 1;
		return { record, cas: { revision: this.revision, bytesHash: null } };
	}

	commitOperation(
		transaction: EpochTransaction,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord {
		if (this.commitError !== null) {
			throw this.commitError;
		}
		const record = this.recordFor(transaction);
		return this.replace({
			...record,
			status: "committed",
			outcome: "delivered",
			provenance: {
				...record.provenance,
				threadId: confirmation?.threadId ?? null,
				threadSource: confirmation?.threadSource ?? null,
				confirmedAtMs: confirmation?.confirmedAtMs ?? 2,
			},
			reason: "effect confirmed",
			updatedAtMs: 2,
		});
	}

	rollbackOperation(transaction: EpochTransaction, reason: string): EpochOperationRecord {
		const record = this.recordFor(transaction);
		return this.replace({ ...record, status: "rolled_back", outcome: "not_delivered", reason });
	}

	markOutcomeUnknown(
		transaction: EpochTransaction,
		reason: string,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord {
		this.unknownCalls += 1;
		const record = this.recordFor(transaction);
		return this.replace({
			...record,
			status: "inspect_only",
			outcome: "outcome_unknown",
			provenance: {
				...record.provenance,
				threadId: confirmation?.threadId ?? null,
				threadSource: confirmation?.threadSource ?? null,
				confirmedAtMs: confirmation?.confirmedAtMs ?? null,
			},
			reason,
			updatedAtMs: 2,
		});
	}

	assertCurrent(request: EpochExecutionRequest) {
		this.assertRequests.push(request);
		const record = this.records.find(
			(candidate) =>
				candidate.correlation.childId === request.childId &&
				candidate.correlation.epoch === request.epoch &&
				candidate.correlation.operationId === request.operationId &&
				candidate.provenance.threadId === request.threadId &&
				candidate.status === "committed" &&
				candidate.outcome === "delivered",
		);
		if (record === undefined) {
			throw new Error("fake epoch proof unavailable");
		}
		return { record, manifestRevision: this.revision };
	}

	private recordFor(transaction: EpochTransaction): EpochOperationRecord {
		const record = this.records.find(
			(candidate) =>
				candidate.correlation.operationId === transaction.record.correlation.operationId,
		);
		if (record === undefined) {
			throw new Error("fake epoch transaction missing");
		}
		return record;
	}

	private replace(record: EpochOperationRecord): EpochOperationRecord {
		const index = this.records.findIndex(
			(candidate) => candidate.correlation.operationId === record.correlation.operationId,
		);
		if (index < 0) {
			throw new Error("fake epoch record missing");
		}
		this.records[index] = record;
		this.revision += 1;
		return record;
	}
}

export { FakeEpoch };
