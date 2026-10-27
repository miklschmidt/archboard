import { git } from "@archboard/process/git";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import { ArchitecturePortableBundleSchema } from "#shared/schemas/model-portable.ts";
import { requireCompleteArchive } from "#runtime/store/model-publication.ts";
import {
	readCheckpointInputs,
	ArchiveError,
	type ArchiveContext,
	type CheckpointRecordSchema,
} from "#runtime/store/model-archive.ts";
import { isDeepStrictEqual } from "node:util";
import { decodeModel, discoveryFailure } from "#runtime/operations/read/model-read.ts";
import { proposalBaseline, decodeProposal } from "#runtime/operations/proposals/read.ts";
import { walkthroughDependencies } from "#runtime/operations/history/walkthrough-targets.ts";
type Record = ReturnType<typeof CheckpointRecordSchema.parse>;
type Proposal = ArchitectureModel["proposals"][number];
type Selection = Record["selection"];
/**
 * Collect the exact identities that preserve a proposal and its standing.
 * @param proposal The retained or active proposal.
 * @returns Its required local checkpoints.
 */
function proposalDependencies(proposal: Omit<Proposal, "file">): string[] {
	return [
		proposal.baseline,
		...(proposal.standing === undefined ? [] : [proposal.standing.baseline]),
		...(proposal.restorations ?? []).map((entry) => entry.checkpoint),
	];
}
/**
 * Collect references from one selected state without assigning archive order meaning.
 * @param selection The retained selection, when present.
 * @returns Its required local checkpoints.
 */
function selectionDependencies(selection: Selection): string[] {
	if (selection == null) return [];
	return [
		...(selection.baseline === undefined ? [] : [selection.baseline]),
		...(selection.standing === undefined ? [] : [selection.standing.baseline]),
		...(selection.corrections ?? []).flatMap((audit) => [audit.checkpoint, audit.previous]),
	];
}
/**
 * Collect local dependencies from a complete authored catalogue.
 * @param model The coherent catalogue.
 * @returns Its exact history references.
 */
function modelDependencies(model: ArchitectureModel): string[] {
	return [
		...model.proposals.flatMap(proposalDependencies),
		...model.walkthroughs.flatMap((walk) =>
			"checkpoint" in walk.target ? [walk.target.checkpoint] : [],
		),
		...(model.manifest.current?.baseline === undefined ? [] : [model.manifest.current.baseline]),
	];
}
/**
 * Collect the final compact proposal and prior current reading from a lifecycle decision.
 * @param lifecycle The retained decision, when present.
 * @returns Its exact history references.
 */
function lifecycleDependencies(lifecycle: Record["lifecycle"]): string[] {
	if (lifecycle === undefined) return [];
	return [
		...proposalDependencies(lifecycle.proposal),
		...(lifecycle.previous === null ? [] : [lifecycle.previous.checkpoint]),
	];
}
/**
 * Collect every local dependency of an immutable record.
 * @param record The signed checkpoint record.
 * @param model The exact retained catalogue.
 * @returns Its complete local reference set.
 */
function recordDependencies(record: Record, model: ArchitectureModel): string[] {
	return [
		...record.request.dependencies,
		...(record.narrativeDependencies ?? []),
		...modelDependencies(model),
		...selectionDependencies(record.selection),
		...(record.correction === undefined ? [] : [record.correction.previous]),
		...lifecycleDependencies(record.lifecycle),
	];
}
/**
 * Capture actual Git ancestry once for the complete closure.
 * @param context The archive under inspection.
 * @param tips Its complete roots.
 * @returns A predicate that tests actual ancestry.
 */
async function archiveAncestry(context: ArchiveContext, tips: string[]) {
	const graph =
		tips.length === 0
			? ""
			: ((await git(context.root, ["rev-list", "--parents", ...tips], {
					maxOutputBytes: Infinity,
				})) ?? "");
	const parents = new Map(
		graph
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [id, ...ancestry] = line.split(" ");
				return [id!, ancestry] as const;
			}),
	);
	const retained = new Map<string, Set<string>>();
	/**
	 * Cache the actual ancestors of one immutable commit.
	 * @param id The inspected commit identity.
	 * @returns Every reachable parent and the commit itself.
	 */
	function closure(id: string): Set<string> {
		const cached = retained.get(id);
		if (cached !== undefined) return cached;
		const result = new Set([id]);
		retained.set(id, result);
		for (const parent of parents.get(id) ?? [])
			for (const ancestor of closure(parent)) result.add(ancestor);
		return result;
	}
	return (ancestor: string, descendant: string) => closure(descendant).has(ancestor);
}
/**
 * Require one regular architecture blob rather than an executable, link, or unrelated file.
 * @param entry The immutable Git tree entry.
 * @param id The inspected commit identity.
 */
