import type { ArchitectureModuleEditResult } from "#shared/schemas/model-operations.ts";
import { errorMessage } from "@archboard/diagnostics/errno";
import type { ArchitectureModelRead, ArchitectureCheckpoint } from "#shared/schemas/model.ts";
import { failure } from "#runtime/operations/read/model-read.ts";
import { ArchiveError, ARCHIVE_REF, CheckpointRecordSchema } from "#runtime/store/model-archive.ts";

type Failure = Extract<ArchitectureModelRead, { success: false }>;
const recovery: Partial<Record<Failure["code"], string>> = {
	MODEL_BUSY: "Retry after the short installation lease releases.",
	TARGET_CHANGED: "Read the intended model and current state again before preparing a new intent.",
	CLAIM_REQUIRED: "Claim every affected module identity before editing it.",
	CLAIM_HELD: "Wait for the owner to release the scope, or ask the reader to take the claim back.",
	CLAIM_REVOKED:
		"Stop the former intent. Obtain a new explicit claim before preparing another edit.",
	RECOVERY_REQUIRED:
		"Run model recover in the original checkout. Preserve its private journal and all foreign inputs.",
	RECOVERY_CONTEXT_CHANGED:
		"Restore the original checkout branch and HEAD, then retry model recover.",
	RECOVERY_CONFLICT:
		"Preserve foreign bytes and the private journal. Restore a logged input image before retrying model recover.",
	MODEL_WRITE_FAILED:
		"Restore local write access, read the model again, and retry the original intent if it remains current.",
	ARCHIVE_COMMIT_FAILED:
		"Repair the configured Git identity and signing key or signer. Retry the same retention operation without disabling signing.",
	ARCHIVE_IN_USE: "Switch the worktree away from archboard-history before retrying retention.",
	ARCHIVE_BUSY: "Retry the same retention operation. Its checkpoint remains retained locally.",
	ARCHIVE_WRITE_FAILED: "Restore local Git write access and retry the same retention operation.",
	ARCHIVE_NOT_INITIALIZED:
		"Use a canonical vault in a source Git repository. Private archive initialization is not available yet.",
	STALE_REVISION:
		"Read the current model again and retain its new revision with a new operation identity.",
	OPERATION_REUSED:
		"Reuse the original request or choose a new operation identity for the new intent.",
	CHECKPOINT_REQUIRED: "Select a model with a current architectural state before retaining it.",
	CHECKPOINT_INVALID:
		"List local checkpoints and use a complete checkpoint identity for this vault.",
};

/**
 * Return archive failures through the common architecture contract.
 * @param code The public failure category.
 * @param error The underlying failure.
 * @param checkpoint The affected object or ref.
 * @param subjects The affected architecture identities.
 * @returns Structured diagnostics with an actionable recovery instruction.
 */
function archiveFailure(
	code: Failure["code"],
	error: unknown,
	checkpoint = ARCHIVE_REF,
	subjects: string[] = [],
): Failure {
	return {
		...failure(code, [
			{
				code,
				file: checkpoint,
				...(subjects.length === 0 ? {} : { subjects }),
				message: errorMessage(error),
				recovery:
					recovery[code] ??
					"Restore the local archive or explicitly fetch the named archboard-history branch from its owner, then retry the exact checkpoint.",
			},
		]),
		error: "The architecture operation cannot complete.",
	};
}

/**
 * Keep transport adapters out of archive exception handling.
 * @param fallback The failure category for an unexpected I/O refusal.
 * @param work The runtime operation.
 * @param checkpoint The affected object for an unexpected failure.
 * @returns The complete outcome or a structured refusal.
 */
async function historyResult<T>(
	fallback: Failure["code"],
	work: () => Promise<T>,
	checkpoint = ARCHIVE_REF,
): Promise<T | Failure> {
	try {
		return await work();
	} catch (error) {
		return error instanceof ArchiveError
			? archiveFailure(error.code, error, error.checkpoint, error.subjects)
			: archiveFailure(fallback, error, checkpoint);
	}
}

/**
 * Present one retained record without private archive fields.
 * @param id The immutable checkpoint identity.
 * @param record The retained checkpoint record.
 * @returns Public checkpoint metadata.
 */
function checkpointMetadata(
	id: string,
	record: ReturnType<typeof CheckpointRecordSchema.parse>,
): ArchitectureCheckpoint {
	const { schemaVersion: _version, kind: _kind, vault: _vault, edit: _edit, ...metadata } = record;
	return { ...metadata, id, publication: "saved-locally" };
}

/**
 * Derive the durable result from its signed operation record.
 * @param id The retained checkpoint or claim identity.
 * @param record The record value.
 * @returns The result retained by the signed operation.
 */
function editResult(
	id: string,
	record: ReturnType<typeof CheckpointRecordSchema.parse>,
): Extract<ArchitectureModuleEditResult, { success: true }> {
	const request = record.edit;
	if (request === undefined)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"This checkpoint does not retain a description edit.",
			id,
		);
	return {
		success: true,
		applied: true,
		reconciliation: false,
		operationId: request.operationId,
		target: request.target,
		subjects: [request.subject],
		before: request.expectedRevision,
		after: record.revision,
		checkpoint: checkpointMetadata(id, record),
		cleanup: "complete",
	};
}

export { archiveFailure, historyResult, checkpointMetadata, editResult };
