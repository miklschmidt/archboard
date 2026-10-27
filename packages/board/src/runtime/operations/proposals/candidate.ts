import type { z } from "zod";
import { StateMetadataSchema } from "#shared/schemas/model-definitions.ts";
import { captureReferencePins } from "#runtime/operations/history/reference-pins.ts";
import { SelectedStateSchema } from "#shared/schemas/model-proposals.ts";
import { mintId } from "#shared/rules/ids.ts";
import { assignFields } from "#runtime/operations/model-edit/fields.ts";
import type { applyStructure } from "#runtime/operations/model-edit/structure.ts";
import {
	candidateInputs,
	changedFiles,
	applyCandidateStructure,
} from "#runtime/operations/model-edit/candidate.ts";
import { requireSubjectClaim } from "#runtime/operations/model-edit/claims.ts";
import { decodeModel } from "#runtime/operations/read/model-read.ts";
import { exactReading } from "#runtime/operations/history/read.ts";
import {
	materializedInputs,
	predecessorRevision,
	decodeProposal,
} from "#runtime/operations/proposals/read.ts";
import { compactChanges } from "#runtime/operations/proposals/subjects.ts";
import { ProposalSchema } from "#shared/schemas/model-proposals.ts";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import {
	ArchiveError,
	archiveContext,
	archiveTip,
	assertArchiveWritable,
	archiveCommit,
	tree,
	captureSource,
	CheckpointRecordSchema,
} from "#runtime/store/model-archive.ts";

type Request = Extract<ArchitectureModuleEdit, { proposal: unknown }> & {
	proposal: Extract<
		Extract<ArchitectureModuleEdit, { proposal: unknown }>["proposal"],
		{ type: "create" | "edit" }
	>;
};
/**
 * Retain a complete immutable predecessor before installing a compact draft.
 * @param vault The explicit vault.
 * @param request The complete intent.
 * @param predecessor The coherent starting reading.
 * @param state The metadata for an empty planning baseline.
 * @returns The signed baseline identity.
 */
async function retainBaseline(
	vault: string,
	request: ArchitectureModuleEdit,
	predecessor: ArchitectureModel,
	state: Pick<z.infer<typeof ProposalSchema>, "id" | "name">,
) {
	const context = await archiveContext(vault);
	await assertArchiveWritable(context);
	const inputs = materializedInputs(
		predecessor,
		Buffer.from(Bun.YAML.stringify(predecessor.policy)),
	);
	const dependencies =
		predecessor.selectedState?.baseline === undefined ? [] : [predecessor.selectedState.baseline];
	const record = CheckpointRecordSchema.parse({
		schemaVersion: 1,
		kind: "checkpoint",
		vault: context.vault,
		model: predecessor.manifest.id,
		state: StateMetadataSchema.strip().parse(
			predecessor.selectedState ?? { id: state.id, name: state.name },
		),
		selection: predecessor.selectedState,
		revision: modelRevision(inputs),
		createdAt: new Date().toISOString(),
		request: {
			target: "current",
			operationId: `${request.operationId}:baseline`,
			writer: request.writer,
			doing: request.doing,
			expectedRevision: request.expectedRevision.digest,
			dependencies,
		},
		sources: await captureSource(context, predecessor, vault),
		...(await captureReferencePins(vault, predecessor)),
	});
	const files = new Map([...inputs].map(([file, bytes]) => [`inputs/${file}`, bytes]));
	files.set("record.json", Buffer.from(JSON.stringify(record)));
	const tip = await archiveTip(context);
	return archiveCommit(
		context,
		await tree(context, files),
		[...new Set([...(tip === undefined ? [] : [tip]), ...dependencies])],
		"archboard: retain proposal baseline",
	);
}
type Proposal = z.infer<typeof ProposalSchema>;
/**
 * Allocate one state identity without changing architecture subject identities.
 * @param model The coherent model.
 * @param reservations The identities retained by completed lifecycle events.
 * @returns A fresh state identity.
 */
function freshState(model: ArchitectureModel, reservations: Set<string>) {
	return mintId(
		new Set([
			...reservations,
			model.manifest.id,
			...model.proposals.map((entry) => entry.id),
			...(model.manifest.current === null ? [] : [model.manifest.current.id]),
		]),
	);
}
/**
 * Initialize metadata for a new draft or copy continuing metadata.
 * @param request The explicit proposal intent.
 * @param model The target reading.
 * @param reservations The retained state and subject identities.
 * @returns The continuing proposal and its existing location, when present.
 */
