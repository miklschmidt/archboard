import { mintId } from "#shared/rules/ids.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import { StateMetadataSchema } from "#shared/schemas/model-definitions.ts";
import { ProposalSchema, SelectedStateSchema } from "#shared/schemas/model-proposals.ts";
import type { z } from "zod";
import { scopedPreview } from "#runtime/operations/legacy-inventory/history.ts";
import { conversionBaseline } from "#runtime/operations/legacy-inventory/drafts.ts";
import {
	compactChanges,
	subjectsOf,
	applyCompactChanges,
} from "#runtime/operations/proposals/subjects.ts";
import {
	decodeSubjects,
	materializedInputs,
	predecessorRevision,
	requireModel,
} from "#runtime/operations/proposals/read.ts";
import {
	archiveCommit,
	tree,
	CheckpointRecordSchema,
	type ArchiveContext,
	ArchiveError,
} from "#runtime/store/model-archive.ts";
import { modelRevision } from "#runtime/store/model-files.ts";
import type { ArchitectureMigrationRequestSchema } from "#shared/schemas/migration-installation.ts";
type Request = z.infer<typeof ArchitectureMigrationRequestSchema>;
type History = NonNullable<NonNullable<ArchitectureModel["migrationPreview"]>["history"]>[number];
type Mapping = NonNullable<LegacyInventory["plan"]["drafts"]>[number];
/**
 * Retain a converted baseline with actual original ancestry.
 * @param state The complete conversion context.
 * @param model The coherent baseline.
 * @param suffix Its operation-local identity.
 * @returns The signed retained baseline.
 */
async function retainBaseline(state: Conversion, model: ArchitectureModel, suffix: string) {
	const inputs = materializedInputs(model, Buffer.from(Bun.YAML.stringify(model.policy)));
	const dependencies = [...state.dependencies];
	const request = state.request;
	const record = CheckpointRecordSchema.parse({
		schemaVersion: 1,
		kind: "checkpoint",
		vault: state.context.vault,
		model: model.manifest.id,
		state:
			model.selectedState === null ? null : StateMetadataSchema.strip().parse(model.selectedState),
		selection: model.selectedState,
		revision: modelRevision(inputs),
		createdAt: new Date().toISOString(),
		request: {
			target: "current",
			operationId: `${request.operationId}:${suffix}`,
			writer: request.writer,
			doing: request.doing,
			expectedRevision: request.expectedRevision.digest,
			dependencies,
		},
		sources: [],
	});
	const files = new Map([...inputs].map(([path, bytes]) => [`inputs/${path}`, bytes]));
	files.set("record.json", Buffer.from(JSON.stringify(record)));
	const id = await archiveCommit(
		state.context,
		await tree(state.context, files),
		dependencies,
		"archboard: retain converted proposal baseline",
	);
	state.dependencies.add(id);
	return id;
}
/**
 * Allocate canonical state IDs while retaining their qualified original identities.
 * @param model The preview with original history.
 * @returns The explicit original-to-installed state map.
 */
function installedStates(model: ArchitectureModel) {
	const used = new Set([model.manifest.id]);
	return model.migrationPreview!.history!.map((entry) => {
		if (entry.state.lifecycle === "current")
			return { legacy: entry.legacy, id: model.manifest.current!.id };
		const suggested = entry.canonical.split("#")[1]!;
		const id = used.has(suggested) ? mintId(used) : suggested;
		used.add(id);
		return { legacy: entry.legacy, id };
	});
}
/**
 * Assemble one conversion context without introducing another runtime owner.
 * @param context The archive owner.
 * @param inventory Captured originals and choices.
 * @param preview The composed current model.
 * @param originals Its retained original checkpoint.
 * @param request The authorized intent.
 * @returns Local conversion state.
 */
function conversionState(
	context: ArchiveContext,
	inventory: LegacyInventory,
	preview: ArchitectureModel,
	originals: string,
	request: Request,
) {
	const migration = {
		schemaVersion: 1 as const,
		origin: request.origin,
		checkpoint: originals,
		source: inventory.source,
		planRevision: request.expectedPlan,
		states: installedStates(preview),
		bookmarks: preview.migrationPreview!.bookmarks,
		addresses: preview.migrationPreview!.addresses,
	};
	return {
		context,
		inventory,
		request,
		current: { ...preview, migration },
		proposals: [] as ArchitectureModel["proposals"],
		dependencies: new Set([originals]),
		completed: new Map<string, ArchitectureModel>(),
		visiting: new Set<string>(),
	};
}
type Conversion = ReturnType<typeof conversionState>;
/**
 * Resolve the explicit installed identity of one original state.
 * @param state The conversion context.
 * @param legacy The qualified original state.
 * @returns Its continuing installed state identity.
 */