function requireArchitectureEntry(entry: string, id: string): void {
	const match = /^100644 blob [a-f0-9]+\t(.+)$/u.exec(entry);
	if (match === null)
		throw new ArchiveError(
			"ARCHIVE_NOT_PORTABLE",
			"An archive tree contains a non-regular file.",
			id,
		);
	const path = match[1]!;
	if (path === "record.json") return;
	if (!path.startsWith("inputs/"))
		throw new ArchiveError(
			"ARCHIVE_NOT_PORTABLE",
			"An archive tree contains non-architecture files.",
			id,
		);
	ArchitecturePortableBundleSchema.shape.inputs.element.shape.path.parse(
		path.slice("inputs/".length),
	);
}
/**
 * Require regular architecture-only paths in every immutable tree.
 * @param context The archive under inspection.
 * @param id The inspected commit identity.
 * @param checkpoint Whether this is a checkpoint rather than synchronization.
 */
async function requireArchitectureTree(
	context: ArchiveContext,
	id: string,
	checkpoint: boolean,
): Promise<void> {
	const listing =
		(await git(context.root, ["ls-tree", "-r", "-z", id], {
			maxOutputBytes: Infinity,
			trimOutput: false,
		})) ?? "";
	const entries = listing.split("\0").filter(Boolean);
	entries.forEach((entry) => requireArchitectureEntry(entry, id));
	if (!checkpoint && entries.length !== 1)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"A synchronization record contains architecture inputs.",
			id,
		);
}
/**
 * Decode and fingerprint exact retained inputs before accepting their references.
 * @param context The archive under inspection.
 * @param id The retained checkpoint identity.
 * @param record The immutable checkpoint record.
 * @returns The coherent retained catalogue.
 */
async function retainedModel(context: ArchiveContext, id: string, record: Record) {
	const captured = await readCheckpointInputs(context, id);
	if (!isDeepStrictEqual(captured.revision, record.revision))
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"Retained inputs disagree with their complete fingerprint.",
			id,
		);
	const model = discoveryFailure(captured) ?? decodeModel(captured);
	if (!model.success) throw new ArchiveError(model.code, model.diagnostics[0]!.message, id);
	if (model.manifest.id !== record.model)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"A retained manifest disagrees with its model identity.",
			id,
		);
	return model;
}
/**
 * Materialize active proposal sides while preserving unresolved standing.
 * @param context The inspected archive.
 * @param model The complete current catalogue.
 */
async function requireMaterializations(
	context: ArchiveContext,
	model: ArchitectureModel,
): Promise<void> {
	await walkthroughDependencies(context, model);
	await Promise.all(
		model.proposals.map(async (proposal) => {
			const baseline = await proposalBaseline(context, model, proposal);
			if (!baseline.success)
				throw new ArchiveError(baseline.code, baseline.diagnostics[0]!.message, proposal.baseline);
			const reading = decodeProposal(baseline, proposal, model);
			if (!reading.success)
				throw new ArchiveError(reading.code, reading.diagnostics[0]!.message, proposal.baseline);
			await walkthroughDependencies(context, reading);
		}),
	);
}
/**
 * Prove that the complete closure preserves every local dependency through actual Git parents.
 * @param context The archive under inspection.
 * @param tips The portable roots.
 * @param model The live authored catalogue.
 */
async function requirePortableClosure(
	context: ArchiveContext,
	tips: string[],
	model: ArchitectureModel,
): Promise<void> {
	const records = [
		...new Map(
			(await Promise.all(tips.map((tip) => requireCompleteArchive(context, tip, true))))
				.flat()
				.map((entry) => [entry.id, entry]),
		).values(),
	];
	const known = new Map(records.map((entry) => [entry.id, entry.record]));
	const ancestor = await archiveAncestry(context, tips);
	/**
	 * Require matching local records without borrowing another model's state.
	 * @param dependencies The complete local reference set.
	 * @param owner The stable model identity.
	 * @param checkpoint The child that must retain every dependency, when present.
	 */
	function requireReferences(dependencies: string[], owner: string, checkpoint?: string): void {
		for (const dependency of dependencies) {
			requireLocalRecord(dependency, owner);
			if (checkpoint !== undefined && !ancestor(dependency, checkpoint))
				throw new ArchiveError(
					"CHECKPOINT_INVALID",
					"A dependency lacks actual Git parent retention.",
					dependency,
				);
		}
	}
	/**
	 * Require a checkpoint owned by the local model and vault.
	 * @param dependency The required immutable identity.
	 * @param owner The stable model identity.
	 */
	function requireLocalRecord(dependency: string, owner: string): void {
		const record = known.get(dependency);
		if (record?.kind !== "checkpoint")
			throw new ArchiveError(
				"ARCHITECTURE_UNAVAILABLE",
				"A required checkpoint is absent from the portable archive.",
				dependency,
			);
		if (record.model !== owner || record.vault !== context.vault)
			throw new ArchiveError(
				"CHECKPOINT_INVALID",
				"A required checkpoint belongs to another model or vault.",
				dependency,
			);
	}

	await Promise.all(
		records.map(async ({ id, record }) => {
			await requireArchitectureTree(context, id, record.kind === "checkpoint");
			if (record.kind !== "checkpoint") return;
			if (record.vault !== context.vault)
				throw new ArchiveError(
					"ARCHIVE_NOT_PORTABLE",
					"An archive checkpoint names another vault address.",
					id,
				);
			requireReferences(
				recordDependencies(record, await retainedModel(context, id, record)),
				record.model,
				id,
			);
		}),
	);
	requireReferences(modelDependencies(model), model.manifest.id);
	await requireMaterializations(context, model);
}
export { requirePortableClosure };
