import type { z } from "zod";
import type { StateSelectionSchema } from "#shared/schemas/model-proposals.ts";
import type {
	ArchitectureModel,
	ArchitectureModelRead,
	ModelDiagnostic,
} from "#shared/schemas/model.ts";
import { readCurrentModel, failure } from "#runtime/operations/read/model-read.ts";
import { readSelectedState } from "#runtime/operations/proposals/read.ts";
import { everyStep } from "#shared/rules/flow-steps.ts";
import { historyResult } from "#runtime/operations/history/result.ts";

type Selection = z.infer<typeof StateSelectionSchema>;
type Walk = ArchitectureModel["walkthroughs"][number];
type Beat = Walk["beats"][number];
/**
 * Resolve identity before unique names.
 * @param model The captured catalogue.
 * @param selector The narrative selector.
 * @returns One narrative or a refusal.
 */
function walkthroughOf(model: ArchitectureModel, selector: string) {
	const exact = model.walkthroughs.find((walk) => walk.id === selector);
	if (exact) return exact;
	const matches = model.walkthroughs.filter(
		(walk) => walk.name === selector || walk.formerNames?.includes(selector),
	);
	return matches.length === 1
		? matches[0]!
		: failure(matches.length === 0 ? "WALKTHROUGH_NOT_FOUND" : "WALKTHROUGH_AMBIGUOUS", [
				{
					code: "WALKTHROUGH_UNAVAILABLE",
					file: "model.json",
					subjects: matches.map((walk) => walk.id),
					message: "The walkthrough selector does not identify one narrative.",
					recovery: "Read the walkthrough catalogue and select one stable identity.",
				},
			]);
}
/**
 * Identify missing references without invalidating other beats.
 * @param model The pinned target.
 * @param beat One complete reading instruction.
 * @returns Missing stable identities.
 */
function missingSubjects(model: ArchitectureModel, beat: Beat): string[] {
	const flows = model.collections.flatMap((collection) => collection.flows);
	const modules = new Set(model.modules.map((module) => module.id));
	const subjects = new Set([
		...modules,
		...model.relationships.map((edge) => edge.id),
		...flows.flatMap((flow) => [flow.id, ...everyStep(flow.steps).map((step) => step.id)]),
		...model.collections.map((collection) => `${model.manifest.id}#${collection.id}`),
	]);
	const { reading } = beat;
	const scope = reading.scope === undefined ? [] : [reading.scope];
	const flow = reading.flow === undefined ? [] : [reading.flow];
	return [
		...new Set([
			...[...scope, ...reading.focus].filter((id) => !modules.has(id)),
			...reading.selection.filter((id) => !subjects.has(id)),
			...flow.filter((id) => !flows.some((entry) => entry.id === id)),
		]),
	];
}
/**
 * Keep vocabulary errors with the affected beat.
 * @param model The pinned target.
 * @param beat One reading.
 * @returns Whether a filter is unavailable.
 */
function missingFilters(model: ArchitectureModel, beat: Beat): boolean {
	return (
		beat.reading.filters.relationships.some(
			(kind) => !Object.hasOwn(model.policy.relationshipKinds, kind),
		) || beat.reading.filters.groups.some((group) => !Object.hasOwn(model.policy.groups, group))
	);
}
/**
 * Explain unavailable reading instructions.
 * @param model The pinned target.
 * @param walk The captured narrative.
 * @param beat The affected beat.
 * @returns Actionable diagnostics.
 */
function beatDiagnostics(model: ArchitectureModel, walk: Walk, beat: Beat): ModelDiagnostic[] {
	const diagnostics: ModelDiagnostic[] = [];
	const missing = missingSubjects(model, beat);
	if (missing.length > 0)
		diagnostics.push({
			code: "WALKTHROUGH_SUBJECT_MISSING",
			file: walk.file,
			subjects: missing,
			message: "This beat refers to subjects absent from the pinned reading.",
			recovery:
				"Restore the subjects or ask an agent to repair this beat, then restart the walkthrough.",
		});
	if (beat.reading.grammar !== "architecture" && beat.reading.flow === undefined)
		diagnostics.push({
			code: "FLOW_REQUIRED",
			file: walk.file,
			subjects: [beat.id],
			message: "This behavioral beat names no flow.",
			recovery: "Ask an agent to select an authored flow for this beat, then restart.",
		});
	if (missingFilters(model, beat))
		diagnostics.push({
			code: "WALKTHROUGH_FILTER_MISSING",
			file: walk.file,
			subjects: [beat.id],
			message: "This beat names a filter absent from the pinned policy.",
			recovery: "Ask an agent to repair the beat filters, then restart.",
		});
	return diagnostics;
}
/**
 * Resolve the target once without changing it between beats.
 * @param vault The explicit vault.
 * @param source The captured narrative catalogue.
 * @param walk The selected narrative.
 * @param selection The explicit playback request.
 * @returns The complete target.
 */