function proposalFor(request: Request, model: ArchitectureModel, reservations: Set<string>) {
	if (request.proposal.type === "create")
		return {
			proposal: ProposalSchema.parse({
				...StateMetadataSchema.omit({ id: true, formerNames: true })
					.strip()
					.parse(request.proposal),
				schemaVersion: 1,
				id: freshState(model, reservations),
				lifecycle: "draft",
				createdAt: new Date().toISOString(),
				predecessor: request.target.state,
				predecessorRevision: predecessorRevision(model),
				baseline: "0".repeat(40),
				changes: [],
			}),
			existing: undefined,
		};
	const existing = model.proposals.find((entry) => entry.id === request.target.state);
	if (existing === undefined)
		throw new ArchiveError("TARGET_CHANGED", "Select a draft state before editing its proposal.");
	const proposal = ProposalSchema.strip().parse(existing);
	const name = proposal.name;
	assignFields(proposal, request.proposal.set, request.proposal.clear);
	if (name !== proposal.name)
		proposal.formerNames = [...new Set([...(proposal.formerNames ?? []), name])];
	return { proposal, existing };
}
/**
 * Reject nonempty authored current files in a planning-only root.
 * @param request The complete caller intent.
 * @param model The target model.
 */
function requirePlanningRoot(request: Request, model: ArchitectureModel): void {
	if (request.proposal.type !== "create" || request.target.state !== null) return;
	if (model.modules.length + model.collections.length > 0)
		throw new ArchiveError(
			"MODEL_INVALID",
			"A planning-only root starts with empty current files. Add unbuilt subjects through the proposal.",
		);
}
/**
 * Decode one complete module and flow batch as a selected draft.
 * @param predecessor The selected starting state.
 * @param structure Its candidate definitions.
 * @param proposal The explicit draft metadata.
 * @returns A coherent candidate or refusal.
 */
function decodedDraft(
	predecessor: ArchitectureModel,
	structure: ReturnType<typeof applyStructure>,
	proposal: Proposal,
) {
	const start = materializedInputs(
		predecessor,
		Buffer.from(Bun.YAML.stringify(predecessor.policy)),
	);
	const inputs = candidateInputs(
		{ inputs: start, revision: modelRevision(start), diagnostics: [] },
		predecessor,
		structure,
	);
	return decodeModel(
		{ inputs, revision: modelRevision(inputs), diagnostics: [] },
		SelectedStateSchema.strip().parse(proposal),
	);
}
/**
 * Keep removed draft identities reserved without changing current files.
 * @param proposal The mutable compact draft.
 * @param baseline The immutable predecessor.
 * @param draft The complete intended draft.
 */
function updateChanges(
	proposal: Proposal,
	baseline: ArchitectureModel,
	draft: ArchitectureModel,
): void {
	proposal.changes = compactChanges(baseline, draft);
	const reserved = new Set(baseline.manifest.retiredIds);
	const retired = (draft.manifest.retiredIds ?? []).filter((id) => !reserved.has(id));
	if (retired.length > 0) proposal.retiredIds = retired;
	else delete proposal.retiredIds;
	const materialized = decodeProposal(baseline, proposal, draft);
	if (!materialized.success)
		throw new ArchiveError(
			"MODEL_INVALID",
			"The compact candidate cannot be materialized coherently.",
		);
	if (predecessorRevision(materialized) !== predecessorRevision(draft))
		throw new ArchiveError(
			"MODEL_INVALID",
			"The compact candidate does not preserve the exact intended architecture.",
		);
}
/**
 * Capture only the changed proposal file through the canonical decoder.
 * @param captured The exact addressed input files.
 * @param proposal The complete draft document.
 * @param existing The continuing proposal location, when present.
 * @returns The checked raw vault and its exact candidate inputs.
 */
function proposalInputs(
	captured: ReturnType<typeof readModelFiles>,
	proposal: Proposal,
	existing: ArchitectureModel["proposals"][number] | undefined,
) {
	const checked = ProposalSchema.parse(proposal);
	const inputs = new Map(captured.inputs);
	const file = existing?.file ?? `${proposal.id}.proposal.json`;
	if (existing === undefined && inputs.has(file))
		throw new ArchiveError("MODEL_INVALID", "A proposal path already exists.");
	inputs.set(file, Buffer.from(`${JSON.stringify(checked, null, 2)}\n`));
	const revision = modelRevision(inputs);
	return { inputs, revision, raw: decodeModel({ inputs, revision, diagnostics: [] }) };
}
/**
 * Include the proposal and model scopes with affected existing subjects.
 * @param subjects The candidate's existing subject scopes.
 * @param model The model identity scope.
 * @param existing The continuing proposal, when present.
 * @returns The complete claim scope.
 */
function proposalScopes(
	subjects: string[],
	model: string,
	existing: ArchitectureModel["proposals"][number] | undefined,
) {
	return [...new Set([...subjects, model, ...(existing === undefined ? [] : [existing.id])])];
}
/**
 * Build one compact draft behind the existing durable write operation.
 * @param vault The explicit vault.
 * @param request The complete caller intent.
 * @param predecessor The selected target reading.
 * @param captured The exact vault token and bytes.
 * @returns One checked file delta and retained dependency closure.
 */
