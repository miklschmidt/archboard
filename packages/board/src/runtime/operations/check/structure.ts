// What the semantics check says about one state of a canonical model. Four rules
// read its shape: a container that gathers nothing, a root that nothing connects,
// a relationship between a module and a part that it holds, and a relationship
// that ends on a module with parts. A shape is a signal and never proves that a
// module has no job, so these are warnings and no write reads them. No rule reads
// a name, a count or a folder. The fifth rule is an error: a current flow with no
// summary breaks what every write of a flow now keeps, and a reader can still read
// it.

import type { ArchitectureModel } from "#shared/schemas/model.ts";
import { containersOf } from "#shared/rules/scope.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { edgeSubjects, nodeSubject } from "#runtime/operations/check/subject.ts";

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
 * Whether a relationship joins a module and a part that it holds, at any depth.
 * @param relationship The relationship.
 * @param relationship.from Its start.
 * @param relationship.to Its end.
 * @param parents Each contained module's parent.
 * @returns True when one end holds the other.
 */
function joinsOwnPart(
	{ from, to }: Pick<ModelStructure["relationships"][number], "from" | "to">,
	parents: ReadonlyMap<string, string>,
): boolean {
	return containersOf(parents, to).includes(from) || containersOf(parents, from).includes(to);
}

/**
 * Warn about a relationship between a module and a part that it holds, at any depth. The nesting
 * already shows that, so a reading that opens the module draws no line for it. A call inside a
 * container starts at the part that makes it (ADR 0052).
 * @param model The modules and relationships of one state.
 * @param parents Each contained module's parent.
 * @returns One warning for each such relationship, on the file of the module that owns it.
 */
function linesToOwnParts(
	model: ModelStructure,
	parents: ReadonlyMap<string, string>,
): VaultDiagnostic[] {
	const owned = model.relationships.filter((relationship) => joinsOwnPart(relationship, parents));
	const subject = edgeSubjects({ nodes: model.modules });
	return model.modules.flatMap((module) =>
		owned
			.filter(({ from }) => from === module.id)
			.map((relationship) => ({
				severity: "warning" as const,
				code: "CONTAINER_LINE_TO_OWN_PART",
				file: module.file,
				subject: subject(relationship),
				message:
					"It joins a module and a part inside it, which the nesting already shows, so a reading that opens the module draws no line for it. Read the source, then start or end it at the part that makes or answers the call: an edit-relationship change with source or set.to. If the source shows no such call, remove it.",
			})),
	);
}

/**
 * Warn about a relationship from outside a module with parts that ends on that module. It makes a
 * caller and no entry point, so the module's parts read as hidden (ADR 0044). The frame line stays
 * drawn until an author repairs the relationship.
 * @param model The modules and relationships of one state.
 * @param parents Each contained module's parent.
 * @returns One warning for each such relationship, on the file of the module that owns it.
 */
function linesOnContainers(
	model: ModelStructure,
	parents: ReadonlyMap<string, string>,
): VaultDiagnostic[] {
	const containers = new Set(parents.values());
	const onFrame = model.relationships.filter(
		(relationship) =>
			(containers.has(relationship.from) || containers.has(relationship.to)) &&
			!joinsOwnPart(relationship, parents),
	);
	const subject = edgeSubjects({ nodes: model.modules });
	return model.modules.flatMap((module) =>
		onFrame
			.filter(({ from }) => from === module.id)
			.map((relationship) => ({
				severity: "warning" as const,
				code: "RELATIONSHIP_ON_CONTAINER",
				file: module.file,
				subject: subject(relationship),
				message:
					"It ends on a module with parts, so it makes a caller and no entry point, and the module's parts read as hidden. Read the source, then end it on the part that makes or answers the call: an edit-relationship change with source or set.to. If the module's own file makes or answers it, add a part for that file first.",
			})),
	);
}

/**
 * Name each flow that says nothing about what it does. The flows in a file written before the
 * rule stay readable, so the author can repair them one write at a time.
 * @param model The flows of one state.
 * @returns One error for each flow with no summary.
 */
function unexplainedFlows(model: ModelStructure): VaultDiagnostic[] {
	return model.collections.flatMap((collection) =>
		collection.flows
			.filter((flow) => flow.summary === undefined)
			.map((flow) => ({
				severity: "error" as const,
				code: "FLOW_SUMMARY_MISSING",
				file: collection.file,
				subject: { kind: "flow" as const, id: flow.id, name: flow.name },
				message: `This flow in ${collection.name} has no summary, so a reader cannot tell what it does. Read its code, then write one or two sentences through model edit: an edit-flow change with set.summary.`,
			})),
	);
}

/**
 * Report on one coherent state.
 * @param model The modules and exchanges of that state.
 * @returns The diagnostics, in the order of the modules within each rule, then the flows.
 */
function structureDiagnostics(model: ModelStructure): VaultDiagnostic[] {
	const parents = new Map(
		model.modules.flatMap(({ id, parent }) =>
			parent === undefined ? [] : [[id, parent] as const],
		),
	);
	return [
		...passThroughContainers(model, parents),
		...unconnectedRoots(model, parents),
		...linesToOwnParts(model, parents),
		...linesOnContainers(model, parents),
		...unexplainedFlows(model),
	];
}

export { structureDiagnostics };
