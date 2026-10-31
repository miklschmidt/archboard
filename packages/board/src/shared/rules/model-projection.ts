import type { z } from "zod";
import type { ArchitectureRenderRequestSchema } from "#shared/schemas/model-operations.ts";
import type { ArchitectureModelRead } from "#shared/schemas/model.ts";
import { drawingOf } from "#shared/rules/compare/drawing.ts";
import type { ChangeKind } from "#shared/rules/compare/variants.ts";
import type { VariantContent } from "#shared/schemas/content.ts";
import type { DrawnEdge, OverviewLine } from "#shared/rules/scope.ts";
import { codePathOf } from "#shared/rules/code-path.ts";
import { containment, foldChain } from "#shared/rules/module-fold.ts";
import { busLines, drawnEnds, joinedLines, readingLines } from "#shared/rules/model-lines.ts";
import { inspectContainer } from "#shared/rules/inspect/container-interface.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;
type ModelFlow = Model["collections"][number]["flows"][number];
type ModelFilters = Pick<
	z.infer<typeof ArchitectureRenderRequestSchema>,
	"hideKinds" | "showGroups" | "everyLine"
>;
type Visibility = Model["walkthroughs"][number]["beats"][number]["reading"]["visibility"];
type Standing = Readonly<Record<string, ChangeKind>>;
type Node = VariantContent["nodes"][number];
type Edge = VariantContent["edges"][number];

/** A card as a picture draws it: the code path is read for the picture and stored nowhere. */
type DrawnNode = Node & {
	readonly codePath?: string;
	readonly door?: DoorWay;
	/** A door's groups, which colour it whether or not the reading shows group regions. */
	readonly doorGroups?: readonly string[];
};
/** Where a door lies in the tree from the open module. */
type DoorWay = "up" | "across" | "down";
/** What a reading hands the renderer. */
type DrawnContent = Omit<VariantContent, "nodes" | "edges"> & {
	nodes: DrawnNode[];
	edges: DrawnEdge[];
};

/** What decides which lines a reading draws. */
type LineChoices = Pick<ModelFilters, "hideKinds" | "everyLine">;

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
		flows: model.collections.flatMap((collection) => collection.flows),
		walkthroughs: [],
	};
}

/**
 * Draw one recursive scope: the open module, its parts, and doors to the modules it touches.
 * @param complete The complete depicted content.
 * @param scope The module to open, or null for repository roots.
 * @param standing The comparison status of each depicted relationship.
 * @param choices Hidden relationship kinds, and whether every line stays drawn.
 * @returns The projected content and every relationship behind each line.
 */
function projectScope(
	complete: VariantContent,
	scope: string | null,
	standing: Standing,
	choices: LineChoices,
) {
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
	const shown = relevant.filter((edge) => !choices.hideKinds?.includes(edge.kind));
	const endsOf = (edge: Edge) => drawnEnds(edge, drawnAs);
	const listed = joinedLines(complete, shown, endsOf, open, standing);
	const children = complete.nodes.filter((node) => (node.parent ?? null) === scope);
	const visible = new Set([
		...children.map((node) => node.id),
		...listed.flatMap(({ line }) => [line.from, line.to]),
	]);
	const scoped = byId.get(scope ?? "");
	if (scoped !== undefined) visible.add(scoped.id);
	const context = complete.nodes.filter((node) => visible.has(node.id) && !inside.has(node.id));
	const lines = readingLines(listed, children, standing, choices.everyLine);
	return {
		focused: null as ReadonlySet<string> | null,
		missingFocus: [] as string[],
		complete,
		...lines,
		allConnections: joinedLines(complete, relevant, endsOf, open, standing),
		children,
		context,
		trail: trail.flatMap((id) => {
			const node = byId.get(id);
			return node === undefined ? [] : [node];
		}),
		missing: scope !== null && scoped === undefined,
		inspection: interfaceOf(complete, scoped),
		content: drawingContent(complete, visible, lines.connections, {
			parents: open,
			doors: context,
		}),
	};
}

