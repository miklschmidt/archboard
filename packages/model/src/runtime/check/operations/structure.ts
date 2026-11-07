// What the semantics check says about one state of a canonical model. Six rules
// read its shape: a container that gathers nothing, a root that nothing connects,
// a relationship between a module and a part that it holds, a container that
// does not own one place in the code that holds its parts, two modules bound to the
// same code, and two relationships with the same ends and anchor. A shape is a signal and
// never proves that a module has no job, so these are warnings and no write reads
// them. No rule reads a name, a count or a file on disk. Two rules are errors. A
// current flow with no summary breaks what every write of a flow now keeps. A
// relationship that ends on a module with parts says that the frame acts, and a
// module cannot point at anything, so it hides the part that does (ADR 0044). A
// reader can still read both.

import type { ArchitectureModel } from "#shared/canonical-contracts/schemas/model.ts";
import { containersOf } from "#shared/rules/scope.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { containmentDiagnostics } from "#runtime/check/operations/containment.ts";
import { duplicateDiagnostics } from "#runtime/check/operations/duplicates.ts";
import { edgeSubjects, nodeSubject } from "#runtime/check/operations/subject.ts";

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
 * The modules with parts that a relationship ends on.
 * @param relationship The relationship.
 * @param modules The modules of the state.
 * @param containers The modules with parts.
 * @returns Their names, one or two.
 */
function framedEnds(
	relationship: ModelStructure["relationships"][number],
	modules: ModelStructure["modules"],
	containers: ReadonlySet<string>,
): string {
	const ends = new Set([relationship.from, relationship.to]);
	return modules
		.filter(({ id }) => ends.has(id) && containers.has(id))
		.map(({ name }) => name)
		.join(" and ");
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
	const owned = model.relationships.filter(
		({ from, to }) =>
			containersOf(parents, to).includes(from) || containersOf(parents, from).includes(to),
	);
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
 * Name each relationship with an end on a module with parts, unless one end holds the other, which
 * `linesToOwnParts` names. The code decides which part owns the end, so no write refuses it.
 * @param model The modules and relationships of one state.
 * @param parents Each contained module's parent.
 * @returns One error for each such relationship, on the file of the module that owns it.
 */
function endsOnContainers(
	model: ModelStructure,
	parents: ReadonlyMap<string, string>,
): VaultDiagnostic[] {
	const containers = new Set(parents.values());
	const framed = model.relationships.filter(
		({ from, to }) =>
			(containers.has(from) || containers.has(to)) &&
			!containersOf(parents, to).includes(from) &&
			!containersOf(parents, from).includes(to),
	);
	const subject = edgeSubjects({ nodes: model.modules });
	return model.modules.flatMap((module) =>
		framed
			.filter(({ from }) => from === module.id)
			.map((relationship) => ({
				severity: "error" as const,
				code: "RELATIONSHIP_ON_CONTAINER",
				file: module.file,
				subject: subject(relationship),
				message: `It ends on ${framedEnds(relationship, model.modules, containers)}, and a module with parts cannot act for them. Read the code that its anchor names, then end it on the part that owns that code: an edit-relationship change with source or set.to. If no part owns the code, add one for what the module does at this seam.`,
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
		...containmentDiagnostics(model, parents),
		...duplicateDiagnostics(model),
		...unconnectedRoots(model, parents),
		...linesToOwnParts(model, parents),
		...endsOnContainers(model, parents),
		...unexplainedFlows(model),
	];
}

export { structureDiagnostics };
