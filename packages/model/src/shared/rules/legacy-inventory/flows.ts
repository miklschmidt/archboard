import type { FlowStep, SemanticFlow } from "#shared/schemas/views.ts";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { LegacyInventory, MigrationConflict } from "#shared/schemas/migration.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
import { migrationConflict } from "#shared/rules/legacy-inventory/conflict.ts";

/**
 * Preserve recursive behavior while qualifying original references.
 * @param steps Original ordered steps.
 * @param qualify The explicit identity mapping.
 * @returns Canonical ordered steps.
 */
function qualifySteps(
	steps: FlowStep[],
	qualify: (id: string) => string,
): ArchitectureModel["collections"][number]["flows"][number]["steps"] {
	return steps.map((step) => {
		if (step.kind === "decision")
			return {
				...step,
				id: qualify(step.id),
				alternatives: step.alternatives.map((alternative) => ({
					...alternative,
					steps: qualifySteps(alternative.steps, qualify),
				})),
			};
		if (step.kind === "loop")
			return { ...step, id: qualify(step.id), steps: qualifySteps(step.steps, qualify) };
		return { ...step, id: qualify(step.id), from: qualify(step.from), to: qualify(step.to) };
	});
}

/**
 * Qualify one complete flow without adding structural relationships.
 * @param flow Original behavior.
 * @param qualify The explicit identity mapping.
 * @returns Canonical behavior without its separately mapped flow identity.
 */
function flowDefinition(flow: SemanticFlow, qualify: (id: string) => string) {
	const { id: _id, ...fields } = flow;
	return {
		...fields,
		participants: flow.participants.map(qualify),
		steps: qualifySteps(flow.steps, qualify),
	};
}

/**
 * Locate implemented flows without combining independent historical coverage.
 * @param inventory Original sources and owner choices.
 * @returns Complete mapped flow occurrences.
 */
function currentFlows(inventory: Pick<LegacyInventory, "boards" | "plan">) {
	return inventory.boards.flatMap(({ document, file }) => {
		const state = document?.variants.find((variant) => variant.id === document.current);
		if (document === undefined || state === undefined) return [];
		/**
		 * Preserve original provenance unless explicitly mapped.
		 * @param id One original identity.
		 * @returns The selected canonical identity.
		 */
		const qualify = (id: string) =>
			mappedIdentity(inventory.plan, `${inventory.plan.origin}/${document.id}#${id}`);
		return state.content.flows.map((flow) => ({
			file,
			state: state.id,
			subject: `${inventory.plan.origin}/${document.id}#${flow.id}`,
			path: `variants.${state.id}.content.flows.${flow.id}`,
			board: document.id,
			name: document.name,
			flow,
			value: flowDefinition(flow, qualify),
		}));
	});
}

/**
 * Require an explicit definition choice when deliberately combined flows disagree.
 * @param inventory Original behavior and mappings.
 * @returns Complete recursive behavior conflicts.
 */
function flowConflicts(
	inventory: Pick<LegacyInventory, "boards" | "plan" | "source">,
): MigrationConflict[] {
	const flows = currentFlows(inventory);
	const conflicts: MigrationConflict[] = [];
	for (const [index, one] of flows.entries())
		for (const other of flows.slice(index + 1)) {
			if (
				mappedIdentity(inventory.plan, one.subject) ===
					mappedIdentity(inventory.plan, other.subject) &&
				!sameSemanticValue(one.value, other.value)
			)
				conflicts.push(
					migrationConflict(
						inventory,
						"definition",
						[one, other].map(({ file, state, subject, path, value }) => ({
							file,
							state,
							subject,
							path,
							value,
						})),
					),
				);
		}
	return conflicts;
}
export { currentFlows, flowConflicts };
