import {
	GitObjectIdSchema,
	type ArchitectureModelRead,
	type ArchitectureCheckpointList,
} from "#shared/schemas/model.ts";
import {
	discoveryFailure,
	decodeModel,
	selectModule,
	selectFlow,
} from "#runtime/operations/read/model-read.ts";
import {
	ArchiveError,
	CheckpointRecordSchema,
	archiveContext,
	archiveTip,
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
import {
	checkpointPublication,
	retainedPublicationTips,
} from "#runtime/store/model-publication.ts";
import { resolveModelReferences } from "#runtime/operations/read/model-references.ts";

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
	for (const dependency of [
		...record.request.dependencies,
		...(record.narrativeDependencies ?? []),
	]) {
		if (visited.has(dependency)) continue;
		// oxlint-disable-next-line no-await-in-loop -- dependency traversal shares one visited closure
		const required = await retainedDependency(context, dependency, checkpoint);
		// oxlint-disable-next-line no-await-in-loop -- shared ancestors must finish before the next dependency
		await requireDependencies(context, dependency, required, visited);
	}
}

/**
 * Read retained metadata without designating a historical snapshot current.
 * @param record The immutable checkpoint metadata.
 * @returns Explicit retained selection metadata.
 */
function retainedSelection(record: Awaited<ReturnType<typeof checkpointRecord>>) {
	if (record.selection === undefined) return { ...record.state, lifecycle: "historical" as const };
	if (record.selection?.lifecycle === "current")
		return { ...record.selection, lifecycle: "historical" as const };
	return record.selection;
}
/**
 * Materialize a completed shelved proposal from its own final patch and baseline.
 * @param context The archive owner.
 * @param model The exact checkpoint catalogue.
 * @param record The retained lifecycle record.
 * @returns Its complete final proposal side.
 */
async function shelvedSelection(
	context: ArchiveContext,
	model: Extract<ArchitectureModelRead, { success: true }>,
	record: Awaited<ReturnType<typeof checkpointRecord>>,
) {
	const { decodeProposal } = await import("#runtime/operations/proposals/read.ts");
	const proposal = record.lifecycle!.proposal;
	const baseline = await exactReading(context, proposal.baseline, undefined, undefined, false);
	if (!baseline.success) return baseline;
	const draft = decodeProposal(baseline, proposal, model);
	return draft.success ? { ...draft, selectedState: retainedSelection(record) } : draft;
}
/**
 * Resolve a retained draft against only its checkpoint's own catalogue.
 * @param context The archive owner.
 * @param model The decoded checkpoint inputs.
 * @param record The immutable metadata.
 * @param checkpoint The exact checkpoint identity.
 * @returns The exact selected architecture.
 */
async function recordedSelection(
	context: ArchiveContext,
	model: Extract<ArchitectureModelRead, { success: true }>,
	record: Awaited<ReturnType<typeof checkpointRecord>>,
	checkpoint: string,
): Promise<ArchitectureModelRead> {
	if (record.correction !== undefined)
		return correctedSelection(context, model, checkpoint, record);
	const selection = retainedSelection(record);
	if (record.lifecycle?.type === "shelve") return shelvedSelection(context, model, record);
	const proposal = model.proposals.find((entry) => entry.id === selection?.id);
	if (proposal === undefined) return { ...model, selectedState: selection };
	const { materializeProposal } = await import("#runtime/operations/proposals/read.ts");
	const current = model.manifest.current;
	return materializeProposal(
		context,
		{ ...model, selectedState: current === null ? null : { ...current, lifecycle: "current" } },
		proposal,
		new Set(),
	);
}
/**
 * Read publication and source evidence only for externally returned checkpoints.
 * @param context The archive owner.
 * @param model The exact complete architecture.
 * @param checkpoint The immutable checkpoint identity.
 * @param record Its immutable metadata.
 * @returns The complete public retained reading.
 */
async function retainedDetails(
	context: ArchiveContext,
	model: Extract<ArchitectureModelRead, { success: true }>,
	checkpoint: string,
	record: Awaited<ReturnType<typeof checkpointRecord>>,
) {
	return {
		...model,
		checkpoint: checkpointMetadata(
			checkpoint,
			record,
			(await checkpointPublication(context, checkpoint)).publication,
		),
		sourceEvidence: await sourceEvidence(context, record.sources),
	};
}
/**
 * Decode one exact architecture independently of current content.
 * @param context The caller's checkout.
 * @param checkpoint The immutable checkpoint identity.
 * @param module The optional module selector.
 * @param flow The optional explicit flow selector.
 * @param details Whether the caller returns publication and source evidence.
 * @returns A coherent retained reading or model validation diagnostics.
 */
async function exactReading(
	context: ArchiveContext,
	checkpoint: string,
	module?: string,
	flow?: string,
	details?: boolean,
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
	const decoded = decodeModel(captured, record.selection);
	if (!decoded.success) return decoded;
	const model = await recordedSelection(context, decoded, record, checkpoint);
	if (!model.success) return model;
	const enriched =
		details === false ? model : await retainedDetails(context, model, checkpoint, record);
	return selectFlow(selectModule(enriched, module), flow);
}