/**
 * Read a scope or an explicit focused selection without copying architecture.
 * @param model The coherent model.
 * @param scope The scope to restore when focus is cleared.
 * @param focus Explicit focused identities, or no focus.
 * @param filters Hidden relationship kinds and group regions.
 * @param reference The coherent comparison base, when available.
 * @param visibility Exact imported view membership, when the reading supplies it.
 * @returns Visible parts, complete interface facts, and exact underlying connections.
 */
function projectModel(
	model: Model,
	scope: string | null = null,
	focus: readonly string[] | null = null,
	filters: ModelFilters = {},
	reference?: Model,
	visibility?: Visibility,
) {
	const context = comparisonContent(model, reference);
	const standing = context.standing ?? {};
	const opened = openedScope(context.depicted, scope, focus, visibility);
	/**
	 * Both sides of a comparison read the same opened scope.
	 * @param content The side to project.
	 * @param choices What decides its lines.
	 * @returns That side's reading.
	 */
	const read = (content: VariantContent, choices: LineChoices) =>
		projectContent(content, opened, focus, standing, choices, visibility);
	const projection = read(context.depicted, filters);
	return {
		...projection,
		...context,
		opened,
		unsettled: unsettledSubjects(model, projection.connections),
		reference,
		held: heldContent(reference, () => read(context.complete, { ...filters, everyLine: true }), {
			depicted: projection.content,
			filters,
		}),
		inspection: interfaceOf(
			context.complete,
			context.complete.nodes.find((node) => node.id === opened),
		),
		flow: null as ModelFlow | null,
		content: withShownGroups(projection.content, filters),
	};
}

/**
 * Only a plain scope folds: a focus and an exact view keep the scope that they name.
 * @param complete The complete depicted content.
 * @param scope The requested module, or null for repository roots.
 * @param focus Explicit focused identities, or no focus.
 * @param visibility Exact imported view membership, when present.
 * @returns The module that the reading opens.
 */
function openedScope(
	complete: VariantContent,
	scope: string | null,
	focus: readonly string[] | null,
	visibility: Visibility,
): string | null {
	return focus === null && visibility === undefined ? foldedScope(complete, scope) : scope;
}

/**
 * The picture of the selected state alone, with the lines of the depicted picture.
 * @param reference The comparison base, when one is drawn.
 * @param read Projects the selected state with every line.
 * @param shown What the depicted picture shows.
 * @param shown.depicted The depicted picture.
 * @param shown.filters The reader's filters.
 * @returns The selected state's picture, or nothing without a comparison.
 */
function heldContent(
	reference: Model | undefined,
	read: () => { content: DrawnContent },
	shown: { depicted: DrawnContent; filters: ModelFilters },
): DrawnContent | undefined {
	if (reference === undefined) return undefined;
	return withShownGroups(withLinesOf(read().content, shown.depicted), shown.filters);
}

/**
 * Carry each unresolved authored identity to every connection that represents it.
 * @param model The complete selected state and its standing issues.
 * @param connections Lines with their underlying relationship identities.
 * @returns Distinct issue identities and represented connection identities.
 */
function unsettledSubjects(model: Model, connections: readonly OverviewLine[]): string[] {
	const unresolved = new Set(model.selectedState?.standing?.issues.map((issue) => issue.subject));
	return [
		...new Set([
			...unresolved,
			...connections
				.filter(({ joins }) => joins.some((edge) => unresolved.has(edge.id)))
				.map(({ line }) => line.id),
		]),
	];
}

/**
 * Keep authored interface meaning separate from the temporary comparison depiction.
 * @param model The selected coherent state.
 * @param reference Its verified comparison base, when available.
 * @returns The selected content, depicted content, and authoritative subject standing.
 */
