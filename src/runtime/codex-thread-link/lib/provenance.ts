import type { EpochOperationRecord } from "../../codex-epoch/index.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Accept only the durable fields needed to prove one thread operation. */
export function isEpochOperationRecord(value: unknown): value is EpochOperationRecord {
	if (!isRecord(value)) return false;
	const correlation = value.correlation;
	const operation = value.operation;
	const provenance = value.provenance;
	return (
		isRecord(correlation) &&
		typeof correlation.childId === "string" &&
		correlation.childId.length > 0 &&
		typeof correlation.epoch === "string" &&
		correlation.epoch.length > 0 &&
		typeof correlation.operationId === "string" &&
		correlation.operationId.length > 0 &&
		isRecord(operation) &&
		typeof operation.kind === "string" &&
		operation.kind.length > 0 &&
		(operation.rpc === null || typeof operation.rpc === "string") &&
		isRecord(provenance) &&
		typeof provenance.childId === "string" &&
		provenance.childId.length > 0 &&
		typeof provenance.epoch === "string" &&
		provenance.epoch.length > 0 &&
		(provenance.threadId === null || typeof provenance.threadId === "string") &&
		(value.status === "staged" ||
			value.status === "committed" ||
			value.status === "rolled_back" ||
			value.status === "inspect_only") &&
		(value.outcome === "pending" ||
			value.outcome === "delivered" ||
			value.outcome === "not_delivered" ||
			value.outcome === "outcome_unknown")
	);
}
