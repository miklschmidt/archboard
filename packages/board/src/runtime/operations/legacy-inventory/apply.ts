import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import { ArchitectureMigrationRequestSchema } from "#shared/schemas/migration-installation.ts";
import { prepareCutover } from "#runtime/operations/legacy-inventory/prepare-cutover.ts";
import {
	archiveContext,
	archiveTip,
	readRecord,
	ArchiveError,
} from "#runtime/store/model-archive.ts";
import {
	withModelLock,
	operationRef,
	writeState,
	modelWriteFailure,
	type ModelJournal,
} from "#runtime/store/model-state.ts";
import { activeJournal } from "#runtime/store/model-install.ts";
import { resumeEdit } from "#runtime/operations/model-edit/edit.ts";
import { historyResult, editResult } from "#runtime/operations/history/result.ts";
import { notifyArchitecture, type Completion } from "#runtime/store/model-news.ts";
type Request = z.infer<typeof ArchitectureMigrationRequestSchema>;
/**
 * Refuse any different intent under an accepted operation identity.
 * @param original The retained installation intent.
 * @param request The explicit owner request.
 */
function requireIntent(original: ModelJournal["request"] | undefined, request: Request): void {
	if (original === undefined || !("type" in original) || original.type !== "migrate")
		throw new ArchiveError("OPERATION_REUSED", "This operation identity names another intent.");
	if (!isDeepStrictEqual(ArchitectureMigrationRequestSchema.strip().parse(original), request))
		throw new ArchiveError(
			"OPERATION_REUSED",
			"This operation identity names another intent. Retry its original request.",
		);
}
/**
 * Read accepted completion without consulting live files or taking a lease.
 * @param vault The addressed vault.
 * @param request The original request.
 * @returns Its existing receipt, or absence for a new operation.
 */
async function recordedMigration(vault: string, request: Request) {
	const context = await archiveContext(vault),
		id = await archiveTip(context, operationRef(vault, request.operationId));
	if (id === undefined) return undefined;
	const record = await readRecord(context, id);
	if (record.kind !== "checkpoint")
		throw new ArchiveError("OPERATION_REUSED", "This operation names another archive record.");
	requireIntent(record.installation, request);
	return editResult(id, record);
}
/**
 * Admit migration or recovery under the existing installation lease.
 * @param vault The addressed vault.
 * @param request The complete owner intent.
 * @param guard The lease assertion.
 * @returns Its durable receipt.
 */
async function applyMigration(vault: string, request: Request, guard: () => void) {
	const pending = activeJournal(vault);
	if (pending !== undefined) {
		if (pending.request.operationId !== request.operationId)
			throw new ArchiveError(
				"RECOVERY_REQUIRED",
				"Recover the pending operation before another migration.",
			);
		requireIntent(pending.request, request);
		return resumeEdit(vault, pending, guard);
	}
	const completed = await recordedMigration(vault, request);
	if (completed !== undefined) return completed;
	const journal = await prepareCutover(vault, await archiveContext(vault), request);
	guard();
	writeState(vault, "transaction.json", journal);
	return resumeEdit(vault, journal, guard);
}
/**
 * Preserve durable success while a concurrent cleaner owns the lease.
 * @param vault The addressed vault.
 * @param request The original request.
 * @param completed Its known durable receipt, when available.
 * @returns Its receipt and cleanup status.
 */
async function serializedMigration(vault: string, request: Request, completed?: Completion) {
	try {
		return await withModelLock(vault, (guard) => applyMigration(vault, request, guard));
	} catch (error) {
		if (completed !== undefined && error instanceof ArchiveError && error.code === "MODEL_BUSY")
			return { ...completed, cleanup: "pending" as const };
		throw error;
	}
}
/**
 * Install exactly the complete preview that the owner authorized.
 * @param vault The addressed vault.
 * @param input Complete fingerprints and explicit owner authorization.
 * @returns The durable receipt or structured recovery refusal.
 */
async function migrateArchitectureModel(
	vault: string,
	input: z.input<typeof ArchitectureMigrationRequestSchema>,
) {
	const request = ArchitectureMigrationRequestSchema.parse(input),
		notification = { emit: true };
	const result = await historyResult("MODEL_WRITE_FAILED", async () => {
		const completed = await recordedMigration(vault, request);
		if (completed === undefined) return serializedMigration(vault, request);
		const pending = activeJournal(vault);
		notification.emit = pending !== undefined && pending.phase !== "completed";
		if (pending?.request.operationId !== request.operationId) return completed;
		return serializedMigration(
			vault,
			request,
			pending.phase === "completed" ? completed : undefined,
		);
	});
	if (!result.success) return modelWriteFailure(vault, result, request.operationId);
	if (notification.emit) notifyArchitecture(vault, result);
	return result;
}
export { migrateArchitectureModel };
