import { createHash } from "node:crypto";
import type { z } from "zod";
import { StateMetadataSchema } from "#shared/schemas/model-definitions.ts";
import { SelectedStateSchema, StateSelectionSchema } from "#shared/schemas/model-proposals.ts";
import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import {
	readCurrentModel,
	decodeModel,
	selectModule,
	selectFlow,
} from "#runtime/operations/read/model-read.ts";
import { exactReading } from "#runtime/operations/history/read.ts";
import { archiveContext, ArchiveError, type ArchiveContext } from "#runtime/store/model-archive.ts";
import { historyResult } from "#runtime/operations/history/result.ts";
import { modelRevision } from "#runtime/store/model-files.ts";
import { applyCompactChanges, subjectsOf } from "#runtime/operations/proposals/subjects.ts";
import { materializedDefinitions } from "#runtime/operations/proposals/materialize.ts";
import { comparisonOf } from "#runtime/operations/proposals/compare.ts";

type Proposal = z.infer<typeof import("#shared/schemas/model-proposals.ts").ProposalSchema> & {
	file?: string;
};
type Selection = z.input<typeof StateSelectionSchema>;
/**
 * Identify complete predecessor meaning independently of sibling files.
 * @param model The coherent predecessor.
 * @returns A stable fingerprint of meaning and metadata.
 */
function predecessorRevision(model: ArchitectureModel): string {
	const state =
		model.selectedState === null ? null : StateMetadataSchema.strip().parse(model.selectedState);
	return createHash("sha256")
		.update(
			JSON.stringify({
				manifest: { ...model.manifest, retiredIds: model.manifest.retiredIds ?? [] },
				state,
				policy: model.policy,
				modules: model.modules,
				collections: model.collections,
				...(model.walkthroughs.length === 0 ? {} : { walkthroughs: model.walkthroughs }),
			}),
		)
		.digest("hex");
}
/**
 * Produce complete canonical files without active sibling proposals.
 * @param model The selected architecture.
 * @param policy Its authored policy bytes.
 * @returns Architecture-only inputs.
 */
function materializedInputs(model: ArchitectureModel, policy: Buffer): Map<string, Buffer> {
	const inputs = new Map<string, Buffer>([
		["model.json", Buffer.from(JSON.stringify(model.manifest))],
		[".archboard/config.yaml", policy],
	]);
	for (const value of [...model.modules, ...model.collections, ...model.walkthroughs]) {
		const { file, ...definition } = value;
		inputs.set(file, Buffer.from(`${JSON.stringify(definition, null, 2)}\n`));
	}
	return inputs;
}
/**
 * Require the immutable baseline to name this proposal's predecessor.
 * @param context The archive owner.
 * @param catalogue The coherent addressed model.
 * @param proposal The selected draft.
 * @returns Its complete retained baseline.
 */
async function proposalBaseline(
	context: ArchiveContext,
	catalogue: ArchitectureModel,
	proposal: Proposal,
) {
	const baseline = await exactReading(context, proposal.baseline, undefined, undefined, false);
	if (!baseline.success) return baseline;
	if (
		baseline.manifest.id !== catalogue.manifest.id ||
		predecessorRevision(baseline) !== proposal.predecessorRevision
	)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"The retained baseline does not match this proposal predecessor.",
			proposal.baseline,
			[proposal.id],
		);
	const retired = new Set(baseline.manifest.retiredIds);
	if (proposal.changes.some((change) => change.type === "add" && retired.has(change.subject)))
		throw new ArchiveError(
			"MODEL_INVALID",
			"A proposal cannot allocate a retired identity.",
			proposal.file,
			[proposal.id],
		);
	return baseline;
}
/**
 * Refuse changed predecessors until explicit reconciliation exists.
 * @param context The archive owner.
 * @param catalogue The addressed coherent inputs.
 * @param proposal The selected draft.
 * @param visited The ancestry guard.
 * @returns A predecessor refusal or absence.
 */
async function requirePredecessor(
	context: ArchiveContext,
	catalogue: ArchitectureModel,
	proposal: Proposal,
	visited: Set<string>,
) {
	if (proposal.predecessor === null) return undefined;
	const predecessor = await resolveState(context, catalogue, proposal.predecessor, visited);
	if (!predecessor.success) return predecessor;
	if (predecessorRevision(predecessor) !== proposal.predecessorRevision)
		throw new ArchiveError(
			"PREDECESSOR_CHANGED",
			"The predecessor changed after this immutable baseline. Reconciliation is unavailable until TASK-549.07.",
			proposal.file,
			[proposal.id, proposal.predecessor],
		);
	return undefined;
}
/**
 * Reserve removals inside the selected draft only.
 * @param manifest The retained predecessor manifest.
 * @param proposal The compact draft.
 * @returns Its complete materialized manifest.
 */
