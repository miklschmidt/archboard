import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
import type {
	LegacyInventory,
	LegacyOccurrence,
	MigrationConflict,
} from "#shared/schemas/migration.ts";
import { migrationConflict } from "#shared/rules/legacy-inventory/conflict.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import { resolveVariant } from "#shared/schemas/board-document.ts";
import type { SemanticNode } from "#shared/schemas/content.ts";

/** The original state and location of a current module definition. */
type LegacyNode = LegacyOccurrence & { node: SemanticNode; board: string };
type PlanningInputs = Pick<LegacyInventory, "boards" | "plan" | "source">;

/**
 * Locate implemented definitions without combining independent historical states.
 * @param inventory The complete original coverage and origin namespace.
 * @returns Nodes in each board's designated current state only.
 */
function currentNodes(inventory: Pick<LegacyInventory, "boards" | "plan">): LegacyNode[] {
	return inventory.boards.flatMap(({ document, file }) => {
		const state = document?.variants.find((variant) => variant.id === document.current);
		if (state === undefined || document === undefined) return [];
		return state.content.nodes.map((node) => ({
			file,
			state: state.id,
			board: document.id,
			subject: `${inventory.plan.origin}/${document.id}#${node.id}`,
			path: `variants.${state.id}.content.nodes.${node.id}`,
			value: node,
			node,
		}));
	});
}

/**
 * Distinguish explicit separate subjects from possible duplicates.
 * @param inventory The owner's mappings.
 * @param one One original identity.
 * @param other The other original identity.
 * @returns Whether both subjects explicitly map to different identities.
 */
function explicitlySeparate(
	inventory: PlanningInputs,
	one: LegacyNode,
	other: LegacyNode,
): boolean {
	return (
		[one, other].every((node) =>
			inventory.plan.mappings.some((mapping) => mapping.legacy === node.subject),
		) &&
		mappedIdentity(inventory.plan, one.subject!) !== mappedIdentity(inventory.plan, other.subject!)
	);
}

/**
 * Remove identity and structural placement from a node's original definition.
 * @param node The original module.
 * @returns Its authored definition fields.
 */
function nodeDefinition(node: SemanticNode) {
	const { id: _id, parent: _parent, order: _order, ...definition } = node;
	return definition;
}

/**
 * Qualify a parent without inventing containment between independent boards.
 * @param inventory The owner's mappings and origin namespace.
 * @param entry The original node occurrence.
 * @returns Its selected parent identity, or null for a root.
 */
function mappedParent(inventory: PlanningInputs, entry: LegacyNode): string | null {
	return entry.node.parent === undefined
		? null
		: mappedIdentity(
				inventory.plan,
				`${inventory.plan.origin}/${entry.board}#${entry.node.parent}`,
			);
}

/**
 * Expose competing definitions and parents for one possible shared subject.
 * @param inventory The exact source and mapping choices.
 * @param one One original definition.
 * @param other The other original definition.
 * @returns Unselected source values for each conflicting fact.
 */
function nodeConflicts(
	inventory: PlanningInputs,
	one: LegacyNode,
	other: LegacyNode,
): MigrationConflict[] {
	const conflicts: MigrationConflict[] = [];
	if (!sameSemanticValue(nodeDefinition(one.node), nodeDefinition(other.node)))
		conflicts.push(
			migrationConflict(inventory, "definition", [
				occurrence(one, nodeDefinition(one.node)),
				occurrence(other, nodeDefinition(other.node)),
			]),
		);
	if (mappedParent(inventory, one) !== mappedParent(inventory, other))
		conflicts.push(
			migrationConflict(inventory, "parent", [
				occurrence(one, mappedParent(inventory, one)),
				occurrence(other, mappedParent(inventory, other)),
			]),
		);
	return conflicts;
}

/**
 * Distinguish a shared exact binding from two absent bindings.
 * @param one One original definition.
 * @param other The other original definition.
 * @returns Whether both carry the same authored code binding.
 */
function matchingBinding(one: LegacyNode, other: LegacyNode): boolean {
	return one.node.binding !== undefined && sameSemanticValue(one.node.binding, other.node.binding);
}

