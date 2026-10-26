import type { ArchitectureModelRead } from "#shared/schemas/model.ts";
import { everyStep } from "#shared/rules/flow-steps.ts";
import { failure } from "#runtime/operations/read/model-read.ts";

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

export { selectReferenceSubject };
