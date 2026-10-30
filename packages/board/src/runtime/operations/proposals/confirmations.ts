import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEditResult } from "#shared/schemas/model-operations.ts";
import { ArchiveError, archiveContext, type ArchiveContext } from "#runtime/store/model-archive.ts";
import { exactReading } from "#runtime/operations/history/read.ts";
import { requireModel } from "#runtime/operations/proposals/read.ts";

type Confirmations = NonNullable<
	Extract<ArchitectureModuleEditResult, { success: true }>["confirmed"]
>;
type Module = ArchitectureModel["modules"][number];
interface Act {
	code: Confirmations[number];
	subjects: string[];
	message: string;
}
interface Recreation {
	added: Module;
	original: Module;
}

/**
 * Require deliberate removal of most modules inherited from the direct predecessor.
 * @param before The selected draft before this edit.
 * @param baseline Its exact predecessor, or the starting state for a new draft.
 * @param after The complete intended draft.
 * @returns The removal requiring confirmation, when present.
 */
function droppedInheritance(
	before: ArchitectureModel,
	baseline: ArchitectureModel,
	after: ArchitectureModel,
): Act | undefined {
	const inheritedIds = new Set(baseline.modules.map((module) => module.id));
	const inherited = before.modules.filter((module) => inheritedIds.has(module.id));
	const kept = new Set(after.modules.map((module) => module.id));
	const removed = inherited.filter((module) => !kept.has(module.id));
	if (removed.length * 2 <= inherited.length) return undefined;
	return {
		code: "INHERITANCE_DROPPED",
		message: `This edit removes ${removed.length} of ${inherited.length} inherited modules. Confirm the deliberate redesign before writing it.`,
		subjects: removed.map((module) => module.id),
	};
}

/**
 * Identify a possible recreation without assigning shared identity.
 * @param added The newly allocated module.
 * @param original An ancestor's absent module.
 * @returns Whether the existing name or exact binding warning applies.
 */
function samePart(added: Module, original: Module): boolean {
	if (added.name === original.name) return true;
	const a = added.binding,
		b = original.binding;
	if (a === undefined || b === undefined) return false;
	return a.repo === b.repo && a.path === b.path && a.symbol === b.symbol;
}

/**
 * Match each new module against its nearest retained ancestor occurrence.
 * @param context The existing archive owner.
 * @param ancestor The next exact predecessor reading.
 * @param added The new modules without a nearer match.
 * @param kept The continuing identities in the proposed result.
 * @param visited The retained ancestry already traversed.
 * @returns Possible recreations, with stable original identities.
 */
async function nearestMatches(
	context: ArchiveContext,
	ancestor: ArchitectureModel,
	added: Module[],
	kept: ReadonlySet<string>,
	visited: Set<string>,
): Promise<Recreation[]> {
	const found = added.flatMap((module) => {
		const original = ancestor.modules.find((one) => !kept.has(one.id) && samePart(module, one));
		return original === undefined ? [] : [{ added: module, original }];
	});
	const remaining = added.filter((module) => !found.some((one) => one.added.id === module.id));
	const checkpoint = ancestor.selectedState?.baseline;
	if (remaining.length === 0 || checkpoint === undefined) return found;
	if (visited.has(checkpoint))
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"The retained proposal ancestry repeats.",
			checkpoint,
		);
	visited.add(checkpoint);
	const earlier = requireModel(
		await exactReading(context, checkpoint, undefined, undefined, false),
	);
	return [...found, ...(await nearestMatches(context, earlier, remaining, kept, visited))];
}

/**
 * Require confirmation before replacing an ancestor identity with a possible duplicate.
 * @param vault The addressed vault.
 * @param before The selected draft before editing.
 * @param baseline Its direct exact predecessor.
 * @param after The complete candidate.
 * @returns The possible recreation act, when present.
 */
async function recreatedParts(
	vault: string,
	before: ArchitectureModel,
	baseline: ArchitectureModel,
	after: ArchitectureModel,
): Promise<Act | undefined> {
	const known = new Set(before.modules.map((module) => module.id));
	const added = after.modules.filter((module) => !known.has(module.id));
	if (added.length === 0) return undefined;
	const kept = new Set(after.modules.map((module) => module.id));
	const found = await nearestMatches(await archiveContext(vault), baseline, added, kept, new Set());
	if (found.length === 0) return undefined;
	return {
		code: "PART_RECREATED",
		message:
			"New module identities repeat names or exact code bindings of absent ancestor modules. Confirm that they represent different parts.",
		subjects: found.flatMap((one) => [one.original.id, one.added.id]),
	};
}

/**
 * Admit explicit proposal redesigns and record only the acts actually performed.
 * @param vault The addressed vault.
 * @param before The selected draft before editing.
 * @param baseline Its exact predecessor.
 * @param after The complete candidate.
 * @param confirmed The caller's deliberate confirmations.
 * @returns Durable confirmation notices for the receipt.
 */
async function proposalConfirmations(
	vault: string,
	before: ArchitectureModel,
	baseline: ArchitectureModel,
	after: ArchitectureModel,
	confirmed: Confirmations = [],
): Promise<Confirmations> {
	const acts = [
		await recreatedParts(vault, before, baseline, after),
		droppedInheritance(before, baseline, after),
	].filter((act) => act !== undefined);
	const missing = acts.find((act) => !confirmed.includes(act.code));
	if (missing !== undefined)
		throw new ArchiveError(missing.code, missing.message, "model.json", missing.subjects);
	return acts.map((act) => act.code);
}

export { proposalConfirmations };