/**
 * Require a continuing identity before materializing retained correction changes.
 * @param record The immutable correction metadata.
 * @param previous The exact prior architecture.
 * @returns Its continuing state metadata.
 */
function correctionState(
	record: Awaited<ReturnType<typeof checkpointRecord>>,
	previous: Extract<ArchitectureModelRead, { success: true }>,
) {
	const selection = record.selection;
	if (selection == null)
		throw new ArchiveError("CHECKPOINT_INVALID", "A correction requires selected state metadata.");
	if (previous.manifest.id !== record.model || previous.selectedState?.id !== selection.id)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"The correction must preserve its original model and state identity.",
		);
	return selection;
}

/**
 * Apply one retained correction through the existing identity-based subject engine.
 * @param context The archive owner.
 * @param catalogue The checkpoint's exact live catalogue.
 * @param checkpoint The correction checkpoint identity.
 * @param record Its immutable metadata.
 * @returns Corrected facts and the explicit audit chain.
 */
async function correctedSelection(
	context: ArchiveContext,
	catalogue: Extract<ArchitectureModelRead, { success: true }>,
	checkpoint: string,
	record: Awaited<ReturnType<typeof checkpointRecord>>,
) {
	const correction = record.correction!;
	if (!record.request.dependencies.includes(correction.previous))
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"A correction must retain its previous checkpoint as a dependency.",
			checkpoint,
		);
	const { decodeSubjects, requireModel } = await import("#runtime/operations/proposals/read.ts");
	const previous = requireModel(
		await exactReading(context, correction.previous, undefined, undefined, false),
	);
	const selection = correctionState(record, previous);
	const { subjectsOf, applyCompactChanges } =
		await import("#runtime/operations/proposals/subjects.ts");
	const { changes, retiredIds, ...audit } = correction;
	const corrected = requireModel(
		decodeSubjects(
			{ ...previous, manifest: { ...previous.manifest, retiredIds } },
			applyCompactChanges(subjectsOf(previous), changes),
			{
				...selection,
				corrections: [...(previous.selectedState?.corrections ?? []), { ...audit, checkpoint }],
			},
		),
	);
	return { ...corrected, proposals: catalogue.proposals, revision: catalogue.revision };
}

/**
 * Open one exact checkpoint, regardless of current content or archive append order.
 * @param vault The explicitly addressed vault.
 * @param checkpoint A complete immutable Git commit identity.
 * @param module A qualified module identity or unique retained name.
 * @param flow A qualified flow identity or unique retained name.
 * @param comparison The optional explicit or default comparison intent.
 * @returns One retained architecture or actionable diagnostics.
 */
async function readCheckpointModel(
	vault: string,
	checkpoint: string,
	module?: string,
	flow?: string,
	comparison?: Omit<
		Parameters<typeof import("#runtime/operations/proposals/read.ts").readSelectedState>[3],
		"state"
	>,
): Promise<ArchitectureModelRead> {
	if (!GitObjectIdSchema.safeParse(checkpoint).success)
		return archiveFailure(
			"CHECKPOINT_INVALID",
			new Error("Use a complete immutable checkpoint identity."),
			checkpoint,
		);
	const { readSelectedState } = await import("#runtime/operations/proposals/read.ts");
	return readSelectedState(vault, module, flow, { state: checkpoint, ...comparison });
}

/**
 * Read exact inputs and report foreign availability through retained pins only.
 * @param vault The explicitly addressed vault.
 * @param checkpoint The immutable architecture checkpoint.
 * @param module The optional retained module selector.
 * @param flow The optional retained flow selector.
 * @param comparison The optional exact or default comparison selection.
 * @returns The coherent retained reading and direct reference availability.
 */
async function readArchitectureCheckpoint(
	vault: string,
	checkpoint: string,
	module?: string,
	flow?: string,
	comparison?: Parameters<typeof readCheckpointModel>[4],
): Promise<ArchitectureModelRead> {
	const reading = await readCheckpointModel(vault, checkpoint, module, flow, comparison);
	return reading.success ? resolveModelReferences(vault, reading) : reading;
}

/**
 * List retained states without turning synchronization records into architecture.
 * @param vault The explicitly addressed vault.
 * @returns Retained metadata or actionable archive diagnostics.
 */
async function listArchitectureCheckpoints(vault: string): Promise<ArchitectureCheckpointList> {
	return historyResult("ARCHIVE_UNREADABLE", async () => {
		const context = await archiveContext(vault);
		const tip = await archiveTip(context);
		const records = await archiveRecords(context, [
			...new Set([
				...(tip === undefined ? [] : [tip]),
				...(await retainedPublicationTips(context)),
			]),
		]);
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

export {
	readArchitectureCheckpoint,
	readCheckpointModel,
	listArchitectureCheckpoints,
	exactReading,
};