function stateId(state: Conversion, legacy: string): string {
	return state.current.migration.states.find((entry) => entry.legacy === legacy)!.id;
}
/**
 * Use installed state identities for canonical narrative targets.
 * @param model The scoped conversion reading.
 * @param target Its installed target.
 * @returns The same architecture with explicit canonical narrative targets.
 */
function narrativeTargets(model: ArchitectureModel, target: string): ArchitectureModel {
	return {
		...model,
		walkthroughs: model.walkthroughs.map((walk) => ({ ...walk, target: { state: target } })),
	};
}
/**
 * Retain a separate original predecessor without borrowing present-day surroundings.
 * @param state The conversion context.
 * @param parent Its exact original parent.
 * @returns The scoped canonical parent and its retained checkpoint.
 */
async function originalPredecessor(state: Conversion, parent: History) {
	const scoped = requireModel(
		scopedPreview(state.inventory, parent.legacy, undefined, undefined, true),
	);
	const baseline = narrativeTargets(
		{
			...scoped,
			migration: {
				...state.current.migration,
				readingDiagnostics: scoped.migrationPreview!.readingDiagnostics,
			},
			selectedState: {
				...StateMetadataSchema.strip().parse(parent.state),
				id: stateId(state, parent.legacy),
				lifecycle: parent.state.lifecycle,
			},
		},
		stateId(state, parent.legacy),
	);
	const predecessorCheckpoint = await retainBaseline(
		state,
		baseline,
		`${stateId(state, parent.legacy)}:predecessor`,
	);
	return { baseline, predecessor: stateId(state, parent.legacy), predecessorCheckpoint };
}
/**
 * Choose only the mapped predecessor or an empty planning root.
 * @param state The conversion context.
 * @param mapping The explicit original ancestry.
 * @returns Its coherent predecessor and immutable reference when required.
 */
async function mappedPredecessor(
	state: Conversion,
	mapping: Mapping,
): Promise<{
	baseline: ArchitectureModel;
	predecessor: string | null;
	predecessorCheckpoint?: string;
}> {
	const parent = state.current.migrationPreview!.history!.find(
		(entry) => entry.legacy === mapping.predecessor,
	);
	if (mapping.baseline.kind === "empty")
		return {
			baseline: {
				...state.current,
				manifest: { ...state.current.manifest, current: null },
				selectedState: null,
				modules: [],
				collections: [],
				walkthroughs: [],
				relationships: [],
				roots: [],
			},
			predecessor: null,
		};
	if (parent === undefined)
		throw new ArchiveError("MAPPING_INVALID", "The original predecessor is unavailable.");
	if (parent.state.lifecycle === "draft")
		return {
			baseline: await convertDraft(state, parent.legacy),
			predecessor: stateId(state, parent.legacy),
		};
	if (parent.state.lifecycle === "current")
		return { baseline: state.current, predecessor: state.current.manifest.current!.id };
	return originalPredecessor(state, parent);
}
/**
 * Restore the exact original standing base within its converted predecessor.
 * @param state The conversion context.
 * @param mapping Its explicit original baseline.
 * @param baseline The ordinary canonical predecessor.
 * @param scopedBase The exact mapped original base.
 * @returns The coherent baseline that established standing.
 */
function standingBase(
	state: Conversion,
	mapping: Mapping,
	baseline: ArchitectureModel,
	scopedBase: ArchitectureModel,
): ArchitectureModel {
	if (mapping.baseline.kind !== "reconciliation-base") return baseline;
	const parent = requireModel(
		scopedPreview(state.inventory, mapping.predecessor!, undefined, undefined, true),
	);
	const original = narrativeTargets(parent, baseline.selectedState?.id ?? "current");
	return requireModel(
		decodeSubjects(
			baseline,
			applyCompactChanges(subjectsOf(baseline), compactChanges(original, scopedBase)),
			baseline.selectedState,
		),
	);
}
/**
 * Preserve original conflicts and blocked ancestry in canonical standing.
 * @param state The conversion context.
 * @param entry The exact original draft metadata.
 * @param baseline Its retained conflict base.
 * @param checkpoint The canonical baseline checkpoint.
 * @param predecessor Its installed predecessor.
 * @returns Original standing with mapped identities, or absence.
 */