/**
 * Compare one pair while keeping evidence separate from explicit identity choices.
 * @param inventory The original documents and owner's mappings.
 * @param one One original definition.
 * @param other The other original definition.
 * @returns Evidence and unresolved decisions, without creating a mapping.
 */
function pairEvidence(
	inventory: PlanningInputs,
	one: LegacyNode,
	other: LegacyNode,
): Pick<LegacyInventory, "evidence" | "conflicts"> {
	const evidence: LegacyInventory["evidence"] = [];
	const subjects = [one.subject!, other.subject!];
	if (one.node.name === other.node.name)
		evidence.push({ kind: "name", subjects, detail: one.node.name });
	if (matchingBinding(one, other))
		evidence.push({ kind: "binding", subjects, detail: JSON.stringify(one.node.binding) });
	const candidate =
		evidence.length > 0 ||
		mappedIdentity(inventory.plan, one.subject!) === mappedIdentity(inventory.plan, other.subject!);
	return {
		evidence,
		conflicts:
			candidate && !explicitlySeparate(inventory, one, other)
				? nodeConflicts(inventory, one, other)
				: [],
	};
}

/**
 * Retain a drill-down as evidence without treating its roots as the linked subject.
 * @param inventory The complete original board coverage.
 * @param one The node that carries the original link.
 * @returns The original link and available target identities.
 */
function drillEvidence(inventory: PlanningInputs, one: LegacyNode): LegacyInventory["evidence"] {
	const link = one.node.drillDown;
	if (link === undefined) return [];
	return [
		{
			kind: "drill-down",
			subjects: [one.subject!, ...linkedRootIds(inventory, link)],
			detail: JSON.stringify(link),
		},
	];
}

/**
 * Locate the roots a local original link reads, without asserting equivalence.
 * @param inventory The original families and import namespace.
 * @param link The original drill-down reference.
 * @returns Available target identities, or none for an unavailable target.
 */
function linkedRootIds(
	inventory: PlanningInputs,
	link: NonNullable<SemanticNode["drillDown"]>,
): string[] {
	if (link.repo !== undefined) return [];
	const target = inventory.boards.find(
		({ document }) => document?.name === link.board || document?.formerNames?.includes(link.board),
	)?.document;
	if (target === undefined) return [];
	const state = resolveVariant(
		target,
		link.variant.kind === "current" ? undefined : link.variant.name,
	);
	const nodes = state === undefined ? [] : state.content.nodes;
	return nodes
		.filter((node) => node.parent === undefined)
		.map((node) => `${inventory.plan.origin}/${target.id}#${node.id}`);
}

/**
 * Compare possible duplicates without selecting a canonical identity.
 * @param inventory The original documents and explicit mapping choices.
 * @returns Evidence and conflicts for deliberate owner decisions.
 */
function identityEvidence(
	inventory: PlanningInputs,
): Pick<LegacyInventory, "evidence" | "conflicts"> {
	const nodes = currentNodes(inventory);
	const evidence: LegacyInventory["evidence"] = [];
	const conflicts: MigrationConflict[] = [];
	for (const [index, one] of nodes.entries()) {
		for (const other of nodes.slice(index + 1)) {
			if (
				one.board === other.board &&
				mappedIdentity(inventory.plan, one.subject!) !==
					mappedIdentity(inventory.plan, other.subject!)
			)
				continue;
			const pair = pairEvidence(inventory, one, other);
			evidence.push(...pair.evidence);
			conflicts.push(...pair.conflicts);
		}
		evidence.push(...drillEvidence(inventory, one));
	}
	return { evidence, conflicts };
}

/**
 * Retain only the public source coordinates and candidate value.
 * @param node The original current occurrence.
 * @param value The candidate field or definition.
 * @returns The selectable conflict option.
 */
function occurrence(node: LegacyOccurrence, value: unknown): LegacyOccurrence {
	return { file: node.file, state: node.state, subject: node.subject, path: node.path, value };
}
export { identityEvidence, currentNodes, occurrence };
