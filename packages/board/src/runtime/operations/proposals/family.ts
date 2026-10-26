import type { ArchitectureModel } from "#shared/schemas/model.ts";
import {
	SelectedStateSchema,
	ProposalSchema,
	FamilyStandingSchema,
} from "#shared/schemas/model-proposals.ts";
import { decodeModel } from "#runtime/operations/read/model-read.ts";
import {
	resolveState,
	proposalBaseline,
	decodeProposal,
	predecessorRevision,
	requireModel,
} from "#runtime/operations/proposals/read.ts";
import {
	retainBaseline,
	updateChanges,
	proposalDependencies,
} from "#runtime/operations/proposals/candidate.ts";
import { reconcileModels } from "#runtime/operations/proposals/reconcile.ts";
import { subjectsOf } from "#runtime/operations/proposals/subjects.ts";
import { claimableSubjects, requireSubjectClaim } from "#runtime/operations/model-edit/claims.ts";
import { includeContainment } from "#runtime/operations/model-edit/containment.ts";
import { readEntries, includeAffected } from "#runtime/operations/model-edit/flow-state.ts";
import { changedFiles, type initialCandidate } from "#runtime/operations/model-edit/candidate.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import { archiveContext, ArchiveError } from "#runtime/store/model-archive.ts";
import { isDeepStrictEqual } from "node:util";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import type { z } from "zod";
type Candidate = Extract<Awaited<ReturnType<typeof initialCandidate>>, { success: true }>;
type Proposal = z.infer<typeof ProposalSchema>;
type Standing = NonNullable<Proposal["standing"]>;
type Family = {
	vault: string;
	request: ArchitectureModuleEdit;
	context: Awaited<ReturnType<typeof archiveContext>>;
	model: ArchitectureModel;
	inputs: Map<string, Buffer>;
	scopes: Set<string>;
	subjects: Set<string>;
	dependencies: Set<string>;
	visited: Set<string>;
	known: Set<string>;
	reconciliations: z.infer<typeof FamilyStandingSchema>;
};
/**
 * Retain unresolved issues while updating the predecessor values they describe.
 * @param previous The durable previous issues.
 * @param next The latest semantic disagreements.
 * @returns Every issue that still needs an explicit answer.
 */
function standingIssues(
	previous: Standing["issues"],
	next: Standing["issues"],
): Standing["issues"] {
	return [
		...new Map(
			[...previous, ...next].map((issue) => [
				JSON.stringify([issue.subject, issue.kind, issue.field]),
				issue,
			]),
		).values(),
	];
}
/**
 * Preserve the original baseline while this state waits on a decision.
 * @param family The complete operation context.
 * @param proposal The mutable following draft.
 * @param parent The selected new predecessor.
 * @param issues The standing semantic disagreements.
 * @returns Its durable standing.
 */
function standingOf(
	family: Family,
	proposal: Proposal,
	parent: NonNullable<ArchitectureModel["selectedState"]>,
	issues: Standing["issues"],
): Standing {
	return {
		against: parent.id,
		baseline: proposal.baseline,
		atRevision: proposal.standing?.atRevision ?? family.request.expectedRevision.digest,
		issues,
	};
}
/**
 * Reconcile one unblocked proposal and retain its next immutable baseline only when settled.
 * @param family The complete operation context.
 * @param proposal The mutable compact draft.
 * @param base The original retained predecessor.
 * @param mine The coherent proposal side.
 * @param parent The complete new predecessor.
 * @returns Its coherent new reading.
 */
async function advanceProposal(
	family: Family,
	proposal: Proposal,
	base: ArchitectureModel,
	mine: ArchitectureModel,
	parent: ArchitectureModel,
) {
	const merged = reconcileModels(base, mine, parent);
	const next = { ...requireModel(merged.result), proposals: family.model.proposals };
	const issues = standingIssues(proposal.standing?.issues ?? [], merged.issues);
	if (issues.length > 0) {
		proposal.standing = standingOf(family, proposal, parent.selectedState!, issues);
		updateChanges(proposal, base, next);
	} else {
		delete proposal.standing;
		proposal.baseline = await retainBaseline(family.vault, family.request, parent, proposal);
		proposal.predecessorRevision = predecessorRevision(parent);
		updateChanges(proposal, parent, next);
	}
	return next;
}
/**
 * Include the same containment and flow claim closure as ordinary edits.
 * @param before The coherent old draft.
 * @param after The coherent new draft.
 * @param subjects The changed and disputed subject identities.
 */
function includeClosure(
	before: ArchitectureModel,
	after: ArchitectureModel,
	subjects: Set<string>,
): void {
	includeContainment(before.modules, after.modules, subjects);
	for (const model of [before, after]) {
		const flows = model.collections.flatMap((collection) => collection.flows);
		const entries = readEntries(flows);
		for (const id of subjects) includeAffected(entries, flows, id, subjects);
	}
}
/**
 * Collect all changed subjects and standing issues before claiming installation.
 * @param before The coherent old draft.
 * @param after The coherent new draft.
 * @param proposal The complete following proposal.
 * @returns The complete affected subject closure.
 */
