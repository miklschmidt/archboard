import type { ArchitectureModelRead } from "@archboard/board/model";
import type { VariantContent } from "@archboard/board/content";
import { overviewLines } from "@archboard/board/views";
import { inspectContainer } from "@archboard/board/container-interface";

type Model = Extract<ArchitectureModelRead, { success: true }>;

/**
 * Adapt canonical meaning to the existing renderer content contract.
 * @param model The coherent read from the public runtime.
 * @returns Complete semantic content without a board or variant document.
 */
function modelContent(model: Model): VariantContent {
	return { nodes: model.modules, edges: model.relationships, flows: [], walkthroughs: [] };
}

/**
 * Draw one recursive scope with direct context and closed implementation parts.
 * @param model The complete model.
 * @param scope The module to open, or null for repository roots.
 * @returns The projected content and every relationship behind each line.
 */
function projectModel(model: Model, scope: string | null = null) {
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
	const flat = complete.nodes.map((node) => {
		const { parent: _parent, ...part } = node;
		const at = drawnAs.get(node.id);
		return at === node.id ? part : { ...part, parent: at };
	});
	const kinds = new Set(relevant.map((edge) => edge.kind));
	const connections = [...kinds]
		.flatMap((kind) =>
			overviewLines({
				...complete,
				nodes: flat,
				edges: relevant.filter((edge) => edge.kind === kind),
			}),
		)
		.toSorted((one, other) => one.line.order - other.line.order);
	const children = complete.nodes.filter((node) => (node.parent ?? null) === scope);
	const visible = new Set([
		...children.map((node) => node.id),
		...connections.flatMap(({ line }) => [line.from, line.to]),
	]);
	const scoped = byId.get(scope ?? "");
	if (scoped !== undefined) visible.add(scoped.id);
	const context = complete.nodes.filter((node) => visible.has(node.id) && !inside.has(node.id));
	return {
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
		content: {
			nodes: complete.nodes
				.filter((node) => visible.has(node.id))
				.map((node) => {
					if (scope !== null && node.parent === scope) return node;
					const { parent: _parent, ...unframed } = node;
					return unframed;
				}),
			edges: connections.map(({ line }) => line),
			flows: [],
			walkthroughs: [],
		},
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

export { projectModel, type Model };