function comparisonContent(model: Model, reference: Model | undefined) {
	const complete = modelContent(model);
	if (reference === undefined) return { complete, depicted: complete, standing: undefined };
	const compared = drawingOf(complete, modelContent(reference));
	const standing: Standing =
		model.comparison === undefined
			? compared.standing
			: Object.fromEntries(model.comparison.subjects.map((subject) => [subject.id, subject.kind]));
	return { complete, depicted: compared.content, standing };
}

/**
 * Scope and focus share the same complete-content projection for selected and depicted states.
 * @param complete The content to project.
 * @param scope The recursive scope.
 * @param focus Explicit focused identities, or no focus.
 * @param standing Exact subject comparison states.
 * @param choices Hidden relationship kinds, and whether every line stays drawn.
 * @param visibility Exact imported view membership, when present.
 * @returns The requested structural reading.
 */
function projectContent(
	complete: VariantContent,
	scope: string | null,
	focus: readonly string[] | null,
	standing: Standing,
	choices: LineChoices,
	visibility?: Visibility,
) {
	if (visibility !== undefined)
		return projectVisible(complete, scope, standing, choices, visibility);
	return focus === null
		? projectScope(complete, scope, standing, choices)
		: projectFocused(complete, scope, focus, standing, choices);
}

/**
 * Preserve exact imported membership without expanding adjacent relationships.
 * @param complete The complete architecture used for inspection.
 * @param scope The underlying recursive location.
 * @param standing The existing comparison classification.
 * @param choices Hidden relationship kinds, and whether every line stays drawn.
 * @param visibility Explicit modules and relationships in the original view.
 * @returns The same projection contract with only the requested picture narrowed.
 */
function projectVisible(
	complete: VariantContent,
	scope: string | null,
	standing: Standing,
	choices: LineChoices,
	visibility: NonNullable<Visibility>,
): ReturnType<typeof projectScope> {
	const visible = new Set(visibility.modules);
	const relationships = new Set(visibility.relationships);
	const allConnections = complete.edges
		.filter((edge) => relationships.has(edge.id) && visible.has(edge.from) && visible.has(edge.to))
		.map((edge) => ({ line: edge, joins: [edge] as const }));
	const connections = allConnections.filter(({ line }) => !choices.hideKinds?.includes(line.kind));
	return {
		...projectScope(complete, scope, standing, choices),
		children: complete.nodes.filter((node) => visible.has(node.id)),
		context: [],
		connections,
		listed: connections,
		implied: [],
		allConnections,
		content: drawingContent(complete, visible, connections, { parents: visible, doors: [] }),
	};
}

/**
 * Group regions are off until a reader turns one on (rule 7).
 * @param content The projected picture.
 * @param filters The group regions the reader asked for.
 * @returns The depiction with only those regions, without altering either source state.
 */
function withShownGroups(content: DrawnContent, filters: ModelFilters): DrawnContent {
	return {
		...content,
		nodes: content.nodes.map((node) => ({
			...node,
			groups: node.groups?.filter((group) => filters.showGroups?.includes(group)),
		})),
	};
}

/**
 * The selected state's picture leaves out the lines that the depicted picture leaves out.
 * @param content The selected state's picture, with every line.
 * @param depicted The depicted picture.
 * @returns The selected state's picture with the same lines.
 */
function withLinesOf(content: DrawnContent, depicted: DrawnContent): DrawnContent {
	const drawn = new Set(depicted.edges.map((edge) => edge.id));
	return { ...content, edges: content.edges.filter((edge) => drawn.has(edge.id)) };
}

/**
 * Draw exactly the focused subjects and their mutual lines, with the rest as doors (rule 11).
 * Closed selected modules represent their hidden parts.
 * @param complete The complete depicted content.
 * @param scope The underlying recursive scope.
 * @param focus The captured subject identities, including missing identities.
 * @param standing The comparison status of depicted subjects.
 * @param choices Hidden relationship kinds, and whether every line stays drawn.
 * @returns The focused reading and required endpoint context.
 */
