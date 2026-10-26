import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import { readModelFiles } from "#runtime/store/model-files.ts";
/**
 * Refuse settlement before an issue exists.
 * @param _vault The addressed vault.
 * @param _request The complete settlement intent.
 * @param _current The selected proposal.
 * @param _captured The exact input capture.
 * @returns No candidate until a standing issue can be settled.
 */
async function settleCandidate(
	_vault: string,
	_request: ArchitectureModuleEdit,
	_current: ArchitectureModel,
	_captured: ReturnType<typeof readModelFiles>,
): Promise<never> {
	throw new ArchiveError("MODEL_INVALID", "Select a proposal with a standing issue.");
}
export { settleCandidate };
