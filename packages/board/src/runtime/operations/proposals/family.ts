import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
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
} from "#runtime/operations/proposals/read.ts";
import { retainBaseline, updateChanges } from "#runtime/operations/proposals/candidate.ts";
import { reconcileModels } from "#runtime/operations/proposals/reconcile.ts";
import { subjectsOf } from "#runtime/operations/proposals/subjects.ts";
import { requireSubjectClaim } from "#runtime/operations/model-edit/claims.ts";
import { changedFiles } from "#runtime/operations/model-edit/candidate.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import { archiveContext, ArchiveError } from "#runtime/store/model-archive.ts";
import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";

type Candidate = {
	success: true;
	current: ArchitectureModel;
	inputs: Map<string, Buffer>;
	revision: ArchitectureModel["revision"];
	subjects: string[];
	scopes: string[];
	selection: ArchitectureModel["selectedState"] | undefined;
	dependencies: string[];
};
/**
 * Publish a predecessor and its following drafts as one checked candidate.
 * @param vault The addressed vault.
 * @param request The original complete intent.
 * @param captured The exact before images.
 * @param candidate The edited predecessor candidate.
 * @returns One complete family installation and retained standing.
 */
async function familyCandidate(
	vault: string,
	request: ArchitectureModuleEdit,
	captured: ReturnType<typeof readModelFiles>,
	candidate: Candidate,
) {
	const context = await archiveContext(vault);
	const inputs = candidate.inputs;
	const scopes = new Set(candidate.scopes),
		subjects = new Set(candidate.subjects),
		dependencies = new Set(candidate.dependencies);
	const reconciliations: z.infer<typeof FamilyStandingSchema> = [];
	let catalogue = decodeModel({ inputs, revision: modelRevision(inputs), diagnostics: [] });
	if (!catalogue.success) return catalogue;
	const model = catalogue;
	const visited = new Set<string>();
	/**
	 * Reconcile children only after their predecessor result is known.
	 * @param parent The complete new predecessor.
	 */
	async function descend(parent: ArchitectureModel): Promise<void> {
		const parentId = parent.selectedState?.id;
		if (parentId === undefined) return;
		for (const existing of model.proposals.filter(
			(proposal) => proposal.predecessor === parentId,
		)) {
			if (visited.has(existing.id))
				throw new ArchiveError("MODEL_INVALID", "Proposal ancestry contains a cycle.");
			visited.add(existing.id);
			const proposal = ProposalSchema.strip().parse(existing);
			const base = await proposalBaseline(context, model, proposal);
			if (!base.success) throw new ArchiveError(base.code, base.error);
			const mine = decodeProposal(base, proposal, model);
			if (!mine.success) throw new ArchiveError(mine.code, mine.error);
			const waiting = parent.selectedState?.standing;
			let next = mine;
			if (waiting !== undefined) {
				proposal.standing = {
					against: parentId,
					baseline: proposal.baseline,
					atRevision: proposal.standing?.atRevision ?? request.expectedRevision.digest,
					issues: proposal.standing?.issues ?? [],
					blockedBy: waiting.blockedBy ?? parentId,
				};
			} else {
				const merged = reconcileModels(base, mine, parent);
				if (!merged.result.success) throw new ArchiveError(merged.result.code, merged.result.error);
				next = { ...merged.result, proposals: model.proposals };
				const issues = [...(proposal.standing?.issues ?? [])];
				for (const issue of merged.issues)
					if (
						!issues.some(
							(old) =>
								old.subject === issue.subject &&
								old.kind === issue.kind &&
								old.field === issue.field,
						)
					)
						issues.push(issue);
				if (issues.length > 0) {
					proposal.standing = {
						against: parentId,
						baseline: proposal.baseline,
						atRevision: proposal.standing?.atRevision ?? request.expectedRevision.digest,
						issues,
					};
					updateChanges(proposal, base, next);
				} else {
					delete proposal.standing;
					proposal.baseline = await retainBaseline(vault, request, parent, proposal);
					proposal.predecessorRevision = predecessorRevision(parent);
					updateChanges(proposal, parent, next);
				}
			}
			dependencies.add(proposal.baseline);
			const changed = !isDeepStrictEqual(ProposalSchema.strip().parse(existing), proposal);
			if (changed) {
				scopes.add(proposal.id);
				const before = subjectsOf(mine),
					after = subjectsOf(next);
				for (const id of new Set([...before.keys(), ...after.keys()]))
					if (!isDeepStrictEqual(before.get(id), after.get(id))) {
						subjects.add(id);
						scopes.add(id);
					}
				for (const issue of proposal.standing?.issues ?? [])
					if (issue.subject.includes("#")) {
						subjects.add(issue.subject);
						scopes.add(issue.subject);
					}
				inputs.set(existing.file, Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`));
				const entry = model.proposals.findIndex((p) => p.id === proposal.id);
				model.proposals[entry] = { ...proposal, file: existing.file };
				reconciliations.push({
					state: proposal.id,
					...(proposal.standing === undefined ? {} : { standing: proposal.standing }),
				});
			}
			const selected = { ...next, selectedState: SelectedStateSchema.strip().parse(proposal) };
			await descend(selected);
		}
	}
	if (!("proposal" in request && request.proposal.type === "create")) {
		const selected = await resolveState(context, model, request.target.state ?? "current");
		if (!selected.success) return selected;
		if (selected.selectedState?.standing?.blockedBy !== undefined)
			throw new ArchiveError(
				"PROPOSAL_BLOCKED",
				"Settle the ancestor before editing this descendant.",
				"model.json",
				[selected.selectedState.standing.blockedBy],
			);
		await descend(selected);
	}
	requireSubjectClaim(vault, request, [...scopes]);
	const revision = modelRevision(inputs);
	catalogue = decodeModel({ inputs, revision, diagnostics: [] });
	if (!catalogue.success) return catalogue;
	const selection =
		candidate.selection?.id === undefined
			? candidate.selection
			: SelectedStateSchema.strip().parse(
					catalogue.proposals.find((p) => p.id === candidate.selection?.id) ?? candidate.selection,
				);
	return {
		...candidate,
		inputs,
		revision,
		files: changedFiles(captured.inputs, inputs),
		subjects: [...subjects],
		scopes: [...scopes],
		selection,
		dependencies: [...dependencies],
		reconciliations,
	};
}
export { familyCandidate };
