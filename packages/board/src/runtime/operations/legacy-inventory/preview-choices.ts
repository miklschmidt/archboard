import { z } from "zod";
import type {
	LegacyInventory,
	LegacyOccurrence,
	MigrationConflict,
} from "#shared/schemas/migration.ts";
import type { ModelDiagnostic } from "#shared/schemas/model.ts";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";

/**
 * Report a decision that cannot define one coherent candidate.
 * @param diagnostics The candidate's refusals.
 * @param subjects The affected canonical identities.
 * @param message The contradictory choice.
 */
function choiceFailure(diagnostics: ModelDiagnostic[], subjects: string[], message: string) {
	diagnostics.push({
		code: "MAPPING_INVALID",
		file: ".archboard/migration-plan.json",
		subjects,
		message,
		recovery: "Revise the explicit choices against a fresh inventory and preview again.",
	});
}

/**
 * Read the exact selected source value or explicit replacement.
 * @param inventory The current plan and conflicts.
 * @param conflict The resolved decision.
 * @returns Its explicit value.
 */
function chosenValue(inventory: LegacyInventory, conflict: MigrationConflict): unknown {
	const choice = inventory.plan.choices.find((entry) => entry.conflict === conflict.key)!;
	return choice.resolution.kind === "value"
		? choice.resolution.value
		: conflict.options[choice.resolution.option]!.value;
}

/**
 * Require competing pairwise decisions to describe one final fact.
 * @param inventory The exact mapping plan.
 * @param kind The fact being resolved.
 * @param entries Original occurrences of one canonical subject.
 * @param diagnostics The accumulated contradictions.
 * @returns The agreed value, or the first original value for later validation.
 */
function resolvedValue(
	inventory: LegacyInventory,
	kind: MigrationConflict["kind"],
	entries: LegacyOccurrence[],
	diagnostics: ModelDiagnostic[],
): unknown {
	const subjects = entries.flatMap((entry) => (entry.subject === undefined ? [] : [entry.subject]));
	const decisions = inventory.conflicts.filter(
		(conflict) =>
			conflict.kind === kind &&
			conflict.options.every(
				(option) => option.subject !== undefined && subjects.includes(option.subject),
			),
	);
	const values =
		decisions.length === 0
			? entries.map((entry) => entry.value)
			: decisions.map((conflict) => chosenValue(inventory, conflict));
	const selected = values[0];
	if (values.some((value) => !sameSemanticValue(value, selected)))
		choiceFailure(
			diagnostics,
			subjects,
			"The explicit choices do not define one value for this canonical subject.",
		);
	return selected;
}

/**
 * Keep definitions as JSON objects without accepting a primitive replacement.
 * @param value The selected definition.
 * @param diagnostics The accumulated contradictions.
 * @returns The selected object or an invalid empty definition.
 */
function definitionFields(value: unknown, diagnostics: ModelDiagnostic[]) {
	const result = z.record(z.string(), z.unknown()).safeParse(value);
	if (result.success) return result.data;
	choiceFailure(diagnostics, [], "A definition choice must contain a complete definition object.");
	return {};
}

/**
 * Group original occurrences by the canonical fact they define.
 * @param entries Original semantic occurrences.
 * @param identity The grouping identity.
 * @returns Ordered occurrences for each fact.
 */
function groupOccurrences<T>(entries: T[], identity: (entry: T) => string): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const entry of entries) {
		const id = identity(entry);
		const group = groups.get(id) ?? [];
		group.push(entry);
		groups.set(id, group);
	}
	return groups;
}
export { chosenValue, resolvedValue, definitionFields, choiceFailure, groupOccurrences };
