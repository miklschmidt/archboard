// Whether one piece of code or one dependency appears twice in a state. Two
// modules bound to the same code split one identity in two, and two relationships
// with the same ends and anchor draw one dependency twice. The code settles which
// copy stays, so these are warnings that name the copies, and no write reads them.

import type { ArchitectureModel } from "#shared/canonical-contracts/schemas/model.ts";
import type { VaultDiagnostic } from "#shared/schemas/vault-diagnostic.ts";
import { namesInfrastructure, pathOf } from "#runtime/check/operations/containment.ts";
import { edgeSubjects, nodeSubject } from "#runtime/check/operations/subject.ts";

type Model = Pick<ArchitectureModel, "modules" | "relationships">;
type Module = Model["modules"][number];
type Binding = NonNullable<Module["binding"]>;
type BoundModule = { readonly module: Module; readonly binding: Binding };

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
 * The canonical key that decides whether two bindings name the same code.
 * @param binding The binding.
 * @returns The key for grouping.
 */
function bindingKey(binding: Binding): string {
	return JSON.stringify([binding.repo, pathOf(binding), binding.symbol ?? ""]);
}

/**
 * Group bound modules by their normalized binding key, preserving authored order.
 * @param bound The bound modules of one state.
 * @returns Groups of modules sharing the same key.
 */
function groupByBinding(bound: readonly BoundModule[]): Map<string, BoundModule[]> {
	const groups = new Map<string, BoundModule[]>();
	for (const entry of bound) {
		const key = bindingKey(entry.binding);
		const group = groups.get(key) ?? [];
		group.push(entry);
		groups.set(key, group);
	}
	return groups;
}

/**
 * Whether an entry is a root of its duplicate group: no module in the group is its parent.
 * @param entry The bound module.
 * @param byId Every module in the same duplicate group, indexed by id.
 * @returns True when its direct parent is absent from the group.
 */
function isGroupRoot(entry: BoundModule, byId: ReadonlyMap<string, BoundModule>): boolean {
	return entry.module.parent === undefined || !byId.has(entry.module.parent);
}

/**
 * Whether a parent and direct child qualify for the infrastructure direct-child exemption.
 * @param parent The parent entry in the duplicate group.
 * @param child The direct child entry in the duplicate group.
 * @param byId Every module in the same duplicate group, indexed by id.
 * @returns True when the parent is a group root and both bind infrastructure addresses.
 */
function isExemptInfraPair(
	parent: BoundModule,
	child: BoundModule,
	byId: ReadonlyMap<string, BoundModule>,
): boolean {
	return (
		isGroupRoot(parent, byId) &&
		namesInfrastructure(parent.binding) &&
		namesInfrastructure(child.binding)
	);
}

/**
 * The parent id in the duplicate group that an entry may claim for the direct-child
 * infrastructure exemption, or undefined when it does not qualify.
 * @param entry The candidate direct child.
 * @param byId Every module in the same duplicate group, indexed by id.
 * @returns The parent's id when the pair qualifies, or undefined.
 */
function infraParentInGroup(
	entry: BoundModule,
	byId: ReadonlyMap<string, BoundModule>,
): string | undefined {
	if (entry.module.parent === undefined) return undefined;
	const parent = byId.get(entry.module.parent);
	if (parent === undefined || !isExemptInfraPair(parent, entry, byId)) return undefined;
	return parent.module.id;
}

/**
 * Direct children exempt from `BINDING_SHARED` because they share a direct parent
 * container's infrastructure address, at most one child per parent.
 * @param group Modules sharing one binding key, in authored order.
 * @param byId The same modules indexed by id.
 * @returns The ids of exempt direct children.
 */
function exemptDirectChildren(
	group: readonly BoundModule[],
	byId: ReadonlyMap<string, BoundModule>,
): Set<string> {
	const exempt = new Set<string>();
	const claimedParents = new Set<string>();
	for (const entry of group) {
		const parentId = infraParentInGroup(entry, byId);
		if (parentId === undefined || claimedParents.has(parentId)) continue;
		claimedParents.add(parentId);
		exempt.add(entry.module.id);
	}
	return exempt;
}

/**
 * Duplicate entries in one binding-key group after applying the single-direct-child
 * infrastructure exemption.
 * @param group Modules sharing one binding key, in authored order.
 * @returns Each duplicate entry paired with the kept module it duplicates.
 */
function sharedCopiesInGroup(
	group: readonly BoundModule[],
): { copy: BoundModule; first: BoundModule }[] {
	if (group.length < 2) return [];
	const byId = new Map(group.map((entry) => [entry.module.id, entry]));
	const exempt = exemptDirectChildren(group, byId);
	const remaining = group.filter((entry) => !exempt.has(entry.module.id));
	const [head] = remaining;
	if (remaining.length < 2 || head === undefined) return [];
	const first =
		remaining.find((entry) => namesInfrastructure(entry.binding) && isGroupRoot(entry, byId)) ??
		head;
	return remaining.filter((entry) => entry !== first).map((copy) => ({ copy, first }));
}

/**
 * The warning for a module bound to the same code as another module.
 * @param module The duplicate module.
 * @param binding Its code binding.
 * @param first The module that already binds that code.
 * @returns The `BINDING_SHARED` warning.
 */
function sharedBindingWarning(module: Module, binding: Binding, first: Module): VaultDiagnostic {
	return {
		severity: "warning",
		code: "BINDING_SHARED",
		file: module.file,
		subject: nodeSubject(module),
		message: `${module.name} is bound to ${codeOf(binding)}, as ${first.name} is. Read that code. If it does one job, keep the module that sits where the code sits, move every relationship, flow step and walkthrough reference onto it, and remove the other in the same intent. If it does two jobs, bind each module to the code of its own job.`,
	};
}

/**
 * Warn about each module bound to the same repository, path and symbol as another
 * module. A folder and a file inside it are different code. At most one direct
 * child may share its direct parent container's infrastructure address without
 * triggering `BINDING_SHARED`.
 * @param model The modules of one state.
 * @returns One warning for each non-exempt duplicate module, in authored order.
 */
function sharedBindings(model: Model): VaultDiagnostic[] {
	const bound = model.modules.flatMap((module) =>
		module.binding === undefined ? [] : [{ module, binding: module.binding }],
	);
	const duplicates = new Map<BoundModule, BoundModule>();
	for (const group of groupByBinding(bound).values()) {
		for (const { copy, first } of sharedCopiesInGroup(group)) {
			duplicates.set(copy, first);
		}
	}
	return bound.flatMap((entry) => {
		const first = duplicates.get(entry);
		return first === undefined
			? []
			: [sharedBindingWarning(entry.module, entry.binding, first.module)];
	});
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
