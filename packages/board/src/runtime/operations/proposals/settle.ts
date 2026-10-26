import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { ProposalSchema, SelectedStateSchema } from "#shared/schemas/model-proposals.ts";
import { archiveContext, ArchiveError } from "#runtime/store/model-archive.ts";
import { readCurrentModel } from "#runtime/operations/read/model-read.ts";
import { ModelIssueSchema } from "#shared/schemas/model-proposals.ts";
import { readModelFiles } from "#runtime/store/model-files.ts";
import {
	requireModel,
	resolveState,
	decodeSubjects,
	predecessorRevision,
} from "#runtime/operations/proposals/read.ts";
import { subjectsOf, type Subjects } from "#runtime/operations/proposals/subjects.ts";
import {
	proposalDependencies,
	retainBaseline,
	updateChanges,
	decodedDraft,
	proposalInputs,
} from "#runtime/operations/proposals/candidate.ts";
import { applyStructure } from "#runtime/operations/model-edit/structure.ts";
import { claimableSubjects, requireSubjectClaim } from "#runtime/operations/model-edit/claims.ts";
import { changedFiles } from "#runtime/operations/model-edit/candidate.ts";
import { includeClosure, affectedSubjects } from "#runtime/operations/proposals/family.ts";
import type { z } from "zod";
type Issue = z.infer<typeof ModelIssueSchema>;
type Resolution = Extract<
	Extract<ArchitectureModuleEdit, { proposal: unknown }>["proposal"],
	{ type: "settle" }
>["resolutions"][number];
/**
 * Match an explicit subject and optional field without settling unrelated issues.
 * @param resolution The caller's choice.
 * @param issue The standing disagreement.
 * @returns Whether the choice covers this issue.
 */
function matches(resolution: Resolution, issue: Issue) {
	return (
		resolution.subject === issue.subject &&
		(resolution.field === undefined || resolution.field === issue.field)
	);
}
/**
 * Copy one holder's complete subtree from an explicit side.
 * @param result The mutable intended subjects.
 * @param source The side explicitly selected.
 * @param id The subject or holder identity.
 */
function takeSubject(result: Subjects, source: Subjects, id: string): void {
	const children = new Set(
		[...result, ...source]
			.filter(([, entry]) => entry.placement?.holder === id)
			.map(([key]) => key),
	);
	const entry = source.get(id);
	if (entry === undefined) result.delete(id);
	else result.set(id, structuredClone(entry));
	for (const child of children) takeSubject(result, source, child);
}
/**
 * Take one disputed value through the same canonical subject representation.
 * @param result The intended subjects.
 * @param theirs The coherent predecessor side.
 * @param issue The exact issue that the caller settles.
 */
function takeTheirs(result: Subjects, theirs: Subjects, issue: Issue): void {
	const source = theirs.get(issue.subject),
		mine = result.get(issue.subject);
	if (
		issue.kind !== "competing-field" ||
		mine === undefined ||
		source === undefined ||
		issue.field === undefined
	) {
		takeSubject(result, theirs, issue.subject);
		return;
	}
	takeField(mine, source, issue.field);
}
/**
 * Copy only the chosen field or placement, preserving unrelated proposal fields.
 * @param mine The continuing proposal subject.
 * @param source The coherent predecessor subject.
 * @param field The exact disputed field.
 */
function takeField(
	mine: NonNullable<ReturnType<Subjects["get"]>>,
	source: NonNullable<ReturnType<Subjects["get"]>>,
	field: string,
): void {
	if (["parent", "from", "collection", "within", "flow"].includes(field)) {
		if (source.placement === undefined) delete mine.placement;
		else mine.placement = structuredClone(source.placement);
		return;
	}
	const value = source.value[field];
	if (value === undefined) delete mine.value[field];
	else mine.value[field] = structuredClone(value);
}