function proposalStanding(
	state: Conversion,
	entry: History,
	baseline: ArchitectureModel,
	checkpoint: string,
	predecessor: string | null,
) {
	const original = entry.state.reconciliation;
	if (original === undefined) return undefined;
	return {
		against: predecessor ?? stateId(state, entry.legacy),
		baseline: checkpoint,
		atRevision: baseline.revision.digest,
		blockedBy:
			original.blockedBy === undefined
				? undefined
				: stateId(state, `${state.inventory.plan.origin}/${entry.board}#${original.blockedBy}`),
		issues: original.issues.map((issue) => ({
			...issue,
			subject: mappedIdentity(
				state.inventory.plan,
				`${state.inventory.plan.origin}/${entry.board}#${issue.subject}`,
			),
		})),
	};
}
/**
 * Convert one draft after its predecessor through the existing compact subject engine.
 * @param state The conversion context.
 * @param legacy Its qualified original identity.
 * @returns One coherent installed draft reading.
 */
async function convertDraft(state: Conversion, legacy: string): Promise<ArchitectureModel> {
	const ready = state.completed.get(legacy);
	if (ready !== undefined) return ready;
	if (state.visiting.has(legacy))
		throw new ArchiveError("MAPPING_INVALID", "Original draft ancestry contains a cycle.");
	state.visiting.add(legacy);
	const entry = state.current.migrationPreview!.history!.find((value) => value.legacy === legacy)!;
	const mapping = state.inventory.plan.drafts!.find((value) => value.legacy === legacy)!;
	const selected = requireModel(scopedPreview(state.inventory, legacy, undefined, undefined, true));
	if (selected.migrationPreview!.readingDiagnostics!.length > 0)
		throw new ArchiveError(
			"MAPPING_UNRESOLVED",
			"Every converted draft beat requires an explicit valid original view.",
		);
	const parent = await mappedPredecessor(state, mapping);
	const scopedBase = narrativeTargets(
		requireModel(conversionBaseline(state.inventory, mapping, selected)),
		parent.predecessor ?? "current",
	);
	const baseline = standingBase(state, mapping, parent.baseline, scopedBase);
	const baselineCheckpoint = await retainBaseline(
		state,
		baseline,
		`${stateId(state, legacy)}:baseline`,
	);
	const proposal = ProposalSchema.parse({
		schemaVersion: 1,
		...StateMetadataSchema.strip().parse(entry.state),
		id: stateId(state, legacy),
		lifecycle: "draft",
		predecessor: parent.predecessor,
		predecessorCheckpoint: parent.predecessorCheckpoint,
		predecessorRevision: predecessorRevision(baseline),
		baseline: baselineCheckpoint,
		changes: compactChanges(scopedBase, narrativeTargets(selected, stateId(state, legacy))),
		migration: { ...mapping, checkpoint: state.current.migration.checkpoint },
		standing: proposalStanding(state, entry, baseline, baselineCheckpoint, parent.predecessor),
	});
	const draft = requireModel(
		decodeSubjects(
			baseline,
			applyCompactChanges(subjectsOf(baseline), proposal.changes),
			SelectedStateSchema.strip().parse(proposal),
		),
	);
	state.proposals.push({ ...proposal, file: `proposals/${proposal.id}.proposal.json` });
	state.completed.set(legacy, draft);
	state.visiting.delete(legacy);
	return draft;
}
/**
 * Convert every mapped draft and retain all installed dependencies.
 * @param context The archive owner.
 * @param inventory Captured originals and choices.
 * @param preview The composed current model.
 * @param originals Its retained original checkpoint.
 * @param request The authorized intent.
 * @returns One complete canonical file set and its actual history parents.
 */
async function migrationCandidate(
	context: ArchiveContext,
	inventory: LegacyInventory,
	preview: ArchitectureModel,
	originals: string,
	request: Request,
) {
	const state = conversionState(context, inventory, preview, originals, request);
	for (const entry of preview.migrationPreview!.history!.filter(
		(value) => value.state.lifecycle === "draft",
	)) {
		// oxlint-disable-next-line no-await-in-loop -- retain and convert each predecessor before its dependent draft
		await convertDraft(state, entry.legacy);
	}
	const inputs = materializedInputs(
		state.current,
		Buffer.from(Bun.YAML.stringify(state.current.policy)),
	);
	for (const { file, ...proposal } of state.proposals)
		inputs.set(file, Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`));
	return {
		model: { ...state.current, proposals: state.proposals },
		inputs,
		dependencies: [...state.dependencies],
	};
}
export { migrationCandidate };
