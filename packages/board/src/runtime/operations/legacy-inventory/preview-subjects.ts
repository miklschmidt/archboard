import { originalReferences } from "#runtime/operations/legacy-inventory/references.ts";
import { predecessorNames } from "#shared/rules/legacy-inventory/names.ts";
import { z } from "zod";
import { applySiblingOrder } from "#runtime/operations/legacy-inventory/preview-order.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import type { ModelDiagnostic } from "#shared/schemas/model.ts";
import { currentNodes, occurrence } from "#shared/rules/legacy-inventory/evidence.ts";
import { mappedIdentity } from "#shared/rules/legacy-inventory/plan.ts";
import {
	groupOccurrences,
	resolvedValue,
	definitionFields,
	choiceFailure,
} from "#runtime/operations/legacy-inventory/preview-choices.ts";

/**
 * Retain all distinct document evidence across explicitly combined definitions.
 * @param documents Every original evidence list.
 * @returns Unique references in original order.
 */
function uniqueValues<T>(documents: T[]): T[] {
	return [...new Map(documents.map((document) => [JSON.stringify(document), document])).values()];
}

/**
 * Retain evidence from every explicitly combined module occurrence.
 * @param inventory Original sources and reference choices.
 * @param entries Original definitions of this canonical module.
 * @returns Shared documents and explicit references.
 */
function moduleEvidence(inventory: LegacyInventory, entries: ReturnType<typeof currentNodes>) {
	const documents = uniqueValues(
		entries.flatMap(
			(entry) =>
				inventory.boards
					.find((board) => board.document?.id === entry.board)!
					.document!.variants.find((state) => state.id === entry.state)!.documents ?? [],
		),
	);
	const references = uniqueValues(
		entries.flatMap((entry) => {
			const document = inventory.boards.find(
				(board) => board.document?.id === entry.board,
			)!.document!;
			const state = document.variants.find((candidate) => candidate.id === entry.state)!;
			return originalReferences(inventory, document, state)
				.references.filter((mapping) => mapping.legacy === entry.subject)
				.map((mapping) => mapping.reference);
		}),
	);
	return { documents, references };
}

/**
 * Require one explicit canonical parent or an explicit root.
 * @param value The selected parent identity or null root.
 * @param diagnostics Contradictions that block this candidate.
 * @returns A supported optional parent field.
 */
function parentFields(value: unknown, diagnostics: ModelDiagnostic[]) {
	if (value === null) return {};
	const parent = z.string().safeParse(value);
	if (parent.success) return { parent: parent.data };
	choiceFailure(
		diagnostics,
		[],
		"A parent choice must name a canonical module or null for a root.",
	);
	return {};
}

/**
 * Compose canonical modules and source-owned relationships from explicit choices.
 * @param inventory The exact original sources and mapping plan.
 * @param diagnostics Contradictions that block the candidate.
 * @returns Synthetic module definitions with no copied historical subjects.
 */
function composeModules(inventory: LegacyInventory, diagnostics: ModelDiagnostic[]) {
	const nodes = currentNodes(inventory);
	const groups = groupOccurrences(nodes, (entry) => mappedIdentity(inventory.plan, entry.subject!));
	const modules = [...groups].map(([id, entries]) => {
		const first = entries.find((entry) => entry.subject === id) ?? entries[0]!;
		const definitions = entries.map((entry) => {
			const { id: _id, parent: _parent, order: _order, ...fields } = entry.node;
			return occurrence(entry, fields);
		});
		const { drillDown: _drillDown, ...fields } = definitionFields(
			resolvedValue(inventory, "definition", definitions, diagnostics),
			diagnostics,
		);
		const parent = resolvedValue(
			inventory,
			"parent",
			entries.map((entry) =>
				occurrence(
					entry,
					entry.node.parent === undefined
						? null
						: mappedIdentity(
								inventory.plan,
								`${inventory.plan.origin}/${entry.board}#${entry.node.parent}`,
							),
				),
			),
			diagnostics,
		);
		const { documents, references } = moduleEvidence(inventory, entries);
		const formerNames = [
			...new Set(
				entries
					.flatMap((entry) =>
						predecessorNames(inventory, entry.board, entry.state, (state) =>
							state.content.nodes
								.filter((node) => node.id === entry.node.id)
								.map((node) => node.name),
						),
					)
					.filter((name) => name !== fields["name"]),
			),
		];
		return {
			schemaVersion: 1,
			...fields,
			id,
			order: first.node.order,
			...parentFields(parent, diagnostics),
			...(documents.length === 0 ? {} : { documents }),
			...(formerNames.length === 0 ? {} : { formerNames }),
			...(references.length === 0 ? {} : { references }),
			outgoing: [] as unknown[],
			file: `modules/${id.replace("#", "/")}.module.json`,
		};
	});
	const edges = inventory.boards.flatMap(({ document, file }) => {
		const state = document?.variants.find((variant) => variant.id === document.current);
		if (document === undefined || state === undefined) return [];
		return state.content.edges.map((edge) => ({
			file,
			state: state.id,
			subject: `${inventory.plan.origin}/${document.id}#${edge.id}`,
			path: `variants.${state.id}.content.edges.${edge.id}`,
			edge,
			namespace: `${inventory.plan.origin}/${document.id}`,
		}));
	});
	for (const [id, entries] of groupOccurrences(edges, (entry) =>
		mappedIdentity(inventory.plan, entry.subject),
	)) {
		const first = entries.find((entry) => entry.subject === id) ?? entries[0]!;
		const definition = definitionFields(
			resolvedValue(
				inventory,
				"definition",
				entries.map((entry) => {
					const { id: _id, from: _from, order: _order, to, ...fields } = entry.edge;
					return {
						...entry,
						value: { ...fields, to: mappedIdentity(inventory.plan, `${entry.namespace}#${to}`) },
					};
				}),
				diagnostics,
			),
			diagnostics,
		);
		const owner = resolvedValue(
			inventory,
			"relationship-owner",
			entries.map((entry) => ({
				...entry,
				value: mappedIdentity(inventory.plan, `${entry.namespace}#${entry.edge.from}`),
			})),
			diagnostics,
		);
		const module = modules.find((candidate) => candidate.id === owner);
		if (module === undefined)
			choiceFailure(diagnostics, [id], "The relationship's selected source has no current module.");
		else module.outgoing.push({ ...definition, id, order: first.edge.order });
	}
	applySiblingOrder(inventory, modules, diagnostics);
	return modules;
}
export { composeModules, uniqueValues };
