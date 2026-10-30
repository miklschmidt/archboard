// What the semantics check says about the shape of a canonical model: a
// container that gathers nothing, and a root that nothing connects. A shape is
// a signal and never proves that a module has no job, so these are warnings
// and no write reads them. Neither rule reads a name, a count or a folder.

import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { nodeSubject } from "#runtime/operations/check/subject.ts";

type ModelStructure = Pick<ArchitectureModel, "modules" | "relationships" | "collections">;

/**
 * The containers with two ends of one exchange in different parts.
 * @param ends The modules of one relationship or one flow.
 * @param parents Each contained module's parent.
 * @returns The ids of the containers that this exchange joins.
 */
function joinedContainers(
	ends: readonly string[],
	parents: ReadonlyMap<string, string>,
): readonly string[] {
	const parts = new Map<string, Set<string>>();
	for (const end of ends) {
		let part = end;
		for (let parent = parents.get(part); parent !== undefined; parent = parents.get(part)) {
			parts.set(parent, (parts.get(parent) ?? new Set()).add(part));
			part = parent;
		}
	}
	return [...parts].filter(([, held]) => held.size > 1).map(([container]) => container);
}

/**
 * The root that holds a module.
 * @param id The module.
 * @param parents Each contained module's parent.
 * @returns Its root, which is the module itself when it is a root.
 */
function rootOf(id: string, parents: ReadonlyMap<string, string>): string {
	const parent = parents.get(id);
	return parent === undefined ? id : rootOf(parent, parents);
}

/**
 * Warn about a pass-through container: it has parts, no binding, no relationship
 * or flow that names it, and no relationship or flow that joins two of its parts.
 * A single part is the plain case. A model that binds no code says nothing by
 * leaving a container unbound, so the rule reads only a model that binds some.
 * @param model The modules and exchanges of one state.
 * @param parents Each contained module's parent.
 * @returns One warning for each pass-through container.
 */
function passThroughContainers(
	model: ModelStructure,
	parents: ReadonlyMap<string, string>,
): VaultDiagnostic[] {
	if (!model.modules.some((module) => module.binding !== undefined)) return [];
	const exchanges = [
		...model.relationships.map((relationship) => [relationship.from, relationship.to]),
		...model.collections.flatMap(({ flows }) => flows.map((flow) => flow.participants)),
	];
	const named = new Set(exchanges.flat());
	const joined = new Set(exchanges.flatMap((ends) => joinedContainers(ends, parents)));
	const containers = new Set(parents.values());
	return model.modules
		.filter(
			(module) =>
				containers.has(module.id) &&
				module.binding === undefined &&
				!named.has(module.id) &&
				!joined.has(module.id),
		)
		.map((module) => ({
			severity: "warning",
			code: "CONTAINER_PASS_THROUGH",
			file: module.file,
			subject: nodeSubject(module),
			message: `${module.name} has no binding, no relationship and no flow of its own, and nothing connects its parts. Bind it to the code it owns, or author the relationship or flow that gives it a job. If it has neither, move its parts to its parent and remove it. A configured group gathers parts without a container.`,
		}));
}

/**
 * Warn about a root with no relationship to another root, which a reading of
 * the whole model draws with no line. A relationship of a part inside it counts.
 * A lone root has no other root to connect to, so the rule needs two.
 * @param model The modules and relationships of one state.
 * @param parents Each contained module's parent.
 * @returns One warning for each unconnected root.
 */
function unconnectedRoots(
	model: ModelStructure,
	parents: ReadonlyMap<string, string>,
): VaultDiagnostic[] {
	const roots = model.modules.filter((module) => module.parent === undefined);
	if (roots.length < 2) return [];
	const connected = new Set(
		model.relationships.flatMap(({ from, to }) => {
			const ends = [rootOf(from, parents), rootOf(to, parents)];
			return ends[0] === ends[1] ? [] : ends;
		}),
	);
	return roots
		.filter((module) => !connected.has(module.id))
		.map((module) => ({
			severity: "warning",
			code: "ROOT_UNCONNECTED",
			file: module.file,
			subject: nodeSubject(module),
			message: `${module.name} is a root with no relationship to another root, so the model's root reading draws no line to it. Author the relationship that the code establishes, or move the module into the module that uses it.`,
		}));
}

/**
 * Warn about the shape of one coherent state.
 * @param model The modules and exchanges of that state.
 * @returns The warnings, in the order of the modules within each rule.
 */
function structureDiagnostics(model: ModelStructure): VaultDiagnostic[] {
	const parents = new Map(
		model.modules.flatMap(({ id, parent }) =>
			parent === undefined ? [] : [[id, parent] as const],
		),
	);
	return [...passThroughContainers(model, parents), ...unconnectedRoots(model, parents)];
}

export { structureDiagnostics };