type SettlementRequest = Extract<ArchitectureModuleEdit, { proposal: unknown }> & {
	proposal: Extract<
		Extract<ArchitectureModuleEdit, { proposal: unknown }>["proposal"],
		{ type: "settle" }
	>;
};
/**
 * Require a draft with explicit issues to settle.
 * @param current The selected coherent reading.
 * @returns Its authored proposal, durable issues and continuing metadata.
 */
function settlementProposal(current: ArchitectureModel) {
	const existing = current.proposals.find((proposal) => proposal.id === current.selectedState?.id);
	if (existing?.standing === undefined || existing.standing.issues.length === 0)
		throw new ArchiveError("MODEL_INVALID", "Select a proposal with standing issues.");
	return {
		existing,
		issues: existing.standing.issues,
		proposal: ProposalSchema.strip().parse(existing),
	};
}
/**
 * Resolve the actual predecessor independently of the selected draft contents.
 * @param vault The explicitly addressed vault.
 * @param proposal The selected compact draft.
 * @returns The settled complete predecessor.
 */
async function settlementPredecessor(vault: string, proposal: z.infer<typeof ProposalSchema>) {
	const context = await archiveContext(vault);
	const predecessor = requireModel(
		await resolveState(
			context,
			requireModel(readCurrentModel(vault)),
			proposal.predecessor ?? "current",
		),
	);
	if (predecessor.selectedState?.standing !== undefined)
		throw new ArchiveError("PROPOSAL_BLOCKED", "Settle the ancestor first.", "model.json", [
			predecessor.selectedState.id,
		]);
	return predecessor;
}
/**
 * Require a complete, unambiguous choice for every issue before changing subjects.
 * @param issues The durable issues.
 * @param resolutions The caller's explicit decisions.
 */
function requireCompleteChoices(issues: Issue[], resolutions: Resolution[]): void {
	const remaining = issues.filter(
		(issue) => !resolutions.some((resolution) => matches(resolution, issue)),
	);
	if (remaining.length > 0)
		throw new ArchiveError(
			"MODEL_INVALID",
			"Resolve every standing issue in one settlement.",
			"model.json",
			remaining.map((issue) => issue.subject),
		);
	for (const issue of issues)
		if (resolutions.filter((resolution) => matches(resolution, issue)).length !== 1)
			throw new ArchiveError(
				"MODEL_INVALID",
				"Give each standing issue exactly one choice.",
				"model.json",
				[issue.subject],
			);
}
/**
 * Apply each explicit predecessor choice without interpreting ordinary edits as settlement.
 * @param subjects The mutable intended subjects.
 * @param predecessor The complete settled predecessor.
 * @param issues The durable disagreements.
 * @param resolutions The caller's complete choices.
 */
function applyResolutions(
	subjects: Subjects,
	predecessor: ArchitectureModel,
	issues: Issue[],
	resolutions: Resolution[],
): void {
	requireCompleteChoices(issues, resolutions);
	const theirs = subjectsOf(predecessor);
	for (const resolution of resolutions) {
		const covered = issues.filter((issue) => matches(resolution, issue));
		if (covered.length === 0)
			throw new ArchiveError(
				"MODEL_INVALID",
				"A resolution names no standing issue.",
				"model.json",
				[resolution.subject],
			);
		if (resolution.take === "theirs")
			for (const issue of covered) takeTheirs(subjects, theirs, issue);
	}
}
/**
 * Keep retained proof for every continuing subject deleted by its predecessor.
 * @param proposal The mutable compact draft.
 * @param predecessor The complete settled predecessor.
 * @param subjects The explicitly resolved subjects.
 */
