import type { Response } from "express";
import type { ArchitectureModelRead } from "@archboard/board/model";
const failureStatuses: Partial<
	Record<Extract<ArchitectureModelRead, { success: false }>["code"], number>
> = {
	MODEL_NOT_FOUND: 404,
	MODULE_NOT_FOUND: 404,
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
		.status(result.success ? 200 : (failureStatuses[result.code] ?? 422))
		.json(result);
}

export { respond };
