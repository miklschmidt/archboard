import type {
	LegacyInventory,
	LegacyOccurrence,
	MigrationConflict,
} from "#shared/schemas/migration.ts";
import { migrationConflict } from "#shared/rules/legacy-inventory/conflict.ts";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
import { currentNodes, occurrence } from "#shared/rules/legacy-inventory/evidence.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";

type PlanningInputs = Pick<LegacyInventory, "boards" | "plan" | "source">;

/**
 * Group authored siblings by original family and parent.
 * @param inventory Original current definitions and explicit mappings.
 * @returns Siblings in authored order within their original holder.
 */
function orderedSiblings(inventory: PlanningInputs) {
	const groups = new Map<string, ReturnType<typeof currentNodes>>();
	for (const node of currentNodes(inventory)) {
		const key = `${node.board}:${node.node.parent ?? ""}`;
		const group = groups.get(key) ?? [];
		group.push(node);
		groups.set(key, group);
	}
	return [...groups.values()].map((nodes) =>
		nodes.toSorted((one, other) => one.node.order - other.node.order),
	);
}

/**
 * Report reversed common siblings without treating absolute order numbers as identity.
 * @param inventory Original definitions and explicit canonical mappings.
 * @returns Disagreements about shared sibling order.
 */
function siblingOrderConflicts(inventory: PlanningInputs): MigrationConflict[] {
	const ordered = orderedSiblings(inventory);
	const conflicts: MigrationConflict[] = [];
	for (const [index, one] of ordered.entries())
		for (const other of ordered.slice(index + 1)) {
			if (one[0]!.board === other[0]!.board) continue;
			const left = one.map((node) => mappedIdentity(inventory.plan, node.subject!));
			const right = other.map((node) => mappedIdentity(inventory.plan, node.subject!));
			const commonLeft = left.filter((id) => right.includes(id));
			const commonRight = right.filter((id) => left.includes(id));
			if (commonLeft.length > 1 && !sameSemanticValue(commonLeft, commonRight))
				conflicts.push(
					migrationConflict(inventory, "order", [
						occurrence(one[0]!, commonLeft),
						occurrence(other[0]!, commonRight),
					]),
				);
		}
	return conflicts;
}

/**
 * Compare relationships only after an owner explicitly combines their identities.
 * @param inventory The complete original documents and mapping choices.
 * @returns Competing definitions and source owners for shared relationships.
 */
function relationshipConflicts(inventory: PlanningInputs): MigrationConflict[] {
	const edges = inventory.boards.flatMap(({ document, file }) => {
		const state = document?.variants.find((variant) => variant.id === document.current);
		if (document === undefined || state === undefined) return [];
		return state.content.edges.map((edge) => ({
			file,
			state: state.id,
			subject: `${inventory.plan.origin}/${document.id}#${edge.id}`,
			path: `variants.${state.id}.content.edges.${edge.id}`,
			value: edge,
			edge,
			namespace: `${inventory.plan.origin}/${document.id}`,
		}));
	});
	const conflicts: MigrationConflict[] = [];
	for (const [index, one] of edges.entries())
		for (const other of edges.slice(index + 1)) {
			if (
				mappedIdentity(inventory.plan, one.subject) !==
				mappedIdentity(inventory.plan, other.subject)
			)
				continue;
			const source = mappedIdentity(inventory.plan, `${one.namespace}#${one.edge.from}`);
			const alternative = mappedIdentity(inventory.plan, `${other.namespace}#${other.edge.from}`);
			/**
			 * Preserve the original relationship coordinates with a candidate value.
			 * @param entry The original relationship occurrence.
			 * @param value The candidate source or definition.
			 * @returns The selectable source option.
			 */
			const option = (entry: typeof one, value: unknown): LegacyOccurrence => ({
				file: entry.file,
				state: entry.state,
				subject: entry.subject,
				path: entry.path,
				value,
			});
			if (source !== alternative)
				conflicts.push(
					migrationConflict(inventory, "relationship-owner", [
						option(one, source),
						option(other, alternative),
					]),
				);
			/**
			 * Compare payload separately from ownership and placement.
			 * @param entry The original relationship occurrence.
			 * @returns Its canonical target and original definition fields.
			 */
			const definition = (entry: typeof one) => {
				const { id: _id, from: _from, order: _order, to, ...rest } = entry.edge;
				return { ...rest, to: mappedIdentity(inventory.plan, `${entry.namespace}#${to}`) };
			};
			if (!sameSemanticValue(definition(one), definition(other)))
				conflicts.push(
					migrationConflict(inventory, "definition", [
						option(one, definition(one)),
						option(other, definition(other)),
					]),
				);
		}
	return conflicts;
}
export { siblingOrderConflicts, relationshipConflicts };
