import type { Response } from "express";
import {
	parseModelRequest,
	type ArchitectureModelRead,
	type ModelRequest,
	type RequestOperation,
} from "@archboard/model-contract";
const failureStatuses: Partial<
	Record<Extract<ArchitectureModelRead, { success: false }>["code"], number>
> = {
	MAPPING_REQUIRED: 409,
	MAPPING_STALE: 409,
	MAPPING_UNRESOLVED: 409,
	STATE_NOT_FOUND: 404,
	SOURCE_REF_NOT_FOUND: 404,
	WALKTHROUGH_NOT_FOUND: 404,
	WALKTHROUGH_AMBIGUOUS: 409,
	STATE_AMBIGUOUS: 409,
	PREDECESSOR_CHANGED: 409,
	PROPOSAL_BLOCKED: 409,
	PROPOSAL_SUPERSEDED: 409,
	COMPARISON_REQUIRED: 409,
	SOURCE_EVIDENCE_UNAVAILABLE: 409,
	MODEL_NOT_FOUND: 404,
	REFERENCE_UNAVAILABLE: 404,
	MODULE_NOT_FOUND: 404,
	FLOW_NOT_FOUND: 404,
	FLOW_REQUIRED: 400,
	FLOW_AMBIGUOUS: 409,
	FLOW_SUMMARY_REQUIRED: 422,
	RELATIONSHIP_NOT_FOUND: 404,
	ARCHITECTURE_UNAVAILABLE: 404,
	MODULE_AMBIGUOUS: 409,
	LEGACY_AUTHORITY: 409,
	STALE_REVISION: 409,
	OPERATION_REUSED: 409,
	ARCHIVE_NOT_INITIALIZED: 409,
	ARCHIVE_IN_USE: 409,
	ARCHIVE_BUSY: 409,
	PUBLICATION_NOT_CONFIGURED: 409,
	PUBLICATION_DESTINATION_CHANGED: 409,
	ARCHIVE_NETWORK_FAILED: 502,
	MODEL_BUSY: 409,
	TARGET_CHANGED: 409,
	CLAIM_REQUIRED: 409,
	CLAIM_HELD: 409,
	CLAIM_REVOKED: 409,
	RECOVERY_REQUIRED: 409,
	RECOVERY_CONTEXT_CHANGED: 409,
	RECOVERY_CONFLICT: 409,
};

/**
 * The status a refused model read or write answers with.
 * @param refusal The refusal.
 * @returns The HTTP status.
 */
function refusalStatus(refusal: Extract<ArchitectureModelRead, { success: false }>): number {
	return failureStatuses[refusal.code] ?? 422;
}

/**
 * Keep runtime results intact at the HTTP boundary.
 * @param res The outgoing HTTP response.
 * @param result The shared architecture outcome.
 */
function respond(
	res: Response,
	result: { success: true } | Extract<ArchitectureModelRead, { success: false }>,
): void {
	res
		.set("Cache-Control", "no-store")
		.status(result.success ? 200 : refusalStatus(result))
		.json(result);
}

/**
 * Read a request body or query as the request of one operation. A request that is
 * not one is refused here with the contract's 400 body.
 * @param res The outgoing HTTP response.
 * @param operation The operation asked for.
 * @param body The body or query as received.
 * @returns The intent, or undefined once the refusal has been sent.
 */
function requestOf<O extends RequestOperation>(
	res: Response,
	operation: O,
	body: unknown,
): ModelRequest<O> | undefined {
	const parsed = parseModelRequest(operation, body);
	if (parsed.success) return parsed.data;
	res.status(400).json(parsed.refusal);
	return undefined;
}

export { refusalStatus, requestOf, respond };
