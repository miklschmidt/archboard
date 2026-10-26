import { isDeepStrictEqual } from "node:util";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { decodeModel } from "#runtime/operations/read/model-read.ts";
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
	ArchiveError,
} from "#runtime/store/model-archive.ts";
import { operationRef, checkoutContext, type ModelJournal } from "#runtime/store/model-state.ts";

/**
 * Capture exactly the complete revision that the caller read.
 * @param vault The explicitly addressed vault.
 * @param revision The revision value.
 * @returns The operation result.
 */
function captureRevision(vault: string, revision: ArchitectureModuleEdit["expectedRevision"]) {
	const captured = readModelFiles(vault);
	if (captured.diagnostics.length > 0 || !isDeepStrictEqual(captured.revision, revision))
		throw new ArchiveError("STALE_REVISION", "Inputs changed before candidate preparation.");
	return captured;
}

/**
 * Capture one complete candidate, preserving every unrelated authored byte.
 * @param vault The explicitly addressed vault.
 * @param request The original operation intent.
 * @returns The complete checked candidate or a structured refusal.
 */
function editCandidate(vault: string, request: ArchitectureModuleEdit) {
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
	const captured = captureRevision(vault, current.revision);
	const before = captured.inputs.get(subject.file)!;
	const after = Buffer.from(
		`${JSON.stringify({ ...JSON.parse(before.toString("utf8")), description: request.description }, null, 2)}\n`,
	);
	const inputs = new Map(captured.inputs);
	inputs.set(subject.file, after);
	const revision = modelRevision(inputs);
	const checked = decodeModel({ inputs, revision, diagnostics: [] });
	if (!checked.success) return checked;
	return {
		success: true as const,
		current,
		inputs,
		revision,
		file: {
			path: subject.file,
			before: before.toString("base64"),
			after: after.toString("base64"),
		},
	};
}
/**
 * Recheck the caller's complete token after the asynchronous signer finishes.
 * @param vault The explicitly addressed vault.
 * @param request The original operation intent.
 * @returns The still-current reading or a structured refusal.
 */
function requireUnchanged(vault: string, request: ArchitectureModuleEdit) {
	requireSubjectClaim(vault, request);
	const current = requireTarget(vault, request.target);
	if (!current.success) return current;
	if (!isDeepStrictEqual(current.revision, request.expectedRevision))
		throw new ArchiveError(
			"STALE_REVISION",
			"Inputs changed during signed preparation. No current file changed.",
		);
	return current;
}
/**
 * Prepare signed architecture before any current input changes.
 * @param vault The explicitly addressed vault.
 * @param request The original operation intent.
 * @returns The signed preparation journal or a structured refusal.
 */
async function prepareEdit(vault: string, request: ArchitectureModuleEdit) {
	const candidate = editCandidate(vault, request);
	if (!candidate.success) return candidate;
	const context = await archiveContext(vault);
	const checkout = await checkoutContext(context);
	await assertArchiveWritable(context);
	const tip = await archiveTip(context);
	const record = CheckpointRecordSchema.parse({
		schemaVersion: 1,
		kind: "checkpoint",
		vault: context.vault,
		model: candidate.current.manifest.id,
		state: candidate.current.manifest.current,
		revision: candidate.revision,
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
	const inputs = new Map([...candidate.inputs].map(([file, bytes]) => [`inputs/${file}`, bytes]));
	inputs.set("record.json", Buffer.from(JSON.stringify(record)));
	const checkpoint = await archiveCommit(
		context,
		await tree(context, inputs),
		tip === undefined ? [] : [tip],
		"archboard: edit module description",
	);
	const latest = requireUnchanged(vault, request);
	if (!latest.success) return latest;
	const journal: ModelJournal = {
		schemaVersion: 1,
		context: checkout,
		request,
		before: request.expectedRevision,
		after: candidate.revision,
		checkpoint,
		ref: operationRef(vault, request.operationId, "transactions"),
		phase: "prepared",
		files: [candidate.file],
	};
	return journal;
}
export { prepareEdit };
