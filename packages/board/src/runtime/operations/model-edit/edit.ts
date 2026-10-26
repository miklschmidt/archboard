import { notifyArchitecture } from "#runtime/store/model-news.ts";
import { isDeepStrictEqual } from "node:util";
import {
	ArchitectureModuleEditSchema,
	type ArchitectureModuleEdit,
	type ArchitectureModuleEditResult,
	type ArchitectureRecoveryResult,
} from "#shared/schemas/model-operations.ts";
import { readCurrentModel, decodeModel } from "#runtime/operations/read/model-read.ts";
import { historyResult, checkpointMetadata } from "#runtime/operations/history/result.ts";
import { requireSubjectClaim, requireTarget } from "#runtime/operations/model-edit/claims.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import {
	archiveContext,
	assertArchiveWritable,
	archiveTip,
	archiveCommit,
	captureSource,
	CheckpointRecordSchema,
	tree,
	readRecord,
	isArchiveAncestor,
	ArchiveError,
} from "#runtime/store/model-archive.ts";
import {
	withModelLock,
	writeState,
	readState,
	operationKey,
	operationRef,
	checkoutContext,
	JournalSchema,
	type ModelJournal,
} from "#runtime/store/model-state.ts";
import { activeJournal, installJournal } from "#runtime/store/model-install.ts";

