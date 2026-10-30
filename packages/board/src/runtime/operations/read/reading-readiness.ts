import type { ArchitectureModel, ModelDiagnostic } from "#shared/schemas/model.ts";
import { everyStep } from "#shared/rules/flow-steps.ts";

type Reading = ArchitectureModel["walkthroughs"][number]["beats"][number]["reading"];

/**
 * Identify missing references without invalidating other beats.
 * @param model The pinned target.
 * @param reading One complete reading instruction.
 * @returns Missing stable identities.
 */
function missingSubjects(model: ArchitectureModel, reading: Reading): string[] {
	const flows = model.collections.flatMap((collection) => collection.flows);
	const modules = new Set(model.modules.map((module) => module.id));
	const subjects = new Set([
		...modules,
		...model.relationships.map((edge) => edge.id),
		...flows.flatMap((flow) => [flow.id, ...everyStep(flow.steps).map((step) => step.id)]),
		...model.collections.map((collection) => `${model.manifest.id}#${collection.id}`),
	]);
	const visible = reading.visibility ?? { modules: [], relationships: [], flows: [] };
	const scope = reading.scope === undefined ? [] : [reading.scope];
	const flow = reading.flow === undefined ? [] : [reading.flow];
	return [
		...new Set([
			...[...scope, ...reading.focus, ...visible.modules].filter((id) => !modules.has(id)),
			...reading.selection.filter((id) => !subjects.has(id)),
			...visible.relationships.filter((id) => !model.relationships.some((edge) => edge.id === id)),
			...[...visible.flows, ...flow].filter((id) => !flows.some((entry) => entry.id === id)),
		]),
	];
}
/**
 * Keep vocabulary errors with the affected reading.
 * @param model The pinned target.
 * @param reading One reading.
 * @returns Whether a filter is unavailable.
 */
function missingFilters(model: ArchitectureModel, reading: Reading): boolean {
	return (
		reading.filters.relationships.some(
			(kind) => !Object.hasOwn(model.policy.relationshipKinds, kind),
		) || reading.filters.groups.some((group) => !Object.hasOwn(model.policy.groups, group))
	);
}
/**
 * Explain unavailable reading instructions.
 * @param model The pinned target.
 * @param reading The complete reading instruction.
 * @param file The authored source file.
 * @param id The reading identity.
 * @param kind The diagnostic owner.
 * @returns Actionable diagnostics.
 */
function readingDiagnostics(
	model: ArchitectureModel,
	reading: Reading,
	file: string,
	id: string,
	kind: "WALKTHROUGH" | "BOOKMARK",
): ModelDiagnostic[] {
	const diagnostics: ModelDiagnostic[] = [];
	const subject = kind === "WALKTHROUGH" ? "beat" : "bookmark";
	const missing = missingSubjects(model, reading);
	if (missing.length > 0)
		diagnostics.push({
			code: `${kind}_SUBJECT_MISSING`,
			file,
			subjects: missing,
			message: `This ${subject} refers to subjects absent from the selected reading.`,
			recovery: `Restore the subjects or ask an agent to repair this ${subject}, then read it again.`,
		});
	if (reading.grammar !== "architecture" && reading.flow === undefined)
		diagnostics.push({
			code: "FLOW_REQUIRED",
			file,
			subjects: [id],
			message: `This behavioral ${subject} names no flow.`,
			recovery: `Ask an agent to select an authored flow for this ${subject}, then read it again.`,
		});
	if (missingFilters(model, reading))
		diagnostics.push({
			code: `${kind}_FILTER_MISSING`,
			file,
			subjects: [id],
			message: `This ${subject} names a filter absent from the selected policy.`,
			recovery: `Ask an agent to repair the ${subject} filters, then read it again.`,
		});
	return diagnostics;
}
export { readingDiagnostics };
