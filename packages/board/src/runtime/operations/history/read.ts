import {
	GitObjectIdSchema,
	type ArchitectureModelRead,
	type ArchitectureCheckpointList,
} from "#shared/schemas/model.ts";
import {
	discoveryFailure,
	decodeModel,
	selectModule,
} from "#runtime/operations/read/model-read.ts";
import {
	ArchiveError,
	CheckpointRecordSchema,
	archiveContext,
	readCheckpointInputs,
	archiveRecords,
	readRecord,
	sourceEvidence,
	isArchiveAncestor,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";
import {
	archiveFailure,
	historyResult,
	checkpointMetadata,
} from "#runtime/operations/history/result.ts";
import { checkpointPublication } from "#runtime/store/model-publication.ts";

/**
 * Require an architectural checkpoint for the addressed vault.
 * @param context The caller's checkout.
 * @param checkpoint The immutable checkpoint identity.
 * @returns The checkpoint record, never a synchronization record.
 */
async function checkpointRecord(context: ArchiveContext, checkpoint: string) {
	const record = await readRecord(context, checkpoint);
	if (record.kind !== "checkpoint" || record.vault !== context.vault)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"This object is not an architectural checkpoint for this vault.",
			checkpoint,
		);
	return record;
}

/**
 * Resolve and prove one required retained parent.
 * @param context The caller's checkout.
 * @param dependency The required immutable checkpoint.
 * @param checkpoint The child that must retain it.
 * @returns The retained dependency record.
 */
async function retainedDependency(context: ArchiveContext, dependency: string, checkpoint: string) {
	try {
		const required = await checkpointRecord(context, dependency);
		if (!(await isArchiveAncestor(context, dependency, checkpoint)))
			throw new ArchiveError(
				"CHECKPOINT_INVALID",
				"A required checkpoint is not retained through archive ancestry.",
				dependency,
			);
		return required;
	} catch (error) {
		if (error instanceof ArchiveError) throw error;
		throw new ArchiveError(
			"ARCHITECTURE_UNAVAILABLE",
			error instanceof Error ? error.message : String(error),
			dependency,
		);
	}
}

/**
 * Require every dependency to remain available through actual Git ancestry.
 * @param context The caller's checkout.
 * @param checkpoint The retained child checkpoint.
 * @param record Its required dependency metadata.
 * @param visited The dependency identities already inspected by this read.
 */
async function requireDependencies(
	context: ArchiveContext,
	checkpoint: string,
	record: ReturnType<typeof CheckpointRecordSchema.parse>,
	visited: Set<string>,
): Promise<void> {
	visited.add(checkpoint);
	for (const dependency of record.request.dependencies) {
		if (visited.has(dependency)) continue;
		// oxlint-disable-next-line no-await-in-loop -- dependency traversal shares one visited closure
		const required = await retainedDependency(context, dependency, checkpoint);
		// oxlint-disable-next-line no-await-in-loop -- shared ancestors must finish before the next dependency
		await requireDependencies(context, dependency, required, visited);
	}
}

/**
 * Decode one exact architecture independently of current content.
 * @param context The caller's checkout.
 * @param checkpoint The immutable checkpoint identity.
 * @param module The optional module selector.
 * @returns A coherent retained reading or model validation diagnostics.
 */
async function exactReading(
	context: ArchiveContext,
	checkpoint: string,
	module?: string,
): Promise<ArchitectureModelRead> {
	const record = await checkpointRecord(context, checkpoint);
	await requireDependencies(context, checkpoint, record, new Set());
	const captured = await readCheckpointInputs(context, checkpoint);
	if (captured.revision.digest !== record.revision.digest)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"Retained input fingerprints disagree with the checkpoint.",
			checkpoint,
		);
	const refused = discoveryFailure(captured);
	if (refused !== undefined) return refused;
	const model = decodeModel(captured);
	if (!model.success) return model;
	return selectModule(
		{
			...model,
			checkpoint: checkpointMetadata(
				checkpoint,
				record,
				(await checkpointPublication(context, checkpoint)).publication,
			),
			sourceEvidence: await sourceEvidence(context, record.sources),
		},
		module,
	);
}

/**
 * Open one exact checkpoint, regardless of current content or archive append order.
 * @param vault The explicitly addressed vault.
 * @param checkpoint A complete immutable Git commit identity.
 * @param module A qualified module identity or unique retained name.
 * @returns One retained architecture or actionable diagnostics.
 */
async function readArchitectureCheckpoint(
	vault: string,
	checkpoint: string,
	module?: string,
): Promise<ArchitectureModelRead> {
	if (!GitObjectIdSchema.safeParse(checkpoint).success)
		return archiveFailure(
			"CHECKPOINT_INVALID",
			new Error("Use a complete immutable checkpoint identity."),
			checkpoint,
		);
	return historyResult(
		"ARCHITECTURE_UNAVAILABLE",
		async () => exactReading(await archiveContext(vault), checkpoint, module),
		checkpoint,
	);
}

/**
 * List retained states without turning synchronization records into architecture.
 * @param vault The explicitly addressed vault.
 * @returns Retained metadata or actionable archive diagnostics.
 */
async function listArchitectureCheckpoints(vault: string): Promise<ArchitectureCheckpointList> {
	return historyResult("ARCHIVE_UNREADABLE", async () => {
		const context = await archiveContext(vault);
		const records = await archiveRecords(context);
		return {
			success: true as const,
			checkpoints: await Promise.all(
				records.flatMap(({ id, record }) =>
					record.kind === "checkpoint" && record.vault === context.vault
						? [
								checkpointPublication(context, id).then(({ publication }) =>
									checkpointMetadata(id, record, publication),
								),
							]
						: [],
				),
			),
		};
	});
}

export { readArchitectureCheckpoint, listArchitectureCheckpoints };
