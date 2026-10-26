import { createHash } from "node:crypto";
import {
	ArchitectureCheckpointRequestSchema,
	type ArchitectureCheckpointRequest,
	type ArchitectureCheckpointRetain,
	type ArchitectureModel,
} from "#shared/schemas/model.ts";
import { readModelFiles } from "#runtime/store/model-files.ts";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";
import {
	ArchiveError,
	CheckpointRecordSchema,
	archiveContext,
	archiveTip,
	retainOperation,
	assertArchiveWritable,
	appendCheckpoint,
	archiveCommit,
	tree,
	readRecord,
	captureSource,
	settledValues,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";
import { readArchitectureCheckpoint } from "#runtime/operations/history/read.ts";
import { historyResult, checkpointMetadata } from "#runtime/operations/history/result.ts";
import { checkpointPublication } from "#runtime/store/model-publication.ts";
import { captureReferencePins } from "#runtime/operations/history/reference-pins.ts";

/**
 * Prepare an immutable checkpoint from exactly the revision the caller read.
 * @param context The caller's checkout.
 * @param vault The explicitly addressed vault.
 * @param current The coherent current reading.
 * @param request The retention intent and its dependency identities.
 * @returns The prepared commit identity, before any archive ref update.
 */
async function prepareCheckpoint(
	context: ArchiveContext,
	vault: string,
	current: ArchitectureModel,
	request: ArchitectureCheckpointRequest,
): Promise<string> {
	if (current.manifest.current === null)
		throw new ArchiveError(
			"CHECKPOINT_REQUIRED",
			"There is no current architectural state to retain.",
		);
	const captured = readModelFiles(vault);
	if (captured.diagnostics.length > 0 || captured.revision.digest !== request.expectedRevision)
		throw new ArchiveError("STALE_REVISION", "Inputs changed before retention.");
	const tip = await archiveTip(context);
	const record = CheckpointRecordSchema.parse({
		schemaVersion: 1,
		kind: "checkpoint",
		vault: context.vault,
		model: current.manifest.id,
		state: current.manifest.current,
		revision: captured.revision,
		createdAt: new Date().toISOString(),
		request,
		sources: await captureSource(context, current, vault),
		...(await captureReferencePins(vault, current)),
	});
	const inputs = new Map([...captured.inputs].map(([file, bytes]) => [`inputs/${file}`, bytes]));
	inputs.set("record.json", Buffer.from(JSON.stringify(record)));
	const rootTree = await tree(context, inputs);
	return archiveCommit(
		context,
		rootTree,
		[...new Set([...(tip === undefined ? [] : [tip]), ...request.dependencies])],
		"archboard: retain architecture checkpoint",
	);
}

/**
 * Finish a retained operation without reading mutable current inputs.
 * @param context The caller's checkout.
 * @param id The retained checkpoint identity.
 * @param request The original retention intent.
 * @returns The same saved checkpoint after a retry.
 */
async function resumeRetention(
	context: ArchiveContext,
	id: string,
	request: ArchitectureCheckpointRequest,
): Promise<ArchitectureCheckpointRetain> {
	const record = await readRecord(context, id);
	if (
		record.kind !== "checkpoint" ||
		record.edit !== undefined ||
		record.vault !== context.vault ||
		JSON.stringify(record.request) !== JSON.stringify(request)
	)
		throw new ArchiveError(
			"OPERATION_REUSED",
			"This operation identity already names a different retention request.",
			id,
		);
	await appendCheckpoint(context, id, await archiveTip(context));
	return {
		success: true,
		checkpoint: checkpointMetadata(
			id,
			record,
			(await checkpointPublication(context, id)).publication,
		),
	};
}

/**
 * Retain exact architecture without changing current files, index, HEAD or checkout.
 * @param vault The explicitly addressed vault.
 * @param input The current target, expected revision and writer intent.
 * @returns The locally retained checkpoint or actionable diagnostics.
 */
async function retainArchitectureCheckpoint(
	vault: string,
	input: ArchitectureCheckpointRequest,
): Promise<ArchitectureCheckpointRetain> {
	const request = ArchitectureCheckpointRequestSchema.parse(input);
	return historyResult("ARCHIVE_WRITE_FAILED", async () => {
		const context = await archiveContext(vault);
		const operationRef = `refs/archboard/retained/${createHash("sha256").update(`${context.vault}\0${request.operationId}`).digest("hex")}`;
		const existing = await archiveTip(context, operationRef);
		if (existing !== undefined) return resumeRetention(context, existing, request);
		await assertArchiveWritable(context);
		const current = readArchitectureModel(vault);
		if (!current.success) return current;
		if (current.revision.digest !== request.expectedRevision)
			throw new ArchiveError(
				"STALE_REVISION",
				"The current input revision differs from the requested revision.",
			);
		const required = await settledValues(
			request.dependencies.map((dependency) => readArchitectureCheckpoint(vault, dependency)),
		);
		const missing = required.find((result) => !result.success);
		if (missing !== undefined) return missing;
		const checkpoint = await prepareCheckpoint(context, vault, current, request);
		return resumeRetention(
			context,
			await retainOperation(context, operationRef, checkpoint),
			request,
		);
	});
}

export { retainArchitectureCheckpoint };