function preserveRestorations(
	proposal: z.infer<typeof ProposalSchema>,
	predecessor: ArchitectureModel,
	subjects: Subjects,
): void {
	const proofs = new Map((proposal.restorations ?? []).map((proof) => [proof.subject, proof]));
	for (const subject of (predecessor.manifest.retiredIds ?? []).filter(
		(id) => subjects.has(id) && !proofs.has(id),
	))
		proofs.set(subject, { subject, checkpoint: proposal.baseline });
	if (proofs.size > 0) proposal.restorations = [...proofs.values()];
}
/**
 * Retain the settled predecessor and derive the exact continuing compact proposal.
 * @param vault The addressed vault.
 * @param request The complete settlement request.
 * @param proposal The mutable compact draft.
 * @param predecessor The complete settled predecessor.
 * @param edited The caller's third-answer candidate.
 * @param subjects The explicitly resolved subjects.
 * @returns The complete coherent settled draft.
 */
async function rebaseSettlement(
	vault: string,
	request: SettlementRequest,
	proposal: z.infer<typeof ProposalSchema>,
	predecessor: ArchitectureModel,
	edited: ArchitectureModel,
	subjects: Subjects,
) {
	preserveRestorations(proposal, predecessor, subjects);
	delete proposal.standing;
	const retiredIds = [
		...new Set([...(predecessor.manifest.retiredIds ?? []), ...(edited.manifest.retiredIds ?? [])]),
	].filter((id) => !subjects.has(id));
	const settled = requireModel(
		decodeSubjects(
			{ ...predecessor, manifest: { ...predecessor.manifest, retiredIds } },
			subjects,
			SelectedStateSchema.strip().parse(proposal),
		),
	);
	proposal.baseline = await retainBaseline(vault, request, predecessor, proposal);
	proposal.predecessorRevision = predecessorRevision(predecessor);
	updateChanges(proposal, predecessor, settled);
	return settled;
}
/**
 * Include explicit decisions and their ordinary containment and flow scope.
 * @param current The old coherent draft.
 * @param settled The final coherent draft.
 * @param proposal The continuing compact proposal.
 * @param request The complete settlement request.
 * @returns Existing subjects that the caller must claim.
 */
function settlementSubjects(
	current: ArchitectureModel,
	settled: ArchitectureModel,
	proposal: z.infer<typeof ProposalSchema>,
	request: SettlementRequest,
) {
	const subjects = affectedSubjects(current, settled, proposal);
	for (const resolution of request.proposal.resolutions) subjects.add(resolution.subject);
	includeClosure(current, settled, subjects);
	return subjects;
}
/**
 * Settle a complete proposal and leave family propagation to the same candidate owner.
 * @param vault The addressed vault.
 * @param request The complete settlement intent.
 * @param current The selected coherent draft.
 * @param captured The exact before images.
 * @returns The checked candidate before durable installation.
 */
async function settleCandidate(
	vault: string,
	request: SettlementRequest,
	current: ArchitectureModel,
	captured: ReturnType<typeof readModelFiles>,
) {
	const { existing, issues, proposal } = settlementProposal(current);
	const predecessor = await settlementPredecessor(vault, proposal);
	const structure = applyStructure(current, request, captured.inputs.keys());
	const edited = requireModel(decodedDraft(current, structure, proposal));
	const subjects = subjectsOf(edited);
	applyResolutions(subjects, predecessor, issues, request.proposal.resolutions);
	const settled = await rebaseSettlement(vault, request, proposal, predecessor, edited, subjects);
	const affected = settlementSubjects(current, settled, proposal, request);
	const known = claimableSubjects(current);
	const scopes = [
		...new Set([
			current.manifest.id,
			proposal.id,
			...structure.scopes,
			...[...affected].filter((id) => known.has(id)),
		]),
	];
	requireSubjectClaim(vault, request, scopes);
	const candidate = proposalInputs(captured, proposal, existing);
	requireModel(candidate.raw);
	return {
		success: true as const,
		current,
		inputs: candidate.inputs,
		revision: candidate.revision,
		files: changedFiles(captured.inputs, candidate.inputs),
		subjects: [...affected].filter((id) => id.includes("#")),
		scopes,
		selection: SelectedStateSchema.strip().parse(proposal),
		dependencies: proposalDependencies(proposal),
	};
}
export { settleCandidate };
