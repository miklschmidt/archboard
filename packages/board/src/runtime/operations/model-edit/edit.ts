import { isDeepStrictEqual } from "node:util";
import { errorMessage } from "@archboard/diagnostics/errno";
import {
	ArchitectureModuleEditSchema,
	type ArchitectureModuleEdit,
	type ArchitectureModuleEditResult,
	type ArchitectureRecoveryResult,
} from "#shared/schemas/model-operations.ts";
import { historyResult, editResult } from "#runtime/operations/history/result.ts";
import { prepareEdit } from "#runtime/operations/model-edit/prepare.ts";
import {
	archiveContext,
	archiveTip,
	readRecord,
	ArchiveError,
} from "#runtime/store/model-archive.ts";
import {
	withModelLock,
	writeState,
	operationRef,
	type ModelJournal,
} from "#runtime/store/model-state.ts";
import { activeJournal, installJournal } from "#runtime/store/model-install.ts";
import { notifyArchitecture } from "#runtime/store/model-news.ts";

/**
 * Preserve the exact request for completed and interrupted operation retries.
 * @param original The signed original request.
 * @param request The original operation intent.
 */
function requireSameRequest(
	original: ArchitectureModuleEdit | undefined,
	request: ArchitectureModuleEdit,
): void {
	if (!isDeepStrictEqual(original, request))
		throw new ArchiveError(
			"OPERATION_REUSED",
			"This operation identity already names another request. Retry the original request or use a new identity.",
		);
}
/**
 * Read a completion record without opening mutable current inputs or taking the installation lease.
 * @param vault The explicitly addressed vault.
 * @param request The original operation intent.
 * @returns The immutable completed result, or absence.
 */
async function recordedEdit(vault: string, request: ArchitectureModuleEdit) {
	const context = await archiveContext(vault);
	const retained = await archiveTip(context, operationRef(vault, request.operationId));
	if (retained === undefined) return undefined;
	const record = await readRecord(context, retained);
	if (record.kind !== "checkpoint")
		throw new ArchiveError(
			"OPERATION_REUSED",
			"This operation identity names a different archive record.",
		);
	requireSameRequest(record.edit, request);
	return editResult(retained, record);
}
/**
 * Resume durable progress and expose every incomplete installation as recovery work.
 * @param vault The explicitly addressed vault.
 * @param journal The durable installation record.
 * @param guard The installation lease ownership assertion.
 * @returns The applied result with cleanup status.
 */
async function resumeEdit(vault: string, journal: ModelJournal, guard: () => void) {
	try {
		return await installJournal(await archiveContext(vault), vault, journal, guard);
	} catch (error) {
		if (
			error instanceof ArchiveError &&
			["RECOVERY_CONFLICT", "RECOVERY_CONTEXT_CHANGED"].includes(error.code)
		)
			throw new ArchiveError(error.code, error.message, error.checkpoint, [
				journal.request.subject,
			]);
		throw new ArchiveError("RECOVERY_REQUIRED", errorMessage(error), journal.checkpoint, [
			journal.request.subject,
		]);
	}
}
/**
 * Apply the narrow operation while the cross-process installation lease stands.
 * @param vault The explicitly addressed vault.
 * @param request The original operation intent.
 * @param guard The installation lease ownership assertion.
 * @returns The durable edit result or structured refusal.
 */
async function applyEdit(vault: string, request: ArchitectureModuleEdit, guard: () => void) {
	const pending = activeJournal(vault);
	if (pending !== undefined) {
		if (pending.request.operationId !== request.operationId)
			throw new ArchiveError(
				"RECOVERY_REQUIRED",
				"Finish the pending operation before starting another intent.",
			);
		requireSameRequest(pending.request, request);
		return resumeEdit(vault, pending, guard);
	}
	const completed = await recordedEdit(vault, request);
	if (completed !== undefined) return completed;
	const prepared = await prepareEdit(vault, request);
	if ("success" in prepared) return prepared;
	guard();
	writeState(vault, "transaction.json", prepared);
	return resumeEdit(vault, prepared, guard);
}
/**
 * Apply one explicit description intent, or return its immutable recorded outcome.
 * @param vault The explicitly addressed vault.
 * @param input The complete caller input.
 * @returns The recorded edit result or structured refusal.
 */
async function editArchitectureModule(
	vault: string,
	input: ArchitectureModuleEdit,
): Promise<ArchitectureModuleEditResult> {
	const request = ArchitectureModuleEditSchema.parse(input);
	const result = await historyResult("MODEL_WRITE_FAILED", async () => {
		const completed = await recordedEdit(vault, request);
		if (
			completed !== undefined &&
			activeJournal(vault)?.request.operationId !== request.operationId
		)
			return completed;
		return withModelLock(vault, (guard) => applyEdit(vault, request, guard));
	});
	if (result.success) {
		notifyArchitecture(vault, result);
		return result;
	}
	return {
		...result,
		diagnostics: result.diagnostics.map((diagnostic) => ({
			...diagnostic,
			subjects: diagnostic.subjects ?? [request.subject],
		})),
	};
}
/**
 * Resume the journal without creating another intent or lifecycle event.
 * @param vault The explicitly addressed vault.
 * @returns The recovered operation or structured refusal.
 */
async function recoverArchitectureModel(vault: string): Promise<ArchitectureRecoveryResult> {
	const result = await historyResult("RECOVERY_REQUIRED", () =>
		withModelLock(vault, async (guard) => {
			const journal = activeJournal(vault);
			if (journal === undefined) return { success: true as const };
			return { success: true as const, operation: await resumeEdit(vault, journal, guard) };
		}),
	);
	if (result.success) notifyArchitecture(vault, result.operation);
	return result;
}
export { editArchitectureModule, recoverArchitectureModel };