function projectFocused(
	complete: VariantContent,
	scope: string | null,
	focus: readonly string[],
	standing: Standing,
	choices: LineChoices,
): ReturnType<typeof projectScope> {
	const byId = new Map(complete.nodes.map((node) => [node.id, node]));
	const focused = new Set(focus);
	const selected = new Set(
		complete.nodes.filter((node) => focused.has(node.id)).map((node) => node.id),
	);
	const edges = complete.edges.filter((edge) => focused.has(edge.id));
	const anchors = new Set([...selected, ...edges.flatMap((edge) => [edge.from, edge.to])]);
	const open = new Set([...anchors].flatMap((id) => ancestors(byId, id).slice(1)));
	const inside = new Set(
		complete.nodes
			.filter((node) => ancestors(byId, node.id).some((id) => selected.has(id)))
			.map((node) => node.id),
	);
	const drawnAs = new Map(
		complete.nodes.map((node) => [
			node.id,
			focusEndpoint(byId, node.id, { anchors, open, inside }),
		]),
	);
	const relevant = complete.edges.filter(
		(edge) => focused.has(edge.id) || inside.has(edge.from) || inside.has(edge.to),
	);
	const selfConnections = edges.filter((edge) => edge.from === edge.to).map((edge) => edge.from);
	const openSelf = new Set([...open, ...selfConnections]);
	/**
	 * A focus has no frame, so a line runs between the cards that it joins.
	 * @param edge The relationship.
	 * @returns Both drawn ends.
	 */
	const ends = (edge: Edge) => drawnEnds(edge, drawnAs);
	const shown = relevant.filter((edge) => !choices.hideKinds?.includes(edge.kind));
	const listed = joinedLines(complete, shown, ends, openSelf, standing);
	const children = complete.nodes.filter((node) => anchors.has(node.id));
	const visible = new Set([...anchors, ...listed.flatMap(({ line }) => [line.from, line.to])]);
	const known = new Set([...complete.nodes, ...complete.edges].map((subject) => subject.id));
	const context = complete.nodes.filter((node) => visible.has(node.id) && !anchors.has(node.id));
	const lines = readingLines(listed, children, standing, choices.everyLine);
	return {
		focused,
		missingFocus: focus.filter((id) => !known.has(id)),
		complete,
		...lines,
		allConnections: joinedLines(complete, relevant, ends, openSelf, standing),
		children,
		context,
		trail:
			scope === null
				? []
				: ancestors(byId, scope)
						.toReversed()
						.flatMap((id) => byId.get(id) ?? []),
		missing: false,
		inspection: interfaceOf(complete, byId.get(scope ?? "")),
		content: drawingContent(complete, visible, lines.connections, {
			parents: anchors,
			doors: context,
		}),
	};
}

/**
 * Hidden selected internals collapse to their nearest focused subject.
 * @param nodes The full containment index.
 * @param id The authored endpoint.
 * @param focus The focused subjects, their ancestors and their interiors.
 * @param focus.anchors The focused subjects and the ends of focused relationships.
 * @param focus.open The ancestors of those subjects.
 * @param focus.inside Subjects inside selected modules.
 * @returns The existing module that represents this endpoint.
 */
function focusEndpoint(
	nodes: ReadonlyMap<string, Node>,
	id: string,
	focus: {
		anchors: ReadonlySet<string>;
		open: ReadonlySet<string>;
		inside: ReadonlySet<string>;
	},
): string {
	if (focus.anchors.has(id)) return id;
	if (focus.inside.has(id))
		return ancestors(nodes, id).find((ancestor) => focus.anchors.has(ancestor)) ?? id;
	return visibleEndpoint(nodes, id, focus.open);
}

/**
 * A chain of modules with one part each folds, as a code host folds single-child folders
 * (rule 10), so a dead stop costs no click.
 * @param complete The complete depicted content.
 * @param scope The requested module, or null for repository roots.
 * @returns The module that the reading opens.
 */
function foldedScope(complete: VariantContent, scope: string | null): string | null {
	if (scope === null) return null;
	return foldChain(containment(complete), scope).at(-1) ?? scope;
}