/** Preserve the exact original request for same-operation retries. */
function requireSameRequest(journal: ModelJournal, request: ArchitectureModuleEdit): void {
	if (!isDeepStrictEqual(journal.request, request))
		throw new ArchiveError(
			"OPERATION_REUSED",
			"This operation identity already names another request. Retry the original request or use a new identity.",
		);
}
/** Prepare the complete candidate and its signed checkpoint before installation. */
async function prepareEdit(
	vault: string,
	request: ArchitectureModuleEdit,
): Promise<ModelJournal | Extract<ArchitectureModuleEditResult, { success: false }>> {
	const current = requireTarget(vault, request.target);
	if (!current.success) return current;
	requireSubjectClaim(vault, request);
	if (!isDeepStrictEqual(current.revision, request.expectedRevision))
		throw new ArchiveError(
			"STALE_REVISION",
			"The complete read token changed. Read the model again before a new edit.",
		);
	const subject = current.modules.find((module) => module.id === request.subject);
	if (subject === undefined)
		throw new ArchiveError(
			"MODULE_NOT_FOUND",
			"Use an existing qualified module identity.",
			request.subject,
		);
	const captured = readModelFiles(vault);
	if (captured.diagnostics.length > 0 || !isDeepStrictEqual(captured.revision, current.revision))
		throw new ArchiveError("STALE_REVISION", "Inputs changed before candidate preparation.");
	const before = captured.inputs.get(subject.file)!;
	const after = Buffer.from(
		`${JSON.stringify({ ...JSON.parse(before.toString("utf8")), description: request.description }, null, 2)}\n`,
	);
	const candidate = new Map(captured.inputs);
	candidate.set(subject.file, after);
	const revision = modelRevision(candidate);
	const checked = decodeModel({ inputs: candidate, revision, diagnostics: [] });
	if (!checked.success) return checked;
	const context = await archiveContext(vault);
	const checkout = await checkoutContext(context);
	await assertArchiveWritable(context);
	const tip = await archiveTip(context);
	const record = CheckpointRecordSchema.parse({
		schemaVersion: 1,
		kind: "checkpoint",
		vault: context.vault,
		model: current.manifest.id,
		state: current.manifest.current,
		revision,
		createdAt: new Date().toISOString(),
		request: {
			target: "current",
			operationId: request.operationId,
			writer: request.writer,
			doing: request.doing,
			expectedRevision: request.expectedRevision.digest,
			dependencies: [],
		},
		edit: request,
		sources: await captureSource(context),
	});
	const inputs = new Map([...candidate].map(([file, bytes]) => [`inputs/${file}`, bytes]));
	inputs.set("record.json", Buffer.from(JSON.stringify(record)));
	const checkpoint = await archiveCommit(
		context,
		await tree(context, inputs),
		tip === undefined ? [] : [tip],
		"archboard: edit module description",
	);
	requireSubjectClaim(vault, request);
	const latest = readCurrentModel(vault);
	if (!latest.success) return latest;
	if (!isDeepStrictEqual(latest.revision, current.revision))
		throw new ArchiveError(
			"STALE_REVISION",
			"Inputs changed during signed preparation. No current file changed.",
		);
	const ref = operationRef(vault, request.operationId, "transactions");
	return {
		schemaVersion: 1,
		context: checkout,
		request,
		before: captured.revision,
		after: revision,
		checkpoint,
		ref,
		phase: "prepared",
		files: [
			{ path: subject.file, before: before.toString("base64"), after: after.toString("base64") },
		],
		result: {
			success: true,
			applied: true,
			reconciliation: false,
			operationId: request.operationId,
			target: request.target,
			subjects: [request.subject],
			before: captured.revision,
			after: revision,
			checkpoint: checkpointMetadata(checkpoint, record),
			cleanup: "complete",
		},
	};
}
/** Apply one claimed description change or resume its durable journal. */
async function editArchitectureModule(
	vault: string,
	input: ArchitectureModuleEdit,
): Promise<ArchitectureModuleEditResult> {
	const request = ArchitectureModuleEditSchema.parse(input);
	const result = await historyResult("MODEL_WRITE_FAILED", () =>
		withModelLock(vault, async (guard) => {
			const pending = activeJournal(vault);
			if (pending !== undefined) {
				if (pending.request.operationId !== request.operationId)
					throw new ArchiveError(
						"RECOVERY_REQUIRED",
						"Finish the pending operation before starting another intent.",
					);
				requireSameRequest(pending, request);
				return historyResult("RECOVERY_REQUIRED", () =>
					installJournalFromVault(vault, pending, guard),
				);
			}
			const completed = readState(
				vault,
				`outcome-${operationKey(request.operationId)}.json`,
				JournalSchema,
			);
			if (completed !== undefined) {
				requireSameRequest(completed, request);
				return completed.result;
			}
			const context = await archiveContext(vault);
			const retained = await archiveTip(context, operationRef(vault, request.operationId));
			if (retained !== undefined) {
				const record = await readRecord(context, retained);
				if (record.kind !== "checkpoint" || !isDeepStrictEqual(record.edit, request))
					throw new ArchiveError(
						"OPERATION_REUSED",
						"This operation identity names another retained request.",
					);
				const tip = await archiveTip(context);
				if (tip === undefined || !(await isArchiveAncestor(context, retained, tip)))
					throw new ArchiveError(
						"RECOVERY_REQUIRED",
						"The operation checkpoint lacks durable archive completion. Restore its private journal before recovery.",
					);
				return {
					success: true as const,
					applied: true as const,
					reconciliation: false as const,
					operationId: request.operationId,
					target: request.target,
					subjects: [request.subject],
					before: request.expectedRevision,
					after: record.revision,
					checkpoint: checkpointMetadata(retained, record),
					cleanup: "complete" as const,
				};
			}
			const prepared = await prepareEdit(vault, request);
			if ("success" in prepared) return prepared;
			guard();
			writeState(vault, "transaction.json", prepared);
			return historyResult("RECOVERY_REQUIRED", () =>
				installJournalFromVault(vault, prepared, guard),
			);
		}),
	);
	if (result.success) notifyArchitecture(vault, result);
	return result;
}
/** Resolve the archive only for a transaction that actually requires it. */
async function installJournalFromVault(vault: string, journal: ModelJournal, guard: () => void) {
	return installJournal(await archiveContext(vault), vault, journal, guard);
}
/** Resume the recorded operation without inventing a new edit or lifecycle event. */
async function recoverArchitectureModel(vault: string): Promise<ArchitectureRecoveryResult> {
	const result = await historyResult("RECOVERY_REQUIRED", () =>
		withModelLock(vault, async (guard) => {
			const journal = activeJournal(vault);
			if (journal === undefined) return { success: true as const };
			return {
				success: true as const,
				operation: await installJournalFromVault(vault, journal, guard),
			};
		}),
	);
	if (result.success) notifyArchitecture(vault, result.operation);
	return result;
}
export { editArchitectureModule, recoverArchitectureModel };
