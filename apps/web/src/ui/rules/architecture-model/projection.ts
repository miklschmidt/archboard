import type { ModelAddress } from "#ui/rules/board-routing/address.ts";
import type { ArchitectureModelRead } from "@archboard/board/model";
import type { VariantContent } from "@archboard/board/content";
import { overviewLines } from "@archboard/board/views";
import { inspectContainer } from "@archboard/board/container-interface";

type Model = Extract<ArchitectureModelRead, { success: true }>;
type ModelFilters = Pick<ModelAddress, "hideKinds" | "hideGroups">;

/**
 * Adapt canonical meaning to the existing renderer content contract.
 * @param model The coherent read from the public runtime.
 * @returns Complete semantic content without a board or variant document.
 */
function modelContent(model: Model): VariantContent {
	return {
		nodes: model.modules.map(
			({
				file: _file,
				schemaVersion: _schema,
				formerNames: _former,
				documents: _documents,
				outgoing: _outgoing,
				...node
			}) => node,
		),
		edges: model.relationships,
		flows: [],
		walkthroughs: [],
	};
}

/**
 * Draw one recursive scope with direct context and closed implementation parts.
 * @param model The complete model.
 * @param scope The module to open, or null for repository roots.
 * @returns The projected content and every relationship behind each line.
 */
function projectScope(model: Model, scope: string | null) {
	const complete = modelContent(model);
	const byId = new Map(complete.nodes.map((node) => [node.id, node]));
	const trail = scope === null ? [] : ancestors(byId, scope).toReversed();
	const boundary = new Set(trail);
	const inside = new Set(
		complete.nodes
			.filter((node) => scope === null || ancestors(byId, node.id).includes(scope))
			.map((node) => node.id),
	);
	const drawnAs = new Map(
		complete.nodes.map((node) => [node.id, visibleEndpoint(byId, node.id, boundary)]),
	);
	const relevant = complete.edges.filter((edge) => inside.has(edge.from) || inside.has(edge.to));
	const open = new Set(scope === null ? [] : [scope]);
	const connections = projectedConnections(complete, relevant, drawnAs, open);
	const children = complete.nodes.filter((node) => (node.parent ?? null) === scope);
	const visible = new Set([
		...children.map((node) => node.id),
		...connections.flatMap(({ line }) => [line.from, line.to]),
	]);
	const scoped = byId.get(scope ?? "");
	if (scoped !== undefined) visible.add(scoped.id);
	const context = complete.nodes.filter((node) => visible.has(node.id) && !inside.has(node.id));
	return {
		focused: null as ReadonlySet<string> | null,
		missingFocus: [] as string[],
		complete,
		connections,
		children,
		context,
		trail: trail.flatMap((id) => {
			const node = byId.get(id);
			return node === undefined ? [] : [node];
		}),
		missing: scope !== null && scoped === undefined,
		inspection: interfaceOf(complete, scoped),
		content: drawingContent(complete, visible, connections, open),
	};
}

/**
 * Read a scope or an explicit focused selection without copying architecture.
 * @param model The coherent model.
 * @param scope The scope to restore when focus is cleared.
 * @param focus Explicit focused identities, or no focus.
 * @param filters Hidden relationship kinds and group regions.
 * @returns Visible parts, complete interface facts, and exact underlying connections.
 */
function projectModel(
	model: Model,
	scope: string | null = null,
	focus: readonly string[] | null = null,
	filters: ModelFilters = {},
) {
	const projection =
		focus === null ? projectScope(model, scope) : projectFocused(model, scope, focus);
	const connections = projection.connections.filter(
		({ line }) => !filters.hideKinds?.includes(line.kind),
	);
	return {
		...projection,
		allConnections: projection.connections,
		connections,
		content: {
			...projection.content,
			nodes: projection.content.nodes.map((node) => ({
				...node,
				groups: node.groups?.filter((group) => !filters.hideGroups?.includes(group)),
			})),
			edges: projection.content.edges.filter((edge) => !filters.hideKinds?.includes(edge.kind)),
		},
	};
}

/**
 * Expand only selected paths while closed selected modules represent their hidden parts.
 * @param model The complete model.
 * @param scope The underlying recursive scope.
 * @param focus The captured subject identities, including missing identities.
 * @returns The focused reading and required endpoint context.
 */
function projectFocused(
	model: Model,
	scope: string | null,
	focus: readonly string[],
): ReturnType<typeof projectScope> {
	const complete = modelContent(model);
	const byId = new Map(complete.nodes.map((node) => [node.id, node]));
	const focused = new Set(focus);
	const selected = new Set(
		complete.nodes.filter((node) => focused.has(node.id)).map((node) => node.id),
	);
	const edges = complete.edges.filter((edge) => focused.has(edge.id));
	const anchors = new Set([...selected, ...edges.flatMap((edge) => [edge.from, edge.to])]);
	const paths = [...anchors].map((id) => ancestors(byId, id));
	const base = new Set(paths.flat());
	const open = new Set(paths.flatMap((path) => path.slice(1)));
	const inside = new Set(
		complete.nodes
			.filter((node) => ancestors(byId, node.id).some((id) => selected.has(id)))
			.map((node) => node.id),
	);
	const drawnAs = new Map(
		complete.nodes.map((node) => [node.id, focusEndpoint(byId, node.id, { base, open, inside })]),
	);
	const relevant = complete.edges.filter(
		(edge) => focused.has(edge.id) || inside.has(edge.from) || inside.has(edge.to),
	);
	const selfConnections = edges.filter((edge) => edge.from === edge.to).map((edge) => edge.from);
	const connections = projectedConnections(
		complete,
		relevant,
		drawnAs,
		new Set([...open, ...selfConnections]),
	);
	const visible = new Set([...base, ...connections.flatMap(({ line }) => [line.from, line.to])]);
	const known = new Set([...complete.nodes, ...complete.edges].map((subject) => subject.id));
	return {
		focused,
		missingFocus: focus.filter((id) => !known.has(id)),
		complete,
		connections,
		children: complete.nodes.filter((node) => base.has(node.id)),
		context: complete.nodes.filter((node) => visible.has(node.id) && !base.has(node.id)),
		trail:
			scope === null
				? []
				: ancestors(byId, scope)
						.toReversed()
						.flatMap((id) => byId.get(id) ?? []),
		missing: false,
		inspection: interfaceOf(complete, byId.get(scope ?? "")),
		content: drawingContent(complete, visible, connections, visible),
	};
}

