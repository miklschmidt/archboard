import { isDeepStrictEqual } from "node:util";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { editCandidate } from "#runtime/operations/model-edit/candidate.ts";
import { requireSubjectClaim, requireTarget } from "#runtime/operations/model-edit/claims.ts";
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
import { captureReferencePins } from "#runtime/operations/history/reference-pins.ts";

/**
 * Recheck the caller's complete token after the asynchronous signer finishes.
 * @param vault The explicitly addressed vault.
 * @param request The original operation intent.
 * @param subjects The complete affected claim scope.
 * @returns The still-current reading or a structured refusal.
 */
function requireUnchanged(vault: string, request: ArchitectureModuleEdit, subjects: string[]) {
	requireSubjectClaim(vault, request, subjects);
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
		subjects: candidate.subjects,
		sources: await captureSource(context, candidate.model, vault),
		...(await captureReferencePins(vault, candidate.model)),
	});
	const inputs = new Map([...candidate.inputs].map(([file, bytes]) => [`inputs/${file}`, bytes]));
	inputs.set("record.json", Buffer.from(JSON.stringify(record)));
	const checkpoint = await archiveCommit(
		context,
		await tree(context, inputs),
		tip === undefined ? [] : [tip],
		"archboard: edit canonical architecture",
	);
	const latest = requireUnchanged(vault, request, candidate.scopes);
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
		files: candidate.files,
		subjects: candidate.subjects,
	};
	return journal;
}
export { prepareEdit };
