import type { LegacyInventory, LegacyMappingPlan } from "#shared/schemas/migration.ts";

/**
 * Resolve an explicit alias once, preserving the original identity otherwise.
 * @param plan The owner's mapping choices.
 * @param legacy The original qualified identity.
 * @returns The explicitly selected identity or its unchanged origin.
 */
function mappedIdentity(plan: LegacyMappingPlan, legacy: string): string {
	return plan.mappings.find((mapping) => mapping.legacy === legacy)?.canonical ?? legacy;
}

/**
 * Require existing identities of one kind and a direct canonical target.
 * @param inventory The complete source identities and proposed plan.
 * @param mapping One explicit owner choice.
 * @returns A refusal reason, or undefined for a valid mapping.
 */
function identityProblem(
	inventory: LegacyInventory,
	mapping: LegacyMappingPlan["mappings"][number],
): string | undefined {
	const source = inventory.identities.find((identity) => identity.id === mapping.legacy);
	const target = inventory.identities.find((identity) => identity.id === mapping.canonical);
	if (source === undefined || target === undefined || source.kind !== target.kind)
		return `Mapping ${mapping.legacy} must name existing identities of the same kind.`;
	if (mappedIdentity(inventory.plan, mapping.canonical) !== mapping.canonical)
		return `Mapping ${mapping.legacy} must name its final canonical identity directly.`;
	return undefined;
}

/**
 * Require one current conflict and one available original value.
 * @param inventory The current source conflicts.
 * @param choice One explicit owner decision.
 * @returns A refusal reason, or undefined for a valid decision.
 */
function choiceProblem(
	inventory: LegacyInventory,
	choice: LegacyMappingPlan["choices"][number],
): string | undefined {
	const conflict = inventory.conflicts.find((candidate) => candidate.key === choice.conflict);
	if (conflict === undefined) return `Choice ${choice.conflict} must name a current conflict.`;
	if (
		choice.resolution.kind === "select" &&
		conflict.options[choice.resolution.option] === undefined
	)
		return `Choice ${choice.conflict} selects an unavailable source option.`;
	return undefined;
}

/**
 * Refuse ambiguous repeated decisions before assessing their contents.
 * @param plan The owner's complete plan.
 * @returns A refusal reason, or undefined when each choice appears once.
 */
function duplicateProblem(plan: LegacyMappingPlan): string | undefined {
	const references = plan.references ?? [];
	if (new Set(plan.mappings.map((mapping) => mapping.legacy)).size !== plan.mappings.length)
		return "Each legacy identity must have at most one mapping.";
	if (new Set(plan.choices.map((choice) => choice.conflict)).size !== plan.choices.length)
		return "Each conflict must have at most one choice.";
	if (new Set(references.map((reference) => reference.legacy)).size !== references.length)
		return "Each legacy reference must have at most one target mapping.";
	return undefined;
}

/**
 * Refuse unknown identities, kind changes, alias chains and stale choices.
 * @param inventory The fresh source inventory with the proposed plan's conflicts.
 * @returns A machine-readable explanation, or undefined for a valid plan.
 */
function mappingProblem(inventory: LegacyInventory): string | undefined {
	return (
		duplicateProblem(inventory.plan) ??
		inventory.plan.references
			?.map((reference) =>
				inventory.identities.some(
					(identity) => identity.id === reference.legacy && identity.kind === "node",
				)
					? undefined
					: `Reference ${reference.legacy} must name an existing node identity.`,
			)
			.find((problem) => problem !== undefined) ??
		inventory.plan.mappings
			.map((mapping) => identityProblem(inventory, mapping))
			.find((problem) => problem !== undefined) ??
		inventory.plan.choices
			.map((choice) => choiceProblem(inventory, choice))
			.find((problem) => problem !== undefined)
	);
}
export { mappedIdentity, mappingProblem };