function targetReading(
	vault: string,
	source: ArchitectureModel,
	walk: Walk,
	selection: Selection,
): Promise<ArchitectureModelRead> | ArchitectureModelRead {
	if (selection.checkpoint !== undefined) return source;
	if ("checkpoint" in walk.target)
		return readSelectedState(vault, undefined, undefined, {
			state: walk.target.checkpoint,
			compare: false,
		});
	if (walk.target.state === "current" && source.selectedState?.lifecycle === "current")
		return source;
	return readSelectedState(vault, undefined, undefined, {
		state: walk.target.state,
		compare: false,
	});
}
/**
 * Refuse an asynchronous capture that spans different mutable inputs.
 * @param vault The explicit vault.
 * @param source The captured catalogue.
 * @returns A refusal or absence.
 */
function changedSource(vault: string, source: ArchitectureModel) {
	if (source.checkpoint !== undefined) return undefined;
	const latest = readCurrentModel(vault);
	if (!latest.success) return latest;
	if (latest.revision.digest !== source.revision.digest)
		return failure("MODEL_CHANGED", [
			{
				code: "MODEL_CHANGED",
				file: "model.json",
				message: "Inputs changed while playback resolved its target.",
				recovery: "Read the walkthrough again.",
			},
		]);
	return undefined;
}
/**
 * Attach beat readiness to one complete reading.
 * @param source The captured catalogue.
 * @param target The resolved target.
 * @param walk The selected narrative.
 * @param shared Whether retained playback is required.
 * @returns The complete playback or explicit refusal.
 */
function attachPlayback(
	source: ArchitectureModel,
	target: ArchitectureModel,
	walk: Walk,
	shared: Selection["shared"],
): ArchitectureModelRead {
	if (target.manifest.id !== source.manifest.id)
		return failure("TARGET_CHANGED", [
			{
				code: "TARGET_CHANGED",
				file: walk.file,
				message: "The retained target belongs to another model.",
				recovery: "Select a checkpoint from this model.",
			},
		]);
	if (shared && target.checkpoint === undefined)
		return failure("CHECKPOINT_REQUIRED", [
			{
				code: "CHECKPOINT_REQUIRED",
				file: walk.file,
				message: "Shared or recorded playback requires an exact retained checkpoint.",
				recovery: "Retain the complete reading and reopen this walkthrough with its checkpoint.",
			},
		]);
	const beats = walk.beats.map((beat) => {
		const diagnostics = beatDiagnostics(target, walk, beat);
		return {
			id: beat.id,
			status: diagnostics.length === 0 ? ("ready" as const) : ("unavailable" as const),
			diagnostics,
		};
	});
	return {
		...target,
		playback: {
			walkthrough: walk,
			sourceRevision: source.revision,
			revision: target.revision,
			...(target.checkpoint === undefined ? {} : { checkpoint: target.checkpoint.id }),
			beats,
		},
	};
}
/**
 * Resolve one narrative against the captured input set.
 * @param vault The explicit vault.
 * @param source The captured catalogue.
 * @param selector The requested narrative.
 * @param selection The playback request.
 * @returns The pinned playback or explicit refusal.
 */
async function resolvePlayback(
	vault: string,
	source: ArchitectureModel,
	selector: string,
	selection: Selection,
): Promise<ArchitectureModelRead> {
	const walk = walkthroughOf(source, selector);
	if ("success" in walk) return walk;
	const target = await targetReading(vault, source, walk, selection);
	if (!target.success) return target;
	return changedSource(vault, source) ?? attachPlayback(source, target, walk, selection.shared);
}
/**
 * Prepare an ordinary state selection before narrative resolution.
 * @param selection The complete playback request.
 * @returns The state selector without implicit comparison during playback.
 */
function sourceSelection(selection: Selection): Selection {
	return {
		...selection,
		state: selection.checkpoint ?? selection.state,
		compare: selection.walkthrough === undefined ? selection.compare : false,
	};
}
/**
 * Extend the existing reader with narrative playback.
 * @param vault The addressed vault.
 * @param module The optional module selector.
 * @param flow The optional flow selector.
 * @param selection The state and playback request.
 * @returns One complete reading or actionable refusal.
 */
async function readPlayback(
	vault: string,
	module: string | undefined,
	flow: string | undefined,
	selection: Selection,
): Promise<ArchitectureModelRead> {
	return historyResult("ARCHITECTURE_UNAVAILABLE", async () => {
		if (selection.checkpoint !== undefined && selection.state !== undefined)
			return failure("CHECKPOINT_INVALID", [
				{
					code: "CHECKPOINT_INVALID",
					file: "model.json",
					message: "State and checkpoint select different readings.",
					recovery: "Select one state or one checkpoint.",
				},
			]);
		const source = await readSelectedState(vault, module, flow, sourceSelection(selection));
		if (!source.success || selection.walkthrough === undefined) return source;
		return resolvePlayback(vault, source, selection.walkthrough, selection);
	});
}
export { readPlayback };
