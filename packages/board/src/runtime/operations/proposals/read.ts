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
import {
	applyCompactChanges,
	subjectsOf,
	type Subjects,
} from "#runtime/operations/proposals/subjects.ts";
import { materializedDefinitions } from "#runtime/operations/proposals/materialize.ts";
import { comparisonOf } from "#runtime/operations/proposals/compare.ts";
import { retainedStates, stateCatalogue } from "#runtime/operations/history/states.ts";

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
	for (const value of [...model.modules, ...model.collections]) {
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
	await Promise.all(
		proposal.changes
			.filter(
				(change) => change.type === "add" && baseline.manifest.retiredIds?.includes(change.subject),
			)
			.map((change) => requireRestoration(context, proposal, change.subject)),
	);

	return baseline;
}
/**
 * Require original retained identity evidence before restoring a retired subject.
 * @param context The archive owner.
 * @param proposal The selected compact draft.
 * @param subject The continuing identity.
 */
async function requireRestoration(
	context: ArchiveContext,
	proposal: Proposal,
	subject: string,
): Promise<void> {
	const proof = proposal.restorations?.find((entry) => entry.subject === subject);
	if (proof === undefined)
		throw new ArchiveError(
			"MODEL_INVALID",
			"A proposal cannot allocate a retired identity.",
			proposal.file,
			[subject],
		);
	const origin = requireModel(
		await exactReading(context, proof.checkpoint, undefined, undefined, false),
	);
	if (!subjectsOf(origin).has(subject))
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"Restoration requires the original retained subject.",
			proof.checkpoint,
			[subject],
		);
}
/**
 * Preserve structured diagnostics when a candidate needs a coherent reading.
 * @param reading The shared reader result.
 * @returns The coherent model.
 */
function requireModel(reading: ArchitectureModelRead): ArchitectureModel {
	if (!reading.success) {
		const diagnostic = reading.diagnostics[0]!;
		throw new ArchiveError(reading.code, diagnostic.message, diagnostic.file, diagnostic.subjects);
	}
	return reading;
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
			"The predecessor changed after this immutable baseline. Submit an explicit reconcile intent against the predecessor.",
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
		retiredIds: [
			...new Set([...(manifest.retiredIds ?? []), ...(proposal.retiredIds ?? [])]),
		].filter((id) => !proposal.restorations?.some((proof) => proof.subject === id)),
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
	const decoded = decodeSubjects(
		{ ...baseline, manifest: proposalManifest(baseline.manifest, proposal) },
		applyCompactChanges(subjectsOf(baseline), proposal.changes),
		SelectedStateSchema.strip().parse(proposal),
	);
	if (!decoded.success) return decoded;
	return { ...decoded, revision: catalogue.revision, proposals: catalogue.proposals };
}
/**
 * Decode resolved subjects through the canonical file authority.
 * @param baseline The complete materialization context.
 * @param subjects The resolved subject graph.
 * @param selection The explicit selected state.
 * @returns The complete coherent reading or its diagnostics.
 */
function decodeSubjects(
	baseline: ArchitectureModel,
	subjects: Subjects,
	selection: ArchitectureModel["selectedState"],
): ArchitectureModelRead {
	const definitions = materializedDefinitions(baseline, subjects);
	const inputs = materializedInputs(baseline, Buffer.from(Bun.YAML.stringify(baseline.policy)));
	for (const file of inputs.keys()) if (/\.(module|flows)\.json$/u.test(file)) inputs.delete(file);
	for (const { file, ...definition } of [...definitions.modules, ...definitions.collections])
		inputs.set(file, Buffer.from(JSON.stringify(definition)));
	return decodeModel({ inputs, revision: modelRevision(inputs), diagnostics: [] }, selection);
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
	const blocked =
		proposal.standing === undefined
			? await requirePredecessor(context, catalogue, proposal, new Set([...visited, proposal.id]))
			: undefined;
	return blocked ?? decodeProposal(baseline, proposal, catalogue);
}
/**
 * Resolve stable identity before unique current or former state names.
 * @param states The authored and retained state catalogue.
 * @param selector The explicit state selector.
 * @returns Stable state metadata.
 */
function selectedMetadata(states: NonNullable<ArchitectureModel["states"]>, selector: string) {
	const exact = states.filter((state) => state.id === selector);
	const matches =
		exact.length === 0
			? states.filter((state) => state.name === selector || state.formerNames?.includes(selector))
			: exact;
	if (matches.length !== 1)
		throw new ArchiveError(
			matches.length === 0 ? "STATE_NOT_FOUND" : "STATE_AMBIGUOUS",
			"Use one unambiguous stable state identity or exact checkpoint from the model catalogue.",
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
 * Use a supplied catalogue or derive completed metadata only when required.
 * @param context The archive owner.
 * @param catalogue The current coherent model.
 * @param selector The requested identity or name.
 * @returns Its unambiguous metadata.
 */
async function stateMetadata(
	context: ArchiveContext,
	catalogue: ArchitectureModel,
	selector: string,
) {
	const live = stateCatalogue(catalogue, []);
	if (live.some((state) => state.id === selector)) return selectedMetadata(live, selector);
	const states =
		catalogue.states ??
		stateCatalogue(catalogue, await retainedStates(context, catalogue.manifest.id));
	return selectedMetadata(states, selector);
}
/**
 * Require an explicit current designation without substituting a planning draft.
 * @param catalogue The addressed coherent inputs.
 * @returns Their current reading.
 */
function currentDesignation(catalogue: ArchitectureModel) {
	if (catalogue.manifest.current === null)
		throw new ArchiveError(
			"STATE_NOT_FOUND",
			"This planning model has no current state. Select a named draft.",
		);
	return catalogue;
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
	if (selector === "current") return currentDesignation(catalogue);
	const metadata = await stateMetadata(context, catalogue, selector);
	const proposal = catalogue.proposals.find((entry) => entry.id === metadata.id);
	if (metadata.checkpoint !== undefined) return exactReading(context, metadata.checkpoint);
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
	if (!current.success) {
		const retained = selectedMetadata(await retainedStates(context), selector);
		return exactReading(context, retained.checkpoint!);
	}
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
		...((selected.selectedState?.corrections?.length ?? 0) + (against.selectedState?.corrections?.length ?? 0) === 0 ? {} : {
			corrections: { selected: selected.selectedState?.corrections ?? [], against: against.selectedState?.corrections ?? [] },
		}),
	};
	return selected;
}
/**
 * Keep an uninitialized private archive separate from readable current inputs.
 * @param vault The addressed vault.
 * @returns Its archive context, or absence before explicit initialization.
 */
async function readingArchive(vault: string) {
	try {
		return await archiveContext(vault);
	} catch (error) {
		if (error instanceof ArchiveError && error.code === "ARCHIVE_NOT_INITIALIZED") return undefined;
		throw error;
	}
}

/**
 * Derive retained metadata only for the default current catalogue reading.
 * @param vault The addressed vault.
 * @param current The current complete reading or refusal.
 * @returns The current architecture and complete state catalogue.
 */
async function readingCatalogue(vault: string, current: ArchitectureModelRead) {
	if (!current.success) return current;
	const context = await readingArchive(vault);
	const retained = context === undefined ? [] : await retainedStates(context, current.manifest.id);
	return { ...current, states: stateCatalogue(current, retained) };
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
	if (selection.state === undefined && selection.against === undefined)
		return readingCatalogue(vault, current);
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
	proposalBaseline,
	decodeSubjects,
	requireModel,
	stateMetadata,
};
