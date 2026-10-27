import { walkthroughDependencies } from "#runtime/operations/history/walkthrough-targets.ts";
import { archiveContext } from "#runtime/store/model-archive.ts";
import { isDeepStrictEqual } from "node:util";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { decodeModel } from "#runtime/operations/read/model-read.ts";
import { requireSubjectClaim, requireTarget } from "#runtime/operations/model-edit/claims.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import { applyStructure } from "#runtime/operations/model-edit/structure.ts";

/**
 * Capture the exact complete revision before preparing a candidate.
 * @param vault The explicit vault.
 * @param revision The complete read token.
 * @returns The captured inputs.
 */
function captureRevision(vault: string, revision: ArchitectureModel["revision"]) {
	const captured = readModelFiles(vault);
	if (captured.diagnostics.length > 0 || !isDeepStrictEqual(captured.revision, revision))
		throw new ArchiveError("STALE_REVISION", "Inputs changed before candidate preparation.");
	return captured;
}

/**
 * Write only changed definitions of one authored kind.
 * @param inputs The complete candidate inputs.
 * @param before The original definitions and paths.
 * @param after The continuing definitions and paths.
 */
function writeDefinitions<T extends { id: string; file: string }>(
	inputs: Map<string, Buffer>,
	before: T[],
	after: T[],
): void {
	const continuing = new Map(after.map((value) => [value.id, value]));
	for (const value of before) if (!continuing.has(value.id)) inputs.delete(value.file);
	const originals = new Map(before.map((value) => [value.id, value]));
	for (const value of after) {
		if (isDeepStrictEqual(originals.get(value.id), value)) continue;
		const { file, ...definition } = value;
		inputs.set(file, Buffer.from(`${JSON.stringify(definition, null, 2)}\n`));
	}
}

/**
 * Serialize only changed definitions while preserving unrelated authored bytes.
 * @param captured The original files.
 * @param current The coherent starting model.
 * @param candidate The complete graph result.
 * @returns The exact candidate inputs.
 */
function candidateInputs(
	captured: ReturnType<typeof readModelFiles>,
	current: ArchitectureModel,
	candidate: ReturnType<typeof applyStructure>,
) {
	const inputs = new Map(captured.inputs);
	writeDefinitions(inputs, current.modules, candidate.modules);
	writeDefinitions(inputs, current.collections, candidate.collections);
	writeDefinitions(inputs, current.walkthroughs, candidate.walkthroughs);
	if (!isDeepStrictEqual(current.manifest, candidate.manifest))
		inputs.set("model.json", Buffer.from(`${JSON.stringify(candidate.manifest, null, 2)}\n`));
	return inputs;
}

/**
 * Log only real path changes, including additions and durable removals.
 * @param before The original bytes.
 * @param after The candidate bytes.
 * @returns Exact changed file images.
 */
function changedFiles(before: Map<string, Buffer>, after: Map<string, Buffer>) {
	return [...new Set([...before.keys(), ...after.keys()])].flatMap((path) => {
		const original = before.get(path)?.toString("base64") ?? null;
		const final = after.get(path)?.toString("base64") ?? null;
		return original === final ? [] : [{ path, before: original, after: final }];
	});
}

/**
 * Require an explicit proposal intent for non-current edits.
 * @param model The selected target reading.
 */
function requireCurrentEdit(model: ArchitectureModel): void {
	if (model.selectedState?.lifecycle !== "current")
		throw new ArchiveError(
			"TARGET_CHANGED",
			"Draft edits require an explicit proposal intent. Lifecycle changes remain unavailable.",
		);
}
/**
 * Capture one complete checked candidate and all affected claims.
 * @param vault The explicit vault.
 * @param request The original operation.
 * @param current The complete coherent starting reading.
 * @param captured The exact starting files.
 * @returns The checked candidate or refusal.
 */
async function currentCandidate(
	vault: string,
	request: ArchitectureModuleEdit,
	current: ArchitectureModel,
	captured: ReturnType<typeof readModelFiles>,
) {
	requireCurrentEdit(current);
	const candidate = applyStructure(current, request, captured.inputs.keys());
	const inputs = candidateInputs(captured, current, candidate);
	const revision = modelRevision(inputs);
	const checked = decodeModel({ inputs, revision, diagnostics: [] });
	if (!checked.success) return checked;
	requireSubjectClaim(vault, request, candidate.scopes);
	return {
		success: true as const,
		current,
		model: checked,
		inputs,
		revision,
		files: changedFiles(captured.inputs, inputs),
		subjects: candidate.subjects,
		scopes: candidate.scopes,
		selection: undefined,
		dependencies: await walkthroughDependencies(await archiveContext(vault), checked),
	};
}
/**
 * Reject a descendant that waits on an unsettled ancestor.
 * @param current The explicitly selected reading.
 */
function requireWritableTarget(current: ArchitectureModel): void {
	const ancestor = current.selectedState?.standing?.blockedBy;
	if (ancestor !== undefined)
		throw new ArchiveError(
			"PROPOSAL_BLOCKED",
			"Settle the ancestor before editing this descendant.",
			"model.json",
			[ancestor],
		);
}
/**
 * Capture one checked predecessor candidate before family reconciliation.
 * @param vault The explicit vault.
 * @param request The complete original intent.
 * @returns The predecessor candidate or its refusal.
 */
async function initialCandidate(vault: string, request: ArchitectureModuleEdit) {
	const current = await requireTarget(vault, request.target);
	if (!current.success) return current;
	if (!isDeepStrictEqual(current.revision, request.expectedRevision))
		throw new ArchiveError("STALE_REVISION", "Read the complete model again before a new edit.");
	const captured = captureRevision(vault, current.revision);
	requireWritableTarget(current);
	if ("proposal" in request) {
		const { proposalIntentCandidate } = await import("#runtime/operations/proposals/candidate.ts");
		return proposalIntentCandidate(vault, request, current, captured);
	}
	return currentCandidate(vault, request, current, captured);
}

/**
 * Add all dependent results to the same durable candidate.
 * @param vault The explicitly addressed vault.
 * @param request The complete architectural intent.
 * @returns The checked family or its refusal.
 */
async function editCandidate(vault: string, request: ArchitectureModuleEdit) {
	const candidate = await initialCandidate(vault, request);
	if (!candidate.success) return candidate;
	const { familyCandidate } = await import("#runtime/operations/proposals/family.ts");
	return familyCandidate(
		vault,
		request,
		captureRevision(vault, request.expectedRevision),
		candidate,
	);
}
export { initialCandidate, editCandidate, candidateInputs, changedFiles };
