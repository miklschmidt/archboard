import { isDeepStrictEqual } from "node:util";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { StateLineageSchema } from "#shared/schemas/model-definitions.ts";
import {
	LifecycleSchema,
	ProposalSchema,
	SelectedStateSchema,
} from "#shared/schemas/model-proposals.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import { readCurrentModel, decodeModel } from "#runtime/operations/read/model-read.ts";
import { candidateInputs, changedFiles } from "#runtime/operations/model-edit/candidate.ts";
import { claimableSubjects, requireSubjectClaim } from "#runtime/operations/model-edit/claims.ts";
import { affectedSubjects } from "#runtime/operations/proposals/family.ts";
import { proposalDependencies, retainBaseline } from "#runtime/operations/proposals/candidate.ts";
import { requireModel } from "#runtime/operations/proposals/read.ts";
import { archiveContext } from "#runtime/store/model-archive.ts";
import { retainedStates } from "#runtime/operations/history/states.ts";
import { comparisonOf } from "#runtime/operations/proposals/compare.ts";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";

type Request = Extract<ArchitectureModuleEdit, { proposal: unknown }> & {
	proposal: Extract<
		Extract<ArchitectureModuleEdit, { proposal: unknown }>["proposal"],
		{ type: "adopt" | "shelve" }
	>;
};

/**
 * Find the settled non-draft predecessor without changing ancestry.
 * @param current The complete current architecture.
 * @param proposal The selected active proposal.
 * @returns The first non-draft predecessor identity.
 */
function settledBase(current: ArchitectureModel, proposal: ArchitectureModel["proposals"][number]) {
	const visited = new Set<string>();
	let at = proposal;
	for (;;) {
		if (visited.has(at.id))
			throw new ArchiveError("MODEL_INVALID", "Proposal ancestry contains a cycle.");
		visited.add(at.id);
		if (at.standing !== undefined)
			throw new ArchiveError(
				"PROPOSAL_BLOCKED",
				"Settle this proposal and its ancestors before adoption.",
				at.file,
				[at.id],
			);
		const parent = current.proposals.find((state) => state.id === at.predecessor);
		if (parent === undefined) return at.predecessor;
		at = parent;
	}
}

/**
 * Require the exact explicit current comparison before forced replacement.
 * @param current The current architecture and exact observed revision.
 * @param selected The complete resolved proposal.
 * @param comparison The caller's captured comparison.
 */
function requireComparison(
	current: ArchitectureModel,
	selected: ArchitectureModel,
	comparison: ArchitectureModel["comparison"],
) {
	const expected = {
		reason: "explicit",
		against: current.selectedState,
		revision: current.revision,
		subjects: comparisonOf(current, selected),
	};
	if (current.selectedState === null || !sameSemanticValue(comparison, expected))
		throw new ArchiveError(
			"COMPARISON_REQUIRED",
			"Forced adoption requires the complete fresh explicit comparison against current.",
		);
}

/**
 * Identify a displaced current state at the root of settled draft ancestry.
 * @param vault The addressed vault.
 * @param current The current architecture.
 * @param base The settled non-draft predecessor.
 * @returns The displaced predecessor, when present.
 */
async function supersededAncestor(vault: string, current: ArchitectureModel, base: string | null) {
	if (base === null || base === current.manifest.current?.id) return undefined;
	const states = await retainedStates(await archiveContext(vault), current.manifest.id);
	return states.find((state) => state.id === base && state.lifecycle === "historical");
}

/**
 * Refuse superseded adoption and validate explicit forced intent.
 * @param vault The addressed vault.
 * @param request The complete lifecycle intent.
 * @param current The current architecture.
 * @param selected The complete resolved proposal.
 * @param proposal The active proposal document.
 */
async function requireAdoption(
	vault: string,
	request: Request,
	current: ArchitectureModel,
	selected: ArchitectureModel,
	proposal: ArchitectureModel["proposals"][number],
) {
	if (request.proposal.type !== "adopt") return;
	const base = settledBase(current, proposal);
	if (request.proposal.force === true) {
		requireComparison(current, selected, request.proposal.comparison);
		return;
	}
	const superseded = await supersededAncestor(vault, current, base);
	if (superseded !== undefined)
		throw new ArchiveError(
			"PROPOSAL_SUPERSEDED",
			"This proposal follows a superseded current state. Read an explicit comparison against current before forced adoption.",
			proposal.file,
			[proposal.id, superseded.id],
		);
}

/**
 * Require one active proposal and a separate lifecycle intent.
 * @param request The complete lifecycle intent.
 * @param selected The selected draft.
 * @returns Its active authored document.
 */
