import type { ArchitectureModel, ModelDiagnostic } from "#shared/schemas/model.ts";
import type { LegacyInventory, MigrationConflict } from "#shared/schemas/migration.ts";
import { z } from "zod";
import { compareModelSubjects } from "#shared/rules/coherence/model.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import {
	groupOccurrences,
	chosenValue,
	choiceFailure,
} from "#runtime/operations/legacy-inventory/preview-choices.ts";
type OrderedModule = Pick<ArchitectureModel["modules"][number], "id" | "parent" | "order">;

/**
 * State every ordered pair without inventing positions between independent sources.
 * @param sequence The original sibling sequence.
 * @returns Directed order constraints.
 */
function orderedPairs(sequence: string[]): string[][] {
	return sequence.flatMap((one, index) => sequence.slice(index + 1).map((other) => [one, other]));
}

/**
 * Locate order choices that concern these canonical siblings.
 * @param inventory The original conflicts and plan.
 * @param ids The composed sibling identities.
 * @returns Applicable explicit order decisions.
 */
function orderDecisions(inventory: LegacyInventory, ids: Set<string>) {
	return inventory.conflicts.filter(
		(conflict) =>
			conflict.kind === "order" &&
			conflict.options.some(
				(option) =>
					Array.isArray(option.value) &&
					option.value.every((id) => typeof id === "string" && ids.has(id)),
			),
	);
}

/**
 * Preserve each original sequence except the pairs an explicit choice replaces.
 * @param inventory Original current sources and mappings.
 * @param ids The composed sibling identities.
 * @param decisions The explicit choices for disputed pairs.
 * @returns The retained original constraints.
 */
function sourceConstraints(
	inventory: LegacyInventory,
	ids: Set<string>,
	decisions: MigrationConflict[],
) {
	return inventory.boards.flatMap(({ document }) => {
		const state = document?.variants.find((variant) => variant.id === document.current);
		if (document === undefined || state === undefined) return [];
		const groups = groupOccurrences(state.content.nodes, (node) => node.parent ?? "");
		return [...groups.values()].flatMap((group) => {
			const sequence = group
				.toSorted(compareModelSubjects)
				.map((node) =>
					mappedIdentity(inventory.plan, `${inventory.plan.origin}/${document.id}#${node.id}`),
				)
				.filter((id) => ids.has(id));
			return orderedPairs([...new Set(sequence)]).filter(
				([one, other]) =>
					!decisions.some((conflict) =>
						conflict.options.some(
							(option) =>
								Array.isArray(option.value) &&
								option.value.includes(one) &&
								option.value.includes(other),
						),
					),
			);
		});
	});
}

/**
 * Apply complete owner-selected sibling sequences.
 * @param inventory The saved explicit choices.
 * @param decisions Applicable order conflicts.
 * @param diagnostics Contradictions that block this candidate.
 * @returns The selected constraints.
 */
function chosenConstraints(
	inventory: LegacyInventory,
	decisions: MigrationConflict[],
	diagnostics: ModelDiagnostic[],
) {
	return decisions.flatMap((decision) => {
		const selected = z.array(z.string()).safeParse(chosenValue(inventory, decision));
		const original = z.array(z.string()).parse(decision.options[0]!.value);
		if (
			!selected.success ||
			new Set(selected.data).size !== original.length ||
			original.some((id) => !selected.data.includes(id))
		) {
			choiceFailure(
				diagnostics,
				original,
				"An order choice must name every disputed sibling exactly once.",
			);
			return [];
		}
		return orderedPairs(selected.data);
	});
}

/**
 * Resolve all partial orders or report their contradiction.
 * @param siblings Canonical siblings in deterministic priority order.
 * @param constraints Original and selected directed pairs.
 * @param diagnostics Contradictions that block this candidate.
 * @returns A complete sequence or the coherent prefix before a cycle.
 */
function orderedModules(
	siblings: OrderedModule[],
	constraints: string[][],
	diagnostics: ModelDiagnostic[],
) {
	const remaining = new Set(siblings.map((subject) => subject.id));
	const ordered: OrderedModule[] = [];
	while (remaining.size > 0) {
		const next = siblings.find(
			(subject) =>
				remaining.has(subject.id) &&
				!constraints.some(([from, to]) => to === subject.id && remaining.has(from!)),
		);
		if (next === undefined) {
			choiceFailure(diagnostics, [...remaining], "The selected sibling orders contain a cycle.");
			break;
		}
		ordered.push(next);
		remaining.delete(next.id);
	}
	return ordered;
}

/**
 * Preserve authored positions while honoring explicit relative-order choices.
 * @param inventory Original coverage and choices.
 * @param modules The complete composed modules.
 * @param diagnostics Contradictions that block the candidate.
 */
function applySiblingOrder(
	inventory: LegacyInventory,
	modules: OrderedModule[],
	diagnostics: ModelDiagnostic[],
) {
	for (const group of groupOccurrences(modules, (subject) => subject.parent ?? "").values()) {
		const siblings = group.toSorted(compareModelSubjects);
		const ids = new Set(siblings.map((subject) => subject.id));
		const decisions = orderDecisions(inventory, ids);
		const constraints = [
			...sourceConstraints(inventory, ids, decisions),
			...chosenConstraints(inventory, decisions, diagnostics),
		];
		const ordered = orderedModules(siblings, constraints, diagnostics);
		if (ordered.every((subject, index) => subject === siblings[index])) continue;
		const positions = siblings.map((subject) => subject.order);
		let previous = -1;
		ordered.forEach((subject, index) => {
			subject.order = Math.max(positions[index]!, previous + 1);
			previous = subject.order;
		});
	}
}
export { applySiblingOrder };
