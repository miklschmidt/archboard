import type { ChildEpoch, ChildId } from "../../../shared/codex-workbench-identity/index.js";
import { CODEX_SESSION_THREAD_SOURCE } from "../../codex-session/index.js";
import {
	CodexCoordinatorError,
	type CodexCoordinatorOptions,
	type CoordinatorConfiguredSettings,
	type CoordinatorEpochRecord,
	type CoordinatorEpochSnapshot,
	type CoordinatorPersistedState,
	type CoordinatorReviewHashes,
} from "./contract.js";
import { COORDINATOR_MODEL } from "./model.js";
import { hashCoordinatorSettings } from "./review.js";
import { errorMessage } from "./state.js";

export const COORDINATOR_OPERATION_KIND = "coordinator_start" as const;
export const COORDINATOR_RPC = "thread/start" as const;

export type CandidateDecision =
	| { readonly kind: "reuse"; readonly persistence: CoordinatorPersistedState }
	| {
			readonly kind: "replace";
			readonly reason: string;
			readonly threadId: CoordinatorPersistedState["threadId"] | null;
	  }
	| {
			readonly kind: "inspect";
			readonly reason: string;
			readonly threadId: CoordinatorPersistedState["threadId"] | null;
			readonly operationId: string | null;
	  };

export function assertCurrentEpoch(
	snapshot: CoordinatorEpochSnapshot,
	options: CodexCoordinatorOptions,
): void {
	const active = snapshot.manifest.activeEpoch;
	if (
		active === null ||
		active.childId !== options.identity.validator.childId ||
		active.epoch !== options.identity.validator.epoch
	) {
		throw new CodexCoordinatorError(
			"epoch_unavailable",
			"The epoch store does not contain the coordinator's current child epoch.",
		);
	}
}

export async function decideCandidate(
	candidate: CoordinatorPersistedState | null,
	configured: CoordinatorConfiguredSettings,
	reviewed: CoordinatorReviewHashes,
	epochSnapshot: CoordinatorEpochSnapshot,
	options: CodexCoordinatorOptions,
): Promise<CandidateDecision> {
	const currentEpoch = epochSnapshot.manifest.activeEpoch;
	if (currentEpoch === null) {
		return inspectDecision(candidate, "The coordinator has no active epoch to own.");
	}
	const currentRecords = coordinatorRecords(
		epochSnapshot,
		currentEpoch.childId,
		currentEpoch.epoch,
	);
	const uncertain = currentRecords.find(
		(record) =>
			(record.status === "inspect_only" && record.outcome === "outcome_unknown") ||
			(record.status === "staged" && record.outcome === "pending"),
	);
	if (uncertain !== undefined) {
		return {
			kind: "inspect",
			threadId: uncertain.provenance.threadId,
			operationId: uncertain.correlation.operationId,
			reason:
				"A coordinator thread/start transaction is uncertain; inspect authoritative state before another start.",
		};
	}
	if (candidate === null) {
		const committed = currentRecords.filter(
			(record) => record.status === "committed" && record.outcome === "delivered",
		);
		if (committed.length === 0) {
			return {
				kind: "replace",
				threadId: null,
				reason: "No coordinator evidence is retained; establish the first coordinator.",
			};
		}
		return {
			kind: "inspect",
			threadId: committed.length === 1 ? (committed[0]?.provenance.threadId ?? null) : null,
			operationId: committed.length === 1 ? (committed[0]?.correlation.operationId ?? null) : null,
			reason:
				committed.length === 0
					? "No coordinator evidence is retained."
					: "A persisted coordinator settings snapshot is required before reuse.",
		};
	}
	if (
		candidate.childId !== options.identity.validator.childId ||
		candidate.epoch !== options.identity.validator.epoch
	) {
		return {
			kind: "replace",
			threadId: candidate.threadId,
			reason: "The retained coordinator belongs to a stale child epoch.",
		};
	}

	const candidateRecords = currentRecords.filter(
		(record) => record.correlation.operationId === candidate.operationId,
	);
	if (candidateRecords.length !== 1) {
		return {
			kind: "inspect",
			threadId: candidate.threadId,
			operationId: candidate.operationId,
			reason: "The persisted coordinator operation has no unique current durable provenance.",
		};
	}
	const candidateRecord = candidateRecords[0];
	if (candidateRecord === undefined) {
		return {
			kind: "inspect",
			threadId: candidate.threadId,
			operationId: candidate.operationId,
			reason: "The persisted coordinator operation has no current durable provenance.",
		};
	}
	if (
		candidateRecord.status === "inspect_only" ||
		candidateRecord.status === "staged" ||
		candidateRecord.outcome !== "delivered"
	) {
		return {
			kind: "inspect",
			threadId: candidate.threadId,
			operationId: candidate.operationId,
			reason: "The persisted coordinator operation is not a confirmed reusable effect.",
		};
	}
	let mismatch: string | null;
	try {
		mismatch = persistenceMismatch(candidate, candidateRecord, configured, reviewed, options);
	} catch (error) {
		return {
			kind: "inspect",
			threadId: candidate.threadId,
			operationId: candidate.operationId,
			reason: `The retained coordinator evidence is malformed: ${errorMessage(error)}`,
		};
	}
	if (mismatch !== null) return { kind: "replace", threadId: candidate.threadId, reason: mismatch };
	try {
		const proof = options.epoch.assertCurrent({
			childId: candidate.childId,
			epoch: candidate.epoch,
			operationId: candidate.operationId,
			threadId: candidate.threadId,
		});
		if (
			proof.record.correlation.operationId !== candidate.operationId ||
			proof.record.operation.id !== candidate.operationId ||
			proof.record.operation.kind !== COORDINATOR_OPERATION_KIND ||
			proof.record.operation.rpc !== COORDINATOR_RPC ||
			proof.record.provenance.threadId !== candidate.threadId ||
			proof.record.provenance.instructionHash !== reviewed.instructionHash ||
			proof.record.provenance.manifestHash !== reviewed.catalogueHash
		) {
			return {
				kind: "inspect",
				threadId: candidate.threadId,
				operationId: candidate.operationId,
				reason: "The current epoch proof does not identify the retained coordinator operation.",
			};
		}
	} catch (error) {
		return {
			kind: "inspect",
			threadId: candidate.threadId,
			operationId: candidate.operationId,
			reason: `The retained coordinator cannot be proved current: ${errorMessage(error)}`,
		};
	}
	try {
		const classification = await options.threadLink.classify({
			threadId: candidate.threadId,
			childId: candidate.childId,
			epoch: candidate.epoch,
			operationId: candidate.operationId,
			provenance: candidateRecord,
		});
		if (
			classification.link.state === "executable" &&
			classification.link.source === CODEX_SESSION_THREAD_SOURCE &&
			classification.link.threadId === candidate.threadId &&
			classification.link.childId === candidate.childId &&
			classification.link.epoch === candidate.epoch &&
			classification.link.loaded &&
			classification.link.canAcceptDirectInput &&
			classification.proof !== null
		) {
			return { kind: "reuse", persistence: candidate };
		}
		return {
			kind: "replace",
			threadId: candidate.threadId,
			reason:
				classification.link.state === "inspect_only"
					? `The retained coordinator is inspect-only (${classification.link.reason}).`
					: "The retained coordinator is not controllable in the current epoch.",
		};
	} catch (error) {
		return {
			kind: "inspect",
			threadId: candidate.threadId,
			operationId: candidate.operationId,
			reason: `The retained coordinator could not be classified: ${errorMessage(error)}`,
		};
	}
}