function activeProposal(request: Request, selected: ArchitectureModel) {
	if (request.changes.length > 0)
		throw new ArchiveError(
			"MODEL_INVALID",
			"Lifecycle intents accept no accompanying content changes.",
		);
	const existing = selected.proposals.find((proposal) => proposal.id === request.target.state);
	if (existing === undefined)
		throw new ArchiveError("TARGET_CHANGED", "Select an active draft before adoption or shelving.");
	return existing;
}

/**
 * Record only the selected state's own lineage and lifecycle metadata.
 * @param request The complete lifecycle intent.
 * @param current The current designation.
 * @param proposal The final compact proposal.
 * @returns The completed state metadata and timestamp.
 */
function completedSelection(
	request: Request,
	current: ArchitectureModel,
	proposal: ArchitectureModel["proposals"][number],
) {
	const adopting = request.proposal.type === "adopt";
	const at = new Date().toISOString();
	const selection = SelectedStateSchema.parse({
		...SelectedStateSchema.strip().parse(proposal),
		lifecycle: adopting ? "current" : "shelved",
		...(adopting ? { adoptedAt: at } : { shelvedAt: at }),
		reason: request.proposal.reason,
		previousCurrent: current.manifest.current?.id ?? null,
		standing: undefined,
	});
	return { at, selection };
}

/**
 * Materialize complete adopted inputs or retain unchanged current inputs for shelving.
 * @param captured The exact before images.
 * @param current The current complete architecture.
 * @param selected The complete resolved proposal.
 * @param selection The completed state metadata.
 * @param proposal The final compact proposal.
 * @returns The complete candidate inputs and affected subjects.
 */
function lifecycleInputs(
	captured: ReturnType<typeof readModelFiles>,
	current: ArchitectureModel,
	selected: ArchitectureModel,
	selection: ArchitectureModel["selectedState"],
	proposal: ArchitectureModel["proposals"][number],
) {
	if (selection?.lifecycle !== "current")
		return { inputs: new Map(captured.inputs), subjects: new Set<string>() };
	const model = {
		...selected,
		manifest: { ...selected.manifest, current: StateLineageSchema.strip().parse(selection) },
	};
	const inputs = candidateInputs(captured, current, model);
	if (!isDeepStrictEqual(current.policy, selected.policy))
		inputs.set(".archboard/config.yaml", Buffer.from(Bun.YAML.stringify(selected.policy)));
	return { inputs, subjects: affectedSubjects(current, model, proposal) };
}

/**
 * Retain the complete prior current reading before its designation can change.
 * @param vault The addressed vault.
 * @param request The complete lifecycle intent.
 * @param current The current complete architecture.
 * @returns The prior state and its exact checkpoint, or absence for planning.
 */
async function previousCurrent(vault: string, request: Request, current: ArchitectureModel) {
	if (current.selectedState === null) return null;
	return {
		state: current.selectedState,
		checkpoint: await retainBaseline(vault, request, current, current.selectedState),
	};
}

/**
 * Complete one proposal through the existing candidate and durable installation owners.
 * @param vault The explicit vault.
 * @param request The complete lifecycle intent.
 * @param selected The complete selected proposal.
 * @param captured The exact before images.
 * @returns Its checked lifecycle candidate.
 */
async function lifecycleCandidate(
	vault: string,
	request: Request,
	selected: ArchitectureModel,
	captured: ReturnType<typeof readModelFiles>,
) {
	const existing = activeProposal(request, selected);
	const proposal = ProposalSchema.strip().parse(existing);
	const current = requireModel(readCurrentModel(vault));
	await requireAdoption(vault, request, current, selected, existing);
	const { at, selection } = completedSelection(request, current, existing);
	const { inputs, subjects } = lifecycleInputs(captured, current, selected, selection, existing);
	const known = new Set([...claimableSubjects(selected), ...claimableSubjects(current)]);
	const scopes = [current.manifest.id, proposal.id, ...[...subjects].filter((id) => known.has(id))];
	requireSubjectClaim(vault, request, scopes);
	const previous = await previousCurrent(vault, request, current);
	inputs.delete(existing.file);
	const revision = modelRevision(inputs);
	const checked = requireModel(decodeModel({ inputs, revision, diagnostics: [] }));
	return {
		success: true as const,
		current: selected,
		model: selection.lifecycle === "current" ? checked : selected,
		inputs,
		revision,
		files: changedFiles(captured.inputs, inputs),
		subjects: [...subjects],
		scopes,
		selection,
		dependencies: [
			...proposalDependencies(proposal),
			...(previous === null ? [] : [previous.checkpoint]),
		],
		lifecycle: LifecycleSchema.parse({
			type: request.proposal.type,
			at,
			reason: request.proposal.reason,
			proposal,
			previous,
		}),
	};
}

export { lifecycleCandidate };
