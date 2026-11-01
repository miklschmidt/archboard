import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import { everyStep, stepWords } from "#shared/rules/flow-steps.ts";
import { failure } from "#runtime/operations/read/model-read.ts";

/**
 * Read a destination's authored name from the addressed architecture.
 * @param model The coherent foreign reading.
 * @param subject The exact subject identity.
 * @returns Its readable name, or its identity when no name exists.
 */
function referenceSubjectName(model: ArchitectureModel, subject: string): string {
	const module = model.modules.find((candidate) => candidate.id === subject);
	if (module !== undefined) return module.name;
	const relationship = model.relationships.find((candidate) => candidate.id === subject);
	if (relationship !== undefined) return relationship.label || subject;
	return behaviorSubjectName(model, subject);
}

/**
 * Flow collections and nested steps retain their own authored labels.
 * @param model The coherent foreign reading.
 * @param subject The exact behavior identity.
 * @returns Its authored label, or its identity when absent.
 */
function behaviorSubjectName(model: ArchitectureModel, subject: string): string {
	for (const collection of model.collections) {
		if (`${model.manifest.id}#${collection.id}` === subject) return collection.name;
		for (const flow of collection.flows) {
			if (flow.id === subject) return flow.name;
			const step = everyStep(flow.steps).find((candidate) => candidate.id === subject);
			if (step !== undefined) return stepWords(step);
		}
	}
	return subject;
}

/**
 * Select an explicit canonical subject without changing its kind or ownership.
 * @param reading The complete current or retained foreign reading.
 * @param subject The exact qualified subject identity.
 * @returns Its coherent reading and selection or an unavailable subject refusal.
 */
function selectReferenceSubject(
	reading: ArchitectureModelRead,
	subject: string,
): ArchitectureModelRead {
	if (!reading.success) return reading;
	const selected = { ...reading, selectedSubject: subject };
	if (reading.modules.some((module) => module.id === subject))
		return { ...selected, selectedModule: subject };
	if (reading.relationships.some((relationship) => relationship.id === subject)) return selected;
	if (
		reading.collections.some((collection) => `${reading.manifest.id}#${collection.id}` === subject)
	)
		return selected;
	const flow = reading.collections
		.flatMap((collection) => collection.flows)
		.find(
			(candidate) =>
				candidate.id === subject || everyStep(candidate.steps).some((step) => step.id === subject),
		);
	if (flow !== undefined) return { ...selected, selectedFlow: flow.id };
	return failure("REFERENCE_UNAVAILABLE", [
		{
			code: "REFERENCE_UNAVAILABLE",
			file: "model.json",
			subjects: [subject],
			message: "The referenced subject is absent from this exact foreign reading.",
			recovery:
				"Restore the addressed subject and state or author a reference to an existing subject.",
		},
	]);
}

export { selectReferenceSubject, referenceSubjectName };
