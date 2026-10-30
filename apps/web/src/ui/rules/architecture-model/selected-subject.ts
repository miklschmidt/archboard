import type { Model, projectModel } from "@archboard/board/content";

type Projection = ReturnType<typeof projectModel>;
type Connection = Projection["connections"][number];
type Relationship = Connection["joins"][number];

/** What a reading holds a selection against. */
interface SelectionReading {
	readonly model: Model;
	readonly projection: Projection;
	readonly ids: ReadonlySet<string>;
}

/** What a selection names, which decides how the panel and About explain it. */
type SelectedSubject =
	| { readonly kind: "module"; readonly module: Model["modules"][number] }
	| {
			readonly kind: "collection";
			readonly model: Model;
			readonly collection: Model["collections"][number];
	  }
	| { readonly kind: "flow"; readonly flow: NonNullable<Projection["flow"]> }
	| { readonly kind: "connection"; readonly connection: Connection }
	| { readonly kind: "subjects" }
	| { readonly kind: "none" };

/**
 * An explicit relationship can select one member of a projected aggregate.
 * @param reading The authored selection and projected connections.
 * @returns Only the selected relationships when one connection contains them all.
 */
function inspectedConnection(reading: SelectionReading): Connection | undefined {
	const { ids, projection } = reading;
	if (ids.size === 0) return undefined;
	const connection = projection.allConnections.find(({ joins }) =>
		[...ids].every((id) => joins.some((edge) => edge.id === id)),
	);
	if (connection === undefined) return undefined;
	const [first, ...rest] = connection.joins.filter((edge) => ids.has(edge.id));
	return first === undefined ? undefined : { ...connection, joins: [first, ...rest] as const };
}

/**
 * Only a single authored identity opens its dedicated inspector.
 * @param selected The temporary selected identities.
 * @returns The one subject, or absence for empty and mixed selections.
 */
function selectedIdentity(selected: ReadonlySet<string>): string | undefined {
	return selected.size === 1 ? [...selected][0] : undefined;
}

/**
 * Collections use qualified subject identities while retaining their local authored identity.
 * @param reading The selected reading and coherent comparison reference.
 * @param id The exact inspected identity.
 * @returns The collection and the state that owns its definition.
 */
function inspectedCollection(reading: SelectionReading, id: string | undefined) {
	if (reading.projection.flow !== null) return undefined;
	for (const model of [reading.model, reading.projection.reference]) {
		if (model === undefined) continue;
		const collection = model.collections.find((entry) => `${model.manifest.id}#${entry.id}` === id);
		if (collection !== undefined) return { model, collection };
	}
	return undefined;
}

/**
 * A comparison can inspect a removed definition only from its verified reference.
 * @param reading The selected state and optional coherent reference.
 * @param id The inspected identity.
 * @returns Its selected definition, otherwise the explicit reference definition.
 */
function inspectedModule(reading: SelectionReading, id: string | undefined) {
	return (
		reading.model.modules.find((entry) => entry.id === id) ??
		reading.projection.reference?.modules.find((entry) => entry.id === id)
	);
}

/**
 * What a selection names, whatever the picture draws of it.
 * @param reading The selection and its reading.
 * @returns One module, a collection, a flow, a connection, several subjects, or nothing.
 */
function selectedSubject(reading: SelectionReading): SelectedSubject {
	const only = selectedIdentity(reading.ids);
	const module = inspectedModule(reading, only);
	if (module !== undefined) return { kind: "module", module };
	const collection = inspectedCollection(reading, only);
	if (collection !== undefined) return { kind: "collection", ...collection };
	if (reading.projection.flow !== null) return { kind: "flow", flow: reading.projection.flow };
	const connection = inspectedConnection(reading);
	if (connection !== undefined) return { kind: "connection", connection };
	return reading.ids.size > 0 ? { kind: "subjects" } : { kind: "none" };
}

/**
 * Whether a selection names the module that stands behind it, or a module that a comparison removed.
 * @param projection The reading.
 * @param id The module.
 * @returns True for a module that only the comparison base holds.
 */
function isRemoved(projection: Projection, id: string): boolean {
	return projection.standing?.[id] === "removed";
}

/**
 * The lines of a reading that touch a module, in each direction, each line once and the ones
 * that join the most relationships first.
 * @param projection The reading.
 * @param id The module.
 * @returns What it sends to and what it receives from.
 */
function linesOf(projection: Projection, id: string) {
	const lines = projection.allConnections.toSorted((a, b) => b.joins.length - a.joins.length);
	return {
		sends: lines.filter(({ line }) => line.from === id),
		receives: lines.filter(({ line }) => line.to === id && line.from !== id),
	};
}

/**
 * One list of relationships from a module's own and those its lines join.
 * @param own The module's own relationships.
 * @param lines Its lines in the reading.
 * @returns Each relationship once.
 */
function mergedRelationships(own: readonly Relationship[], lines: readonly Connection[]) {
	const joined = lines.flatMap(({ joins }) => joins);
	return [...new Map([...own, ...joined].map((edge) => [edge.id, edge])).values()];
}

/**
 * Every relationship of a module in each direction: its own, then those that its lines in this
 * reading join, which for a container are the relationships of its parts.
 * @param model The reading's model.
 * @param projection The reading.
 * @param id The module.
 * @returns What it sends and what it receives, each relationship once.
 */
function relationshipsOf(model: Model, projection: Projection, id: string) {
	const { sends, receives } = linesOf(projection, id);
	const edges = model.relationships;
	return {
		outgoing: mergedRelationships(
			edges.filter((edge) => edge.from === id),
			sends,
		),
		incoming: mergedRelationships(
			edges.filter((edge) => edge.to === id),
			receives,
		),
	};
}

/**
 * The model that defines a module: the comparison base for one that the comparison removed.
 * @param model The reading's model.
 * @param projection The reading.
 * @param id The module.
 * @returns The model to read it from.
 */
function moduleSource(model: Model, projection: Projection, id: string): Model {
	return isRemoved(projection, id) ? (projection.reference ?? model) : model;
}

export {
	isRemoved,
	linesOf,
	moduleSource,
	relationshipsOf,
	selectedSubject,
	type Connection,
	type SelectedSubject,
};