function affectedSubjects(
	before: ArchitectureModel,
	after: ArchitectureModel,
	proposal: Proposal,
): Set<string> {
	const left = subjectsOf(before),
		right = subjectsOf(after);
	const changed = new Set(
		[...new Set([...left.keys(), ...right.keys()])].filter(
			(id) => !isDeepStrictEqual(left.get(id), right.get(id)),
		),
	);
	for (const issue of proposal.standing?.issues ?? [])
		if (issue.subject.includes("#")) changed.add(issue.subject);
	includeClosure(before, after, changed);
	return changed;
}
/**
 * Add one changed draft to the same file transaction and receipt.
 * @param family The complete operation context.
 * @param existing The original authored proposal and path.
 * @param proposal The reconciled compact proposal.
 * @param mine The old proposal reading.
 * @param next The reconciled proposal reading.
 */
function recordProposal(
	family: Family,
	existing: ArchitectureModel["proposals"][number],
	proposal: Proposal,
	mine: ArchitectureModel,
	next: ArchitectureModel,
): void {
	for (const dependency of proposalDependencies(proposal)) family.dependencies.add(dependency);
	if (isDeepStrictEqual(ProposalSchema.strip().parse(existing), proposal)) return;
	family.scopes.add(proposal.id);
	for (const id of affectedSubjects(mine, next, proposal)) {
		family.subjects.add(id);
		if (family.known.has(id)) family.scopes.add(id);
	}
	family.inputs.set(existing.file, Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`));
	family.model.proposals[family.model.proposals.findIndex((entry) => entry.id === proposal.id)] = {
		...proposal,
		file: existing.file,
	};
	family.reconciliations.push({ state: proposal.id, standing: proposal.standing });
}
/**
 * Bring one child forward or mark it blocked behind the nearest unsettled ancestor.
 * @param family The complete operation context.
 * @param existing The original authored child.
 * @param parent The complete new predecessor.
 * @returns The coherent following reading.
 */
async function reconcileChild(
	family: Family,
	existing: ArchitectureModel["proposals"][number],
	parent: ArchitectureModel,
) {
	if (family.visited.has(existing.id))
		throw new ArchiveError("MODEL_INVALID", "Proposal ancestry contains a cycle.");
	family.visited.add(existing.id);
	const proposal = ProposalSchema.strip().parse(existing);
	const base = requireModel(await proposalBaseline(family.context, family.model, proposal));
	const mine = requireModel(decodeProposal(base, proposal, family.model));
	family.known = new Set([...family.known, ...subjectsOf(mine).keys()]);
	const state = parent.selectedState!;
	let next = mine;
	if (state.standing === undefined)
		next = await advanceProposal(family, proposal, base, mine, parent);
	else
		proposal.standing = {
			...standingOf(family, proposal, state, proposal.standing?.issues ?? []),
			blockedBy: state.standing.blockedBy ?? state.id,
		};
	recordProposal(family, existing, proposal, mine, next);
	return { ...next, selectedState: SelectedStateSchema.strip().parse(proposal) };
}
/**
 * Reconcile parents before children within the same operation candidate.
 * @param family The complete operation context.
 * @param parent The complete new predecessor.
 */
async function descend(family: Family, parent: ArchitectureModel): Promise<void> {
	if (parent.selectedState === null) return;
	for (const existing of family.model.proposals.filter(
		(proposal) => proposal.predecessor === parent.selectedState!.id,
	)) {
		// oxlint-disable-next-line no-await-in-loop -- each child's standing decides whether its descendants can reconcile
		const next = await reconcileChild(family, existing, parent);
		// oxlint-disable-next-line no-await-in-loop -- parent results must exist before descendants inspect them
		await descend(family, next);
	}
}
/**
 * Create the single candidate context for all following states.
 * @param vault The explicitly addressed vault.
 * @param request The original architectural intent.
 * @param candidate The complete edited predecessor.
 * @returns The family context behind the existing transaction.
 */
async function openFamily(
	vault: string,
	request: ArchitectureModuleEdit,
	candidate: Candidate,
): Promise<Family> {
	const selected = candidate.selection;
	return {
		vault,
		request,
		context: await archiveContext(vault),
		model: requireModel(
			decodeModel({ inputs: candidate.inputs, revision: candidate.revision, diagnostics: [] }),
		),
		inputs: candidate.inputs,
		scopes: new Set(candidate.scopes),
		subjects: new Set(candidate.subjects),
		dependencies: new Set(candidate.dependencies),
		visited: new Set(),
		known: claimableSubjects(candidate.current),
		reconciliations:
			selected?.lifecycle === "draft" ? [{ state: selected.id, standing: selected.standing }] : [],
	};
}
/**
 * Publish the predecessor and following drafts through one durable installation.
 * @param vault The addressed vault.
 * @param request The complete original architectural intent.
 * @param captured The exact original files.
 * @param candidate The complete edited predecessor.
 * @returns The checked family result and its retained standing.
 */
async function familyCandidate(
	vault: string,
	request: ArchitectureModuleEdit,
	captured: ReturnType<typeof readModelFiles>,
	candidate: Candidate,
) {
	const family = await openFamily(vault, request, candidate);
	if (!("proposal" in request && request.proposal.type === "create")) {
		const parent = requireModel(
			await resolveState(family.context, family.model, request.target.state ?? "current"),
		);
		await descend(family, parent);
	}
	requireSubjectClaim(vault, request, [...family.scopes]);
	const revision = modelRevision(family.inputs);
	requireModel(decodeModel({ inputs: family.inputs, revision, diagnostics: [] }));
	return {
		...candidate,
		revision,
		files: changedFiles(captured.inputs, family.inputs),
		subjects: [...family.subjects],
		scopes: [...family.scopes],
		dependencies: [...family.dependencies],
		reconciliations: family.reconciliations,
	};
}
export { familyCandidate, includeClosure, affectedSubjects };