function proposalManifest(manifest: ArchitectureModel["manifest"], proposal: Proposal) {
	return {
		...manifest,
		retiredIds: [...new Set([...(manifest.retiredIds ?? []), ...(proposal.retiredIds ?? [])])],
	};
}
/**
 * Decode the complete intended draft through the canonical authority.
 * @param baseline The retained predecessor.
 * @param proposal The selected compact draft.
 * @param catalogue The current proposal catalogue and stale token.
 * @returns One coherent materialized draft.
 */
function decodeProposal(
	baseline: ArchitectureModel,
	proposal: Proposal,
	catalogue: ArchitectureModel,
): ArchitectureModelRead {
	const definitions = materializedDefinitions(
		baseline,
		applyCompactChanges(subjectsOf(baseline), proposal.changes),
	);
	const inputs = materializedInputs(baseline, Buffer.from(Bun.YAML.stringify(baseline.policy)));
	for (const file of inputs.keys())
		if (/\.(module|flows|walkthrough)\.json$/u.test(file)) inputs.delete(file);
	for (const value of [
		...definitions.modules,
		...definitions.collections,
		...definitions.walkthroughs,
	]) {
		const { file, ...definition } = value;
		inputs.set(file, Buffer.from(JSON.stringify(definition)));
	}
	const manifest = proposalManifest(baseline.manifest, proposal);
	inputs.set("model.json", Buffer.from(JSON.stringify(manifest)));
	const decoded = decodeModel(
		{ inputs, revision: modelRevision(inputs), diagnostics: [] },
		SelectedStateSchema.strip().parse(proposal),
	);
	if (!decoded.success) return decoded;
	return { ...decoded, revision: catalogue.revision, proposals: catalogue.proposals };
}
/**
 * Materialize one draft from its retained baseline with safe ancestry checks.
 * @param context The archive owner.
 * @param catalogue The addressed coherent inputs.
 * @param proposal The selected draft.
 * @param visited The ancestry cycle guard.
 * @returns The complete draft or a structured refusal.
 */
async function materializeProposal(
	context: ArchiveContext,
	catalogue: ArchitectureModel,
	proposal: Proposal,
	visited: Set<string>,
): Promise<ArchitectureModelRead> {
	if (visited.has(proposal.id))
		throw new ArchiveError("MODEL_INVALID", "Proposal ancestry contains a cycle.");
	const baseline = await proposalBaseline(context, catalogue, proposal);
	if (!baseline.success) return baseline;
	const blocked = await requirePredecessor(
		context,
		catalogue,
		proposal,
		new Set([...visited, proposal.id]),
	);
	return blocked ?? decodeProposal(baseline, proposal, catalogue);
}
/**
 * Resolve stable identity before unique current or former state names.
 * @param catalogue The addressed coherent inputs.
 * @param selector The explicit state selector.
 * @returns Stable state metadata.
 */
function selectedMetadata(catalogue: ArchitectureModel, selector: string) {
	const current = catalogue.manifest.current;
	const states = [...catalogue.proposals, ...(current === null ? [] : [current])];
	const exact = states.find((state) => state.id === selector);
	const matches =
		exact === undefined
			? states.filter((state) => state.name === selector || state.formerNames?.includes(selector))
			: [exact];
	if (matches.length !== 1)
		throw new ArchiveError(
			matches.length === 0 ? "STATE_NOT_FOUND" : "STATE_AMBIGUOUS",
			"Use one stable state identity from the model catalogue.",
			"model.json",
			matches.map((state) => state.id),
		);
	return matches[0]!;
}
/**
 * Recognize a complete immutable checkpoint selector.
 * @param selector The requested selector.
 * @returns Whether it is an exact checkpoint identity.
 */
function isCheckpoint(selector: string | undefined): boolean {
	return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(selector ?? "");
}
/**
 * Resolve one coherent state without substituting another reading.
 * @param context The archive owner.
 * @param catalogue The coherent catalogue.
 * @param selector The explicit state identity or name.
 * @param visited The predecessor cycle guard.
 * @returns One complete selected architecture.
 */
