import { readArchitectureModel } from "@archboard/model/store-read";
import { modelContent } from "@archboard/model/content";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import type { LegacyBoard, SemanticVariant } from "@archboard/model/legacy-board";
import type { SemanticPolicy } from "@archboard/model/policy";
import type { CodeCheckSkip } from "#shared/protocol/code-check.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;
/** Semantic evidence accepted by the existing code-inspection engine. */
interface StateToCheck {
	readonly document: Pick<LegacyBoard, "id" | "name" | "variants" | "current">;
	readonly variant: SemanticVariant;
	readonly file: string;
	readonly named: boolean;
	readonly relationshipKinds: SemanticPolicy["relationshipKinds"];
	readonly model?: Model;
}
interface StatesToCheck {
	readonly ok: true;
	readonly states: readonly StateToCheck[];
	readonly skipped: readonly CodeCheckSkip[];
}
type NoSuchDraft = Extract<ArchitectureModelRead, { success: false }>;
/**
 * Supply complete canonical meaning to the existing semantic evidence engine.
 * @param model The coherent canonical state.
 * @param predecessor Its exact comparison base, when available.
 * @returns The engine reading without a document document, level, or authored view.
 */
function codeReading(model: Model, predecessor?: Model): StateToCheck {
	const variant: SemanticVariant = {
		...stateMetadata(model),
		content: modelContent(model),
		documents: stateDocuments(model),
		...parentOf(predecessor),
	};
	const previous = predecessor === undefined ? [] : [codeReading(predecessor).variant];
	return {
		document: {
			id: model.manifest.id,
			name: model.manifest.name,
			current: model.manifest.current?.id,
			variants: [...previous, variant],
		},
		variant,
		file: "model.json",
		named: variant.lifecycle === "draft",
		relationshipKinds: model.policy.relationshipKinds,
		model,
	};
}
/**
 * Supply exact state metadata or the real empty planning identity.
 * @param model The coherent reading.
 * @returns The semantic analyzer's state metadata.
 */
function stateMetadata(model: Model): Pick<SemanticVariant, "id" | "name" | "lifecycle"> {
	const state = model.selectedState;
	if (state === null)
		return { id: model.manifest.id, name: model.manifest.name, lifecycle: "draft" };
	return { id: state.id, name: state.name, lifecycle: state.lifecycle };
}
/**
 * Gather actual state and module document references for inspection.
 * @param model The coherent reading.
 * @returns Its authored document references.
 */
function stateDocuments(model: Model) {
	return [
		...(model.selectedState?.documents ?? []),
		...model.modules.flatMap((module) => module.documents ?? []),
	];
}
/**
 * Preserve the exact comparison predecessor for inherited-part inspection.
 * @param model The optional comparison source.
 * @returns The predecessor identity, when selected.
 */
function parentOf(model: Model | undefined): Pick<SemanticVariant, "parent"> {
	const state = model?.selectedState;
	if (state == null) return {};
	return { parent: state.id };
}
/**
 * Read and guard the exact comparison source supplied by the canonical reader.
 * @param vault The addressed vault.
 * @param model The selected coherent architecture.
 * @param ref The source ref the selected state was read at, whose vault holds its predecessor too.
 * @returns Its predecessor, absence, or a structured refusal.
 */
async function readPredecessor(vault: string, model: Model, ref?: string) {
	const comparison = model.comparison;
	if (comparison?.against == null) return undefined;
	const predecessor = await readArchitectureModel(vault, undefined, undefined, {
		...(comparison.checkpoint === undefined
			? { state: comparison.against.id, ref }
			: { checkpoint: comparison.checkpoint }),
		compare: false,
	});
	if (!predecessor.success) return predecessor;
	if (predecessor.revision.digest !== comparison.revision.digest)
		return {
			success: false as const,
			code: "STALE_REVISION" as const,
			error: "The comparison source changed.",
			diagnostics: [
				{
					code: "STALE_REVISION",
					file: "model.json",
					message: "The comparison source changed during code inspection.",
					recovery: "Read the selected state again and retry the code inspection.",
				},
			],
		};
	return predecessor;
}
/**
 * Read one selected canonical state through the shared runtime.
 * @param vault The addressed vault.
 * @param state The optional state selector.
 * @param selections The exact checkpoint and comparison selectors.
 * @param selections.checkpoint The retained checkpoint.
 * @param selections.against The comparison source.
 * @param selections.ref A branch, tag or commit of the vault's repository: read the vault as it holds it there.
 * @returns Complete evidence or its structured refusal.
 */
async function readStatesToCheck(
	vault: string,
	state?: string,
	selections: {
		checkpoint?: string | undefined;
		against?: string | undefined;
		ref?: string | undefined;
	} = {},
): Promise<StatesToCheck | NoSuchDraft> {
	const model = await readArchitectureModel(vault, undefined, undefined, {
		checkpoint: selections.checkpoint,
		against: selections.against,
		ref: selections.ref,
		state,
		compare: true,
	});
	if (!model.success) return model;
	const predecessor = await readPredecessor(vault, model, selections.ref);
	if (predecessor?.success === false) return predecessor;
	return { ok: true, states: [codeReading(model, predecessor)], skipped: [] };
}
/**
 * Read every independent active proposal without combining equal names.
 * @param vault The addressed vault.
 * @returns Their exact canonical evidence or a structured refusal.
 */
async function readEveryDraftToCheck(vault: string): Promise<StatesToCheck | NoSuchDraft> {
	const current = readArchitectureModel(vault);
	if (!current.success) return current;
	const readings = await Promise.all(
		current.proposals.map((proposal) => readStatesToCheck(vault, proposal.id)),
	);
	const failure = readings.find((reading) => !("ok" in reading));
	if (failure !== undefined) return failure;
	return {
		ok: true,
		states: readings.flatMap((reading) => ("ok" in reading ? reading.states : [])),
		skipped: [],
	};
}
export { type StateToCheck, type NoSuchDraft, readStatesToCheck, readEveryDraftToCheck };