/**
 * Hidden selected internals collapse to their nearest retained ancestor.
 * @param nodes The full containment index.
 * @param id The authored endpoint.
 * @param focus The retained paths and selected module interiors.
 * @param focus.base Modules on required paths.
 * @param focus.open Ancestors opened by those paths.
 * @param focus.inside Subjects inside selected modules.
 * @returns The existing module that represents this endpoint.
 */
function focusEndpoint(
	nodes: ReadonlyMap<string, VariantContent["nodes"][number]>,
	id: string,
	focus: { base: ReadonlySet<string>; open: ReadonlySet<string>; inside: ReadonlySet<string> },
): string {
	if (focus.base.has(id)) return id;
	if (focus.inside.has(id))
		return ancestors(nodes, id).find((ancestor) => focus.base.has(ancestor)) ?? id;
	return visibleEndpoint(nodes, id, focus.open);
}

/**
 * Aggregate projected connections by direction and kind through the shared semantic rule.
 * @param complete The full model content.
 * @param relevant Relationships included by this reading.
 * @param drawnAs The visible representative of each endpoint.
 * @param open Containers whose authored self-connections remain visible.
 * @returns Every drawn line with all original relationships.
 */
function projectedConnections(
	complete: VariantContent,
	relevant: VariantContent["edges"],
	drawnAs: ReadonlyMap<string, string>,
	open: ReadonlySet<string>,
) {
	const flat = complete.nodes.map((node) => {
		const { parent: _parent, ...part } = node;
		const at = drawnAs.get(node.id);
		return at === node.id ? part : { ...part, parent: at };
	});
	return [...new Set(relevant.map((edge) => edge.kind))]
		.flatMap((kind) =>
			overviewLines(
				{ ...complete, nodes: flat, edges: relevant.filter((edge) => edge.kind === kind) },
				open,
			),
		)
		.toSorted((one, other) => one.line.order - other.line.order);
}

/**
 * Keep only drawing fields and containment that this reading explicitly opens.
 * @param complete The full model content.
 * @param visible Modules present in this reading.
 * @param connections Its projected lines.
 * @param parents Containers whose visible children remain nested.
 * @returns Renderer content without private evidence or file metadata.
 */
function drawingContent(
	complete: VariantContent,
	visible: ReadonlySet<string>,
	connections: ReturnType<typeof overviewLines>,
	parents: ReadonlySet<string>,
): VariantContent {
	return {
		nodes: complete.nodes
			.filter((node) => visible.has(node.id))
			.map((node) => {
				const { description: _description, binding: _binding, ...drawn } = node;
				if (node.parent !== undefined && parents.has(node.parent)) return drawn;
				const { parent: _parent, ...unframed } = drawn;
				return unframed;
			}),
		edges: connections.map(
			({ line: { anchor: _anchor, description: _description, ...line } }) => line,
		),
		flows: [],
		walkthroughs: [],
	};
}

/**
 * Read the open module's interface from the complete state before projection.
 * @param complete The full architectural state.
 * @param scoped The selected module, when it exists.
 * @returns Complete interface facts, independently of visible context.
 */
function interfaceOf(
	complete: VariantContent,
	scoped: VariantContent["nodes"][number] | undefined,
) {
	return scoped === undefined ? undefined : inspectContainer(complete, scoped);
}

/**
 * Follow canonical containment toward the repository boundary.
 * @param nodes The complete validated node index.
 * @param id The subject whose ancestors are needed.
 * @returns The subject followed by its ancestors.
 */
function ancestors(
	nodes: ReadonlyMap<string, VariantContent["nodes"][number]>,
	id: string,
): string[] {
	const result: string[] = [];
	for (let at: string | undefined = id; at !== undefined; at = nodes.get(at)?.parent)
		result.push(at);
	return result;
}

/**
 * Project a hidden endpoint to its closest relevant visible module.
 * @param nodes The complete containment index.
 * @param id The authored endpoint.
 * @param boundary The open scope and its ancestors.
 * @returns A visible identity from the existing model.
 */
function visibleEndpoint(
	nodes: ReadonlyMap<string, VariantContent["nodes"][number]>,
	id: string,
	boundary: ReadonlySet<string>,
): string {
	let at = id;
	while (!boundary.has(at)) {
		const parent = nodes.get(at)?.parent;
		if (parent === undefined || boundary.has(parent)) break;
		at = parent;
	}
	return at;
}

export { projectModel, type Model, type ModelFilters };
