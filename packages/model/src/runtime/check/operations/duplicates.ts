// Whether one piece of code or one dependency appears twice in a state. Two
// modules bound to the same code split one identity in two, and two relationships
// with the same ends and anchor draw one dependency twice. The code settles which
// copy stays, so these are warnings that name the copies, and no write reads them.

import type { ArchitectureModel } from "#shared/canonical-contracts/schemas/model.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { pathOf } from "#runtime/check/operations/containment.ts";
import { edgeSubjects, nodeSubject } from "#runtime/check/operations/subject.ts";

type Model = Pick<ArchitectureModel, "modules" | "relationships">;
type Binding = NonNullable<Model["modules"][number]["binding"]>;

/**
 * Each item whose key an earlier item has, beside that earlier item.
 * @param items The items in authored order.
 * @param keyOf The key of an item, or undefined to leave it out.
 * @returns Each later item and the first item with its key, in authored order.
 */
function repeated<T>(
	items: readonly T[],
	keyOf: (item: T) => string | undefined,
): { copy: T; first: T }[] {
	const firsts = new Map<string, T>();
	return items.flatMap((copy) => {
		const key = keyOf(copy);
		if (key === undefined) return [];
		const first = firsts.get(key);
		if (first === undefined) firsts.set(key, copy);
		return first === undefined ? [] : [{ copy, first }];
	});
}

/**
 * A binding as a reader names it.
 * @param binding The binding.
 * @returns Its path, and its symbol after `#`.
 */
function codeOf(binding: Binding): string {
	return `${pathOf(binding) || "."}${binding.symbol === undefined ? "" : `#${binding.symbol}`}`;
}

/**
 * Warn about each module bound to the same repository, path and symbol as an
 * earlier module. A folder and a file inside it are different code.
 * @param model The modules of one state.
 * @returns One warning for each later module of a group, on its own file.
 */
function sharedBindings(model: Model): VaultDiagnostic[] {
	const bound = model.modules.flatMap((module) =>
		module.binding === undefined ? [] : [{ module, binding: module.binding }],
	);
	const copies = repeated(bound, ({ binding }) =>
		JSON.stringify([binding.repo, pathOf(binding), binding.symbol ?? ""]),
	);
	return copies.map(({ copy: { module, binding }, first }) => ({
		severity: "warning",
		code: "BINDING_SHARED",
		file: module.file,
		subject: nodeSubject(module),
		message: `${module.name} is bound to ${codeOf(binding)}, as ${first.module.name} is. Read that code. If it does one job, keep the module that sits where the code sits, move every relationship, flow step and walkthrough reference onto it, and remove the other in the same intent. If it does two jobs, bind each module to the code of its own job.`,
	}));
}

/**
 * Warn about each relationship with the same source, target and anchor as an
 * earlier one. A relationship without an anchor names no code to compare.
 * @param model The modules and relationships of one state.
 * @returns One warning for each later relationship of a group, on the file of its source.
 */
function repeatedRelationships(model: Model): VaultDiagnostic[] {
	const files = new Map(model.modules.map(({ id, file }) => [id, file]));
	const subject = edgeSubjects({ nodes: model.modules });
	const copies = repeated(model.relationships, ({ from, to, anchor }) =>
		anchor === undefined
			? undefined
			: JSON.stringify([from, to, anchor.repo, pathOf(anchor), anchor.symbol]),
	);
	return copies.map(({ copy, first }) => ({
		severity: "warning",
		code: "RELATIONSHIP_REPEATED",
		file: files.get(copy.from) ?? "",
		subject: subject(copy),
		message: `It has the same ends and anchor as ${subject(first).name} (${first.id}), so the model states one dependency twice. Read the anchored code, keep the relationship whose kind and label say what it does, and remove the other.`,
	}));
}

/**
 * Report the code and the dependencies that one state names twice.
 * @param model The modules and relationships of that state.
 * @returns The warnings about shared bindings, then about repeated relationships.
 */
function duplicateDiagnostics(model: Model): VaultDiagnostic[] {
	return [...sharedBindings(model), ...repeatedRelationships(model)];
}

export { duplicateDiagnostics };