function coordinatorRecords(
	snapshot: CoordinatorEpochSnapshot,
	childId: ChildId,
	epoch: ChildEpoch,
): readonly CoordinatorEpochRecord[] {
	return snapshot.manifest.records.filter(
		(record) =>
			record.correlation.childId === childId &&
			record.correlation.epoch === epoch &&
			record.operation.kind === COORDINATOR_OPERATION_KIND &&
			record.operation.rpc === COORDINATOR_RPC,
	);
}

function persistenceMismatch(
	persistence: CoordinatorPersistedState,
	record: CoordinatorEpochRecord,
	configured: CoordinatorConfiguredSettings,
	reviewed: CoordinatorReviewHashes,
	options: CodexCoordinatorOptions,
): string | null {
	if (persistence.settings.configured.model !== configured.model)
		return "The retained coordinator model does not match the reviewed model.";
	if (persistence.settings.configured.effort !== configured.effort)
		return "The retained coordinator effort does not match the reviewed effort.";
	if (persistence.settings.configured.serviceTier !== configured.serviceTier)
		return "The retained coordinator service-tier choice is no longer advertised.";
	if (persistence.review.instructionHash !== reviewed.instructionHash)
		return "The retained coordinator instruction hash drifted.";
	if (persistence.review.catalogueHash !== reviewed.catalogueHash)
		return "The retained coordinator catalogue hash drifted.";
	if (
		persistence.review.workhorseCatalogueHash !== reviewed.workhorseCatalogueHash ||
		persistence.review.voiceCatalogueHash !== reviewed.voiceCatalogueHash
	)
		return "The retained coordinator tool-manifest hash drifted.";
	if (persistence.review.settingsHash !== hashCoordinatorSettings(persistence.settings))
		return "The retained coordinator settings hash is not self-consistent.";
	if (
		persistence.settings.effective.model !== COORDINATOR_MODEL ||
		persistence.settings.effective.effort !== "medium" ||
		(configured.serviceTier === "priority" &&
			persistence.settings.effective.serviceTier !== "priority")
	)
		return "The retained coordinator effective settings do not match the reviewed selection.";
	if (
		record.operation.id !== persistence.operationId ||
		record.operation.kind !== COORDINATOR_OPERATION_KIND ||
		record.operation.rpc !== COORDINATOR_RPC ||
		record.correlation.childId !== persistence.childId ||
		record.correlation.epoch !== persistence.epoch ||
		record.provenance.childId !== persistence.childId ||
		record.provenance.epoch !== persistence.epoch ||
		record.provenance.threadId !== persistence.threadId ||
		record.provenance.threadSource !== CODEX_SESSION_THREAD_SOURCE ||
		record.provenance.confirmedAtMs === null ||
		record.provenance.workspaceRoot !== options.checkoutRoot ||
		record.provenance.instructionHash !== reviewed.instructionHash ||
		record.provenance.manifestHash !== reviewed.catalogueHash
	)
		return "The retained coordinator lacks matching durable ownership evidence.";
	return null;
}

function inspectDecision(
	candidate: CoordinatorPersistedState | null,
	reason: string,
): CandidateDecision {
	return {
		kind: "inspect",
		threadId: candidate?.threadId ?? null,
		operationId: candidate?.operationId ?? null,
		reason,
	};
}