/**
 * Keep only drawing fields and containment that this reading explicitly opens.
 * A door is a card with a name only (rule 5).
 * @param complete The full model content.
 * @param visible Modules present in this reading.
 * @param connections Its projected lines.
 * @param framing What the picture nests, and which of its cards are doors.
 * @param framing.parents Containers whose visible children remain nested.
 * @param framing.doors Cards that stand for what the reading touches.
 * @returns Renderer content without private evidence or file metadata.
 */
function drawingContent(
	complete: VariantContent,
	visible: ReadonlySet<string>,
	connections: readonly OverviewLine[],
	framing: { parents: ReadonlySet<string>; doors: readonly Node[] },
): DrawnContent {
	const doors = new Set(framing.doors.map((node) => node.id));
	const byId = new Map(complete.nodes.map((node) => [node.id, node]));
	const [open] = framing.parents;
	const childrenOf = containment(complete);
	const onTrunk = busLines(connections, doors);
	return {
		nodes: complete.nodes
			.filter((node) => visible.has(node.id))
			.map((node) => {
				const { description: _description, binding: _binding, ...drawn } = node;
				const card = doors.has(node.id)
					? nameOnly(drawn, doorWay(byId, node.id, open))
					: withCodePath(drawn, node, childrenOf);
				if (node.parent !== undefined && framing.parents.has(node.parent)) return card;
				const { parent: _parent, ...unframed } = card;
				return unframed;
			}),
		edges: connections.map((connection) => {
			const { anchor: _anchor, description: _description, ...line } = connection.line;
			if (!onTrunk.has(connection)) return line;
			const { label: _label, ...quiet } = line;
			return quiet;
		}),
		flows: [],
		walkthroughs: [],
	};
}

/**
 * A door says only what it is called, and which way it lies.
 * @param card The drawn module.
 * @param door Which way it lies from the open module.
 * @returns The card without its responsibility.
 */
function nameOnly(card: DrawnNode, door: DoorWay): DrawnNode {
	const { responsibility: _responsibility, ...named } = card;
	return card.groups === undefined ? { ...named, door } : { ...named, door, doorGroups: card.groups };
}

/**
 * Where a door lies in the tree from the open module.
 * @param byId Every module by its identity.
 * @param door The door's module.
 * @param open The open module, if the reading has one.
 * @returns Whether it lies higher, level or deeper.
 */
function doorWay(byId: ReadonlyMap<string, Node>, door: string, open: string | undefined): DoorWay {
	const depth = (id: string) => ancestors(byId, id).length;
	const levels = open === undefined ? 0 : depth(door) - depth(open);
	if (levels === 0) return "across";
	return levels < 0 ? "up" : "down";
}

/**
 * A part shows where its code lives (rule 8).
 * @param card The drawn module.
 * @param node The authored module.
 * @param childrenOf The containment index.
 * @returns The card with its path row, when it has one.
 */
function withCodePath(
	card: DrawnNode,
	node: Node,
	childrenOf: ReadonlyMap<string, readonly Node[]>,
): DrawnNode {
	const codePath = codePathOf(node, childrenOf);
	return codePath === undefined ? card : { ...card, codePath };
}

/**
 * Read the open module's interface from the complete state before projection.
 * @param complete The full architectural state.
 * @param scoped The selected module, when it exists.
 * @returns Complete interface facts, independently of visible context.
 */
function interfaceOf(complete: VariantContent, scoped: Node | undefined) {
	return scoped === undefined ? undefined : inspectContainer(complete, scoped);
}

/**
 * Follow canonical containment toward the repository boundary.
 * @param nodes The complete validated node index.
 * @param id The subject whose ancestors are needed.
 * @returns The subject followed by its ancestors.
 */
function ancestors(nodes: ReadonlyMap<string, Node>, id: string): string[] {
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
	nodes: ReadonlyMap<string, Node>,
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

export {
	projectModel,
	modelContent,
	type DrawnNode,
	type Model,
	type ModelFilters,
	type ModelFlow,
};
