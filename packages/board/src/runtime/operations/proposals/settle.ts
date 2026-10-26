import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { ProposalSchema, SelectedStateSchema } from "#shared/schemas/model-proposals.ts";
import { archiveContext, ArchiveError } from "#runtime/store/model-archive.ts";
import { readCurrentModel } from "#runtime/operations/read/model-read.ts";
import { ModelIssueSchema } from "#shared/schemas/model-proposals.ts";
import { readModelFiles } from "#runtime/store/model-files.ts";
import {
	proposalBaseline,
	resolveState,
	decodeSubjects,
	predecessorRevision,
} from "#runtime/operations/proposals/read.ts";
import { subjectsOf, type Subjects } from "#runtime/operations/proposals/subjects.ts";
import {
	retainBaseline,
	updateChanges,
	decodedDraft,
	proposalInputs,
} from "#runtime/operations/proposals/candidate.ts";
import { applyStructure } from "#runtime/operations/model-edit/structure.ts";
import { requireSubjectClaim } from "#runtime/operations/model-edit/claims.ts";
import { changedFiles } from "#runtime/operations/model-edit/candidate.ts";
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
	if (["parent", "from", "collection", "within"].includes(issue.field)) {
		if (source.placement === undefined) delete mine.placement;
		else mine.placement = structuredClone(source.placement);
		return;
	}
	const value = source.value[issue.field];
	if (value === undefined) delete mine.value[issue.field];
	else mine.value[issue.field] = structuredClone(value);
}
/**
 * Apply explicit choices and retain the remaining standing through the normal writer.
 * @param vault The addressed vault.
 * @param request The complete intent with settlement choices.
 * @param current The selected coherent draft.
 * @param captured The exact input capture.
 * @returns The checked proposal candidate or its refusal.
 */
async function settleCandidate(
	vault: string,
	request: Extract<ArchitectureModuleEdit, { proposal: unknown }>,
	current: ArchitectureModel,
	captured: ReturnType<typeof readModelFiles>,
) {
	if (request.proposal.type !== "settle")
		throw new ArchiveError("MODEL_INVALID", "Supply settlement choices.");
	const resolutions = request.proposal.resolutions;
	const existing = current.proposals.find((p) => p.id === request.target.state);
	if (existing?.standing === undefined || existing.standing.issues.length === 0)
		throw new ArchiveError("MODEL_INVALID", "Select a proposal with standing issues.");
	const proposal = ProposalSchema.strip().parse(existing);
	const context = await archiveContext(vault);
	const base = await proposalBaseline(context, current, proposal);
	if (!base.success) return base;
	const catalogue = readCurrentModel(vault);
	if (!catalogue.success) return catalogue;
	const predecessor = await resolveState(context, catalogue, proposal.predecessor ?? "current");
	if (!predecessor.success) return predecessor;
	if (predecessor.selectedState?.standing !== undefined)
		throw new ArchiveError("PROPOSAL_BLOCKED", "Settle the ancestor first.", existing.file, [
			predecessor.selectedState.id,
		]);
	const structure = applyStructure(current, request, captured.inputs.keys());
	const edited = decodedDraft(current, structure, proposal);
	if (!edited.success) return edited;
	const subjects = subjectsOf(edited),
		theirs = subjectsOf(predecessor);
	const issues = existing.standing.issues;
	for (const resolution of resolutions) {
		const covered = issues.filter((issue) => matches(resolution, issue));
		if (covered.length === 0)
			throw new ArchiveError(
				"MODEL_INVALID",
				"A resolution names no standing issue.",
				existing.file,
				[resolution.subject],
			);
		if (resolution.take === "theirs")
			for (const issue of covered) takeTheirs(subjects, theirs, issue);
	}
	let settled = decodeSubjects(
		{
			...edited,
			manifest: {
				...edited.manifest,
				retiredIds: (edited.manifest.retiredIds ?? []).filter((id) => !subjects.has(id)),
			},
		},
		subjects,
		SelectedStateSchema.strip().parse(proposal),
	);
	if (!settled.success) return settled;
	const remaining = issues.filter(
		(issue) => !resolutions.some((resolution) => matches(resolution, issue)),
	);
	if (remaining.length > 0) {
		proposal.standing = { ...existing.standing, issues: remaining };
		updateChanges(proposal, base, settled);
	} else {
		delete proposal.standing;
		const retired = new Set(predecessor.manifest.retiredIds);
		const proofs = proposal.restorations ?? [];
		for (const subject of subjects.keys())
			if (retired.has(subject) && !proofs.some((proof) => proof.subject === subject))
				proofs.push({ subject, checkpoint: proposal.baseline });
		if (proofs.length > 0) proposal.restorations = proofs;
		const final = decodeSubjects(
			{
				...predecessor,
				manifest: {
					...predecessor.manifest,
					retiredIds: [
						...new Set([
							...(predecessor.manifest.retiredIds ?? []),
							...(settled.manifest.retiredIds ?? []),
						]),
					].filter((id) => !subjects.has(id)),
				},
			},
			subjects,
			SelectedStateSchema.strip().parse(proposal),
		);
		if (!final.success) return final;
		settled = final;
		proposal.baseline = await retainBaseline(vault, request, predecessor, proposal);
		proposal.predecessorRevision = predecessorRevision(predecessor);
		updateChanges(proposal, predecessor, settled);
	}
	const scopes = [
		...new Set([
			current.manifest.id,
			proposal.id,
			...structure.scopes,
			...resolutions.map((r) => r.subject),
		]),
	];
	requireSubjectClaim(vault, request, scopes);
	const candidate = proposalInputs(captured, proposal, existing);
	if (!candidate.raw.success) return candidate.raw;
	return {
		success: true as const,
		current,
		inputs: candidate.inputs,
		revision: candidate.revision,
		files: changedFiles(captured.inputs, candidate.inputs),
		subjects: [
			...new Set([
				...structure.subjects,
				...resolutions.map((r) => r.subject).filter((id) => id.includes("#")),
			]),
		],
		scopes,
		selection: SelectedStateSchema.strip().parse(proposal),
		dependencies: [
			proposal.baseline,
			...(proposal.restorations ?? []).map((proof) => proof.checkpoint),
		],
	};
}
export { settleCandidate };