async function resolveState(
	context: ArchiveContext,
	catalogue: ArchitectureModel,
	selector: string,
	visited = new Set<string>(),
): Promise<ArchitectureModelRead> {
	if (isCheckpoint(selector)) return exactReading(context, selector);
	if (selector === "current") {
		if (catalogue.manifest.current === null)
			throw new ArchiveError(
				"STATE_NOT_FOUND",
				"This planning model has no current state. Select a named draft.",
			);
		return catalogue;
	}
	const metadata = selectedMetadata(catalogue, selector);
	const proposal = catalogue.proposals.find((entry) => entry.id === metadata.id);
	return proposal === undefined
		? catalogue
		: materializeProposal(context, catalogue, proposal, visited);
}
/**
 * Resolve an explicit selector while keeping exact reads independent of current.
 * @param context The archive owner.
 * @param current The working input read or refusal.
 * @param selector The selected state, when present.
 * @returns One selected reading.
 */
async function requestedState(
	context: ArchiveContext,
	current: ArchitectureModelRead,
	selector: string | undefined,
) {
	if (selector === undefined) return current;
	if (isCheckpoint(selector)) return exactReading(context, selector);
	if (!current.success) return current;
	return resolveState(context, current, selector);
}
/**
 * Choose current before the retained predecessor for a non-current reading.
 * @param selected The complete selected state.
 * @param current The working reading or refusal.
 * @returns Its default reference, when one exists.
 */
function defaultComparisonReference(
	selected: ArchitectureModel,
	current: ArchitectureModelRead,
): ReturnType<typeof comparisonReference> {
	if (current.success && current.manifest.current !== null)
		return { selector: "current", reason: "current" };
	const state = selected.selectedState;
	if (state === null) return undefined;
	if (state.predecessor == null || state.baseline === undefined) return undefined;
	return { selector: state.baseline, reason: "predecessor" };
}
/**
 * Choose the comparison reference without treating archive order as ancestry.
 * @param selected The selected coherent architecture.
 * @param current The current read or refusal.
 * @param selection The explicit comparison intent.
 * @returns A selector and its reason, or absence without a base.
 */
function comparisonReference(
	selected: ArchitectureModel,
	current: ArchitectureModelRead,
	selection: Selection,
):
	| { selector: string; reason: NonNullable<ArchitectureModel["comparison"]>["reason"] }
	| undefined {
	if (selection.against !== undefined) return { selector: selection.against, reason: "explicit" };
	if (selection.compare === false) return undefined;
	if (selected.selectedState?.lifecycle === "current") return undefined;
	return defaultComparisonReference(selected, current);
}
/**
 * Add serializable semantic comparison to a complete selected reading.
 * @param context The archive owner.
 * @param selected The selected complete state.
 * @param current The current read or refusal.
 * @param selection The comparison intent.
 * @returns The compared state or structured refusal.
 */
async function compareSelected(
	context: ArchiveContext,
	selected: ArchitectureModel,
	current: ArchitectureModelRead,
	selection: Selection,
): Promise<ArchitectureModelRead> {
	const reference = comparisonReference(selected, current, selection);
	if (reference === undefined) return selected;
	const against = await requestedState(context, current, reference.selector);
	if (!against.success) return against;
	selected.comparison = {
		reason: reference.reason,
		against: against.selectedState,
		revision: against.revision,
		subjects: comparisonOf(against, selected),
		...(against.checkpoint === undefined ? {} : { checkpoint: against.checkpoint.id }),
	};
	return selected;
}
/**
 * Read selected architecture without acquiring the installation lease.
 * @param vault The addressed vault.
 * @param selection The state and comparison intent.
 * @returns A complete selected reading.
 */
async function selectedReading(
	vault: string,
	selection: Selection,
): Promise<ArchitectureModelRead> {
	const current = readCurrentModel(vault);
	if (selection.state === undefined && selection.against === undefined) return current;
	const context = await archiveContext(vault);
	const selected = await requestedState(context, current, selection.state);
	if (!selected.success) return selected;
	return compareSelected(context, selected, current, selection);
}
/**
 * Read a selected draft or retained state with explicit comparison metadata.
 * @param vault The addressed vault.
 * @param module The optional module selection.
 * @param flow The optional flow selection.
 * @param selection The state and comparison intent.
 * @returns The coherent selected reading.
 */
async function readSelectedState(
	vault: string,
	module: string | undefined,
	flow: string | undefined,
	selection: Selection,
): Promise<ArchitectureModelRead> {
	return historyResult("ARCHITECTURE_UNAVAILABLE", async () =>
		selectFlow(selectModuleResult(await selectedReading(vault, selection), module), flow),
	);
}
/**
 * Resolve a module only after the complete state succeeds.
 * @param model The state read or refusal.
 * @param module The optional explicit module selector.
 * @returns The selection or original refusal.
 */
function selectModuleResult(model: ArchitectureModelRead, module: string | undefined) {
	return model.success ? selectModule(model, module) : model;
}
export {
	predecessorRevision,
	materializedInputs,
	materializeProposal,
	resolveState,
	readSelectedState,
	decodeProposal,
};
