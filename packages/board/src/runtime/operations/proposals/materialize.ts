import { z } from "zod";
import { ModelFlowSchema } from "#shared/schemas/model-flows.ts";
import { FlowDecisionSchema, FlowLoopSchema } from "#shared/schemas/views.ts";
import { QualifiedSubjectIdSchema } from "#shared/schemas/primitives.ts";
import { nestedSteps, type FlatStep } from "#shared/rules/flow-steps.ts";
import {
	heldSubjects,
	type Subjects,
	type Subject,
} from "#runtime/operations/proposals/subjects.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
const StepSchema = ModelFlowSchema.shape.steps.element;
const MessageSchema = StepSchema.options[0];
const FlatStepSchema = z.union([
	MessageSchema,
	FlowDecisionSchema.omit({ alternatives: true }).extend({
		id: QualifiedSubjectIdSchema,
		alternatives: z.array(z.string()),
	}),
	FlowLoopSchema.omit({ steps: true }).extend({ id: QualifiedSubjectIdSchema }),
]);
type Reconstruction = { baseline: ArchitectureModel; subjects: Subjects; used: Set<string> };
/**
 * Require a subject of the holder's expected kind.
 * @param state The reconstruction state.
 * @param id The subject identity.
 * @param subject The resolved subject.
 * @param kind Its expected kind.
 * @returns The subject's own fields.
 */
function takeSubject(state: Reconstruction, id: string, subject: Subject, kind: Subject["kind"]) {
	if (subject.kind !== kind)
		throw new ArchiveError("MODEL_INVALID", "A proposal names a holder of the wrong subject kind.");
	state.used.add(id);
	return subject.value;
}
/**
 * Resolve containment without promoting an orphan.
 * @param state The reconstruction state.
 * @param subject The module subject.
 * @returns The optional parent field.
 */
function parentField(state: Reconstruction, subject: Subject) {
	const parent = subject.placement?.holder;
	if (parent === state.baseline.manifest.id) return {};
	if (parent === undefined || state.subjects.get(parent)?.kind !== "module")
		throw new ArchiveError("MODEL_INVALID", "A module needs an existing parent or the model root.");
	return { parent };
}
/**
 * Rebuild one source-owned module.
 * @param state The reconstruction state.
 * @param id The module identity.
 * @param subject Its resolved fields and placement.
 * @returns One authored definition and location.
 */
function moduleDefinition(state: Reconstruction, id: string, subject: Subject) {
	const value = takeSubject(state, id, subject, "module");
	const outgoing = heldSubjects(state.subjects, id)
		.filter(([, entry]) => entry.kind === "relationship")
		.map(([edge, entry]) => takeSubject(state, edge, entry, "relationship"));
	const file =
		state.baseline.modules.find((module) => module.id === id)?.file ??
		`${id.split("#")[1]}.module.json`;
	return { ...value, ...parentField(state, subject), outgoing, file };
}
/**
 * Read the existing flat semantic schema without an unchecked type assertion.
 * @param state The reconstruction state.
 * @param id The step identity.
 * @param subject The resolved fields.
 * @param ancestors The current nesting ancestry.
 * @returns One validated flat step.
 */
function stepValue(
	state: Reconstruction,
	id: string,
	subject: Subject,
	ancestors: Set<string>,
): FlatStep {
	if (ancestors.has(id))
		throw new ArchiveError("MODEL_INVALID", "A proposal has cyclic step nesting.");
	return FlatStepSchema.parse(takeSubject(state, id, subject, "step"));
}
/**
 * Rebuild the nested children of one control step.
 * @param state The reconstruction state.
 * @param step The validated control or message.
 * @param ancestors The current nesting ancestry.
 * @returns Its flat children in authored order.
 */
function childSteps(state: Reconstruction, step: FlatStep, ancestors: Set<string>): FlatStep[] {
	if (step.kind === "decision")
		return step.alternatives.flatMap((label) => flatHeldSteps(state, step.id, label, ancestors));
	if (step.kind === "loop") return flatHeldSteps(state, step.id, undefined, ancestors);
	return [];
}
/**
 * Read only direct subjects of an exact holder and alternative.
 * @param state The reconstruction state.
 * @param holder The flow or control identity.
 * @param alternative The exact decision label.
 * @param ancestors The nesting cycle guard.
 * @returns Validated flat steps with their exact holders.
 */
function flatHeldSteps(
	state: Reconstruction,
	holder: string,
	alternative: string | undefined,
	ancestors = new Set<string>(),
): FlatStep[] {
	return heldSubjects(state.subjects, holder, alternative).flatMap(([id, subject]) => {
		const step = stepValue(state, id, subject, ancestors);
		const within =
			state.subjects.get(holder)?.kind === "step"
				? { within: { step: holder, ...(alternative === undefined ? {} : { alternative }) } }
				: {};
		return [{ ...step, ...within }, ...childSteps(state, step, new Set([...ancestors, id]))];
	});
}
/**
 * Rebuild one collection and its complete independent flows.
 * @param state The reconstruction state.
 * @param id The qualified collection identity.
 * @param subject Its own fields.
 * @returns One authored definition and location.
 */
function collectionDefinition(state: Reconstruction, id: string, subject: Subject) {
	const value = takeSubject(state, id, subject, "collection");
	const flows = heldSubjects(state.subjects, id).map(([flow, entry]) => ({
		...takeSubject(state, flow, entry, "flow"),
		steps: nestedSteps(flatHeldSteps(state, flow, undefined)),
	}));
	const file =
		state.baseline.collections.find(
			(collection) => `${state.baseline.manifest.id}#${collection.id}` === id,
		)?.file ?? `${id.split("#")[1]}.flows.json`;
	return { ...value, flows, file };
}
/**
 * Build complete definitions through the existing semantic nesting rules.
 * @param baseline The retained complete model.
 * @param subjects The resolved subject graph.
 * @returns Definitions for the canonical decoder.
 */
function materializedDefinitions(baseline: ArchitectureModel, subjects: Subjects) {
	const state = { baseline, subjects, used: new Set<string>() };
	const modules = [...subjects]
		.filter(([, subject]) => subject.kind === "module")
		.map(([id, subject]) => moduleDefinition(state, id, subject));
	const collections = [...subjects]
		.filter(([, subject]) => subject.kind === "collection")
		.map(([id, subject]) => collectionDefinition(state, id, subject));
	if (state.used.size !== subjects.size)
		throw new ArchiveError(
			"MODEL_INVALID",
			"A proposal leaves a subject without its exact holder or alternative.",
		);
	return { modules, collections };
}
export { materializedDefinitions };