async function proposalCandidate(
	vault: string,
	request: Request,
	predecessor: ArchitectureModel,
	captured: ReturnType<typeof readModelFiles>,
) {
	requirePlanningRoot(request, predecessor);
	const structure = await applyCandidateStructure(
		vault,
		predecessor,
		request,
		captured.inputs.keys(),
	);
	const { proposal, existing } = proposalFor(request, predecessor, structure.reservations);
	const baseline =
		existing === undefined
			? predecessor
			: await exactReading(
					await archiveContext(vault),
					proposal.baseline,
					undefined,
					undefined,
					false,
				);
	if (!baseline.success) return baseline;
	const draft = decodedDraft(predecessor, structure, proposal);
	if (!draft.success) return draft;
	const scopes = proposalScopes(structure.scopes, predecessor.manifest.id, existing);
	requireSubjectClaim(vault, request, scopes);
	updateChanges(proposal, baseline, draft);
	if (existing === undefined) {
		proposal.baseline = await retainBaseline(vault, request, predecessor, proposal);
		blockNewProposal(proposal, predecessor, request);
	}
	const candidate = proposalInputs(captured, proposal, existing);
	if (!candidate.raw.success) return candidate.raw;
	return {
		success: true as const,
		current: predecessor,
		model: draft,
		inputs: candidate.inputs,
		revision: candidate.revision,
		files: changedFiles(captured.inputs, candidate.inputs),
		subjects: structure.subjects,
		scopes,
		selection: SelectedStateSchema.strip().parse(proposal),
		dependencies: proposalDependencies(proposal),
	};
}
/**
 * Expose inherited waiting as soon as a dependent draft exists.
 * @param proposal The newly retained compact draft.
 * @param predecessor The coherent but possibly unsettled predecessor.
 * @param request The complete creation intent.
 */
function blockNewProposal(
	proposal: Proposal,
	predecessor: ArchitectureModel,
	request: Request,
): void {
	const parent = predecessor.selectedState;
	if (parent?.standing === undefined) return;
	proposal.standing = {
		against: parent.id,
		baseline: proposal.baseline,
		atRevision: request.expectedRevision.digest,
		issues: [],
		blockedBy: parent.standing.blockedBy ?? parent.id,
	};
}
/**
 * Name all immutable inputs required to materialize this proposal.
 * @param proposal The continuing compact document.
 * @returns Retained dependency identities.
 */
function proposalDependencies(proposal: Proposal) {
	return [proposal.baseline, ...(proposal.restorations ?? []).map((proof) => proof.checkpoint)];
}
/**
 * Start an explicit external-edit reconciliation without another predecessor edit.
 * @param current The coherent predecessor.
 * @param captured The exact before images.
 * @param changes The number of accompanying statements.
 * @returns The unchanged predecessor candidate for family propagation.
 */
function reconciliationCandidate(
	current: ArchitectureModel,
	captured: ReturnType<typeof readModelFiles>,
	changes: number,
) {
	if (changes > 0)
		throw new ArchiveError("MODEL_INVALID", "Reconcile accepts no accompanying changes.");
	return {
		success: true as const,
		current,
		model: current,
		inputs: captured.inputs,
		revision: captured.revision,
		files: [],
		subjects: [],
		scopes: [current.manifest.id],
		selection: current.selectedState ?? undefined,
		dependencies: [],
	};
}
/**
 * Adapt proposal intent inside the existing candidate owner.
 * @param vault The addressed vault.
 * @param request The complete proposal intent.
 * @param current The coherent target.
 * @param captured The complete before images.
 * @returns One predecessor candidate.
 */
async function proposalIntentCandidate(
	vault: string,
	request: Extract<ArchitectureModuleEdit, { proposal: unknown }>,
	current: ArchitectureModel,
	captured: ReturnType<typeof readModelFiles>,
) {
	if (request.proposal.type === "reconcile")
		return reconciliationCandidate(current, captured, request.changes.length);
	if (request.proposal.type === "settle") {
		const { settleCandidate } = await import("#runtime/operations/proposals/settle.ts");
		return settleCandidate(vault, { ...request, proposal: request.proposal }, current, captured);
	}
	if (request.proposal.type === "adopt" || request.proposal.type === "shelve") {
		const { lifecycleCandidate } = await import("#runtime/operations/proposals/lifecycle.ts");
		return lifecycleCandidate(vault, { ...request, proposal: request.proposal }, current, captured);
	}
	return proposalCandidate(vault, { ...request, proposal: request.proposal }, current, captured);
}
export {
	proposalDependencies,
	proposalIntentCandidate,
	proposalCandidate,
	retainBaseline,
	updateChanges,
	decodedDraft,
	proposalInputs,
};
