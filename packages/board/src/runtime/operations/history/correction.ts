import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { CorrectionSchema } from "#shared/schemas/model-proposals.ts";
import { everyStep } from "#shared/rules/flow-steps.ts";
import {
	applyCandidateStructure,
	candidateInputs,
} from "#runtime/operations/model-edit/candidate.ts";
import { requireSubjectClaim } from "#runtime/operations/model-edit/claims.ts";
import { compactChanges } from "#runtime/operations/proposals/subjects.ts";
import { materializedInputs, requireModel } from "#runtime/operations/proposals/read.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import { decodeModel } from "#runtime/operations/read/model-read.ts";
import { archiveContext, ArchiveError, sourceEvidence } from "#runtime/store/model-archive.ts";

type Request = Extract<ArchitectureModuleEdit, { correction: unknown }>;

/**
 * Require immutable evidence for every repository referenced by the corrected facts.
 * @param vault The addressed vault.
 * @param request The explicit correction intent.
 * @param model The complete corrected architecture.
 */
async function requireCorrectionEvidence(vault: string, request: Request, model: ArchitectureModel) {
	const repositories = new Set([
		...model.modules.flatMap((module) => [
			...(module.binding === undefined ? [] : [module.binding.repo]),
			...(module.documents ?? []).map((document) => document.repo),
			...module.outgoing.flatMap((edge) => edge.anchor === undefined ? [] : [edge.anchor.repo]),
		]),
		...(model.selectedState?.documents ?? []).map((document) => document.repo),
		...model.collections.flatMap((collection) => collection.flows.flatMap((flow) =>
			everyStep(flow.steps).flatMap((step) => !("anchor" in step) || step.anchor === undefined ? [] : [step.anchor.repo]),
		)),
	]);
	const sources = request.correction.revisions.map((revision) => ({ ...revision, uncommitted: false }));
	const evidence = await sourceEvidence(await archiveContext(vault), sources);
	if ([...repositories].some((repo) => !sources.some((source) => source.repo === repo)) ||
		evidence.some((source) => source.status !== "available"))
		throw new ArchiveError(
			"SOURCE_EVIDENCE_UNAVAILABLE",
			"The correction requires an available immutable source commit for every referenced repository.",
			request.correction.previous,
			[model.selectedState!.id],
		);
}

/**
 * Correct retained meaning without installing it over the current designation.
 * @param vault The explicit vault.
 * @param request The complete correction intent.
 * @param selected The exact latest logical reading.
 * @param captured The complete live inputs and token.
 * @returns A candidate for the existing family and durable journal owners.
 */
async function correctionCandidate(
	vault: string,
	request: Request,
	selected: ArchitectureModel,
	captured: ReturnType<typeof readModelFiles>,
) {
	const selection = selected.selectedState;
	if (selection?.lifecycle !== "historical" && selection?.lifecycle !== "shelved")
		throw new ArchiveError("TARGET_CHANGED", "Select a historical or shelved logical state before correcting it.");
	if (selected.checkpoint?.id !== request.correction.previous)
		throw new ArchiveError("STALE_REVISION", "The logical state changed. Read its latest checkpoint before correcting it.");
	const structure = await applyCandidateStructure(vault, selected, request, captured.inputs.keys());
	const start = materializedInputs(selected, Buffer.from(Bun.YAML.stringify(selected.policy)));
	const inputs = candidateInputs({ inputs: start, revision: modelRevision(start), diagnostics: [] }, selected, structure);
	const model = requireModel(decodeModel({ inputs, revision: modelRevision(inputs), diagnostics: [] }, selection));
	await requireCorrectionEvidence(vault, request, model);
	const scopes = [...new Set([selected.manifest.id, selection.id, ...structure.scopes])];
	requireSubjectClaim(vault, request, scopes);
	return {
		success: true as const,
		current: selected,
		model,
		inputs: new Map(captured.inputs),
		revision: captured.revision,
		files: [],
		subjects: structure.subjects,
		scopes,
		selection: { ...selection, corrections: undefined },
		dependencies: [request.correction.previous],
		correction: CorrectionSchema.parse({
			...request.correction,
			at: new Date().toISOString(),
			changes: compactChanges(selected, model),
			retiredIds: model.manifest.retiredIds,
		}),
	};
}

export { correctionCandidate };
