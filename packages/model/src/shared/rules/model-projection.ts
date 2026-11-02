import type { z } from "zod";
import type { ArchitectureRenderRequestSchema } from "#shared/schemas/model-operations.ts";
import type { ArchitectureModelRead } from "#shared/schemas/model.ts";
import { drawingOf } from "#shared/rules/compare/drawing.ts";
import type { ChangeKind } from "#shared/rules/compare/variants.ts";
import type { VariantContent } from "#shared/schemas/content.ts";
import type { DrawnEdge, OverviewLine } from "#shared/rules/scope.ts";
import { codePathOf } from "#shared/rules/code-path.ts";
import {
	expansions,
	toggles,
	withToggle,
	type Toggle,
	type Toggles,
} from "#shared/rules/model-expansion.ts";
import { containment, foldedScope } from "#shared/rules/module-fold.ts";
import { drawnEnds, drawnLines, joinedLines } from "#shared/rules/model-lines.ts";
import { inspectContainer } from "#shared/rules/inspect/container-interface.ts";

type Model = Extract<ArchitectureModelRead, { success: true }>;
type ModelFlow = Model["collections"][number]["flows"][number];
/** What a reader chose of a reading, besides its scope and its focus. */
type ModelFilters = Pick<
	z.infer<typeof ArchitectureRenderRequestSchema>,
	"hideKinds" | "expand"
> & {
	/** Whether a live reader draws its picture, so that its doors and frames wear their controls. */
	readonly controls?: boolean;
};
type Visibility = Model["walkthroughs"][number]["beats"][number]["reading"]["visibility"];
type Standing = Readonly<Record<string, ChangeKind>>;
type Node = VariantContent["nodes"][number];
type Edge = VariantContent["edges"][number];

/** A card as a picture draws it: the code path is read for the picture and stored nowhere. */
type DrawnNode = Node & {
	readonly codePath?: string;
	readonly door?: DoorWay;
	readonly toggle?: Toggle;
};
/** Where a door lies in the tree from the open module. */
type DoorWay = "up" | "across" | "down";
/** What a reading hands the renderer. */
type DrawnContent = Omit<VariantContent, "nodes" | "edges"> & {
	nodes: DrawnNode[];
	edges: DrawnEdge[];
};

/** What decides which lines a reading draws. */
type LineChoices = Pick<ModelFilters, "hideKinds">;
/** What a scope draws besides its own frame, and whether its controls are drawn. */
type ScopeChoices = LineChoices & {
	readonly frames: readonly string[];
	readonly controls: boolean;
};

/**
 * Adapt canonical meaning to the existing renderer content contract.
 * @param model The coherent read from the public runtime.
 * @returns Complete semantic content without a legacy board or variant document.
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
 * Draw one recursive scope: the open module and each module it expands, their parts, and doors to
 * the modules they touch. A reading of one frame is the case with nothing expanded.
 * @param complete The complete depicted content.
 * @param scope The module to open, or null for repository roots.
 * @param standing The comparison status of each depicted relationship.
 * @param choices Hidden relationship kinds, what the scope expands, and whether controls are drawn.
 * @returns The projected content and every relationship behind each line.
 */
function projectScope(
	complete: VariantContent,
	scope: string | null,
	standing: Standing,
	choices: ScopeChoices,
) {
	const byId = new Map(complete.nodes.map((node) => [node.id, node]));
	const trail = scope === null ? [] : ancestors(byId, scope).toReversed();
	const frames = choices.frames.filter((id) => byId.has(id));
	const open = new Set([...(scope === null ? [] : [scope]), ...frames]);
	const boundary = new Set([...open].flatMap((id) => ancestors(byId, id)));
	const inside = new Set(
		complete.nodes
			.filter((node) => scope === null || ancestors(byId, node.id).some((at) => open.has(at)))
			.map((node) => node.id),
	);
	const drawnAs = new Map(
		complete.nodes.map((node) => [node.id, visibleEndpoint(byId, node.id, boundary)]),
	);
	const relevant = complete.edges.filter((edge) => inside.has(edge.from) || inside.has(edge.to));
	const shown = relevant.filter((edge) => !choices.hideKinds?.includes(edge.kind));
	/**
	 * Every line runs between the drawn ends of its relationship.
	 * @param edge The relationship.
	 * @returns Both drawn ends.
	 */
	const endsOf = (edge: Edge) => drawnEnds(edge, drawnAs);
	const joined = joinedLines(complete, shown, endsOf, open, standing);
	const connections = drawnLines(complete, joined, open);
	const children = complete.nodes.filter(
		({ parent }) => (parent ?? null) === scope || (parent !== undefined && open.has(parent)),
	);
	const visible = new Set([
		...children.map((node) => node.id),
		...connections.flatMap(({ line }) => [line.from, line.to]),
		...[...open].filter((id) => byId.has(id)),
	]);
	const scoped = byId.get(scope ?? "");
	const context = complete.nodes.filter((node) => visible.has(node.id) && !inside.has(node.id));
	return {
		focused: null as ReadonlySet<string> | null,
		missingFocus: [] as string[],
		complete,
		connections,
		allConnections: joinedLines(complete, relevant, endsOf, open, standing),
		children,
		context,
		trail: trail.flatMap((id) => {
			const node = byId.get(id);
			return node === undefined ? [] : [node];
		}),
		missing: scope !== null && scoped === undefined,
		inspection: interfaceOf(complete, scoped),
		content: drawingContent(complete, visible, connections, {
			parents: open,
			doors: context,
			toggles: choices.controls ? toggles(complete, open, frames, standing) : undefined,
		}),
	};
}

/**
 * Read a scope or an explicit focused selection without copying architecture.
 * @param model The coherent model.
 * @param scope The scope to restore when focus is cleared.
 * @param focus Explicit focused identities, or no focus.
 * @param filters Hidden relationship kinds.
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
	const { opened, expanded, unopened, controls } = openedBy(
		context.depicted,
		scope,
		focus === null && visibility === undefined,
		filters,
	);
	const frames = expanded.map(({ frame }) => frame);
	const choices = { hideKinds: filters.hideKinds, frames, controls };
	/**
	 * Both sides of a comparison read the same opened scope.
	 * @param content The side to project.
	 * @returns That side's reading.
	 */
	const read = (content: VariantContent) =>
		projectContent(content, opened, focus, standing, choices, visibility);
	const projection = read(context.depicted);
	return {
		...projection,
		...context,
		opened,
		expanded,
		unopened,
		unsettled: unsettledSubjects(model, projection.connections),
		reference,
		held: heldContent(reference, () => read(context.complete), projection.content),
		inspection: interfaceOf(
			context.complete,
			context.complete.nodes.find((node) => node.id === opened),
		),
		flow: null as ModelFlow | null,
		content: projection.content,
	};
}

/**
 * What a reading opens. Only a plain scope folds, expands and wears controls: a focus and an exact
 * view keep the extent that they name.
 * @param complete The complete depicted content.
 * @param scope The requested module, or null for repository roots.
 * @param plain Whether the reading has neither a focus nor an exact view.
 * @param filters What the reader chose.
 * @returns The module it opens, what it expands, and whether its controls are drawn.
 */
function openedBy(
	complete: VariantContent,
	scope: string | null,
	plain: boolean,
	filters: ModelFilters,
) {
	const opened = plain ? foldedScope(complete, scope) : scope;
	const controls = plain && filters.controls === true;
	return { opened, controls, ...expansions(complete, opened, plain, filters.expand) };
}

/**
 * The picture of the selected state alone, with the lines of the depicted picture.
 * @param reference The comparison base, when one is drawn.
 * @param read Projects the selected state with every line.
 * @param depicted What the depicted picture shows.
 * @returns The selected state's picture, or nothing without a comparison.
 */
function heldContent(
	reference: Model | undefined,
	read: () => { content: DrawnContent },
	depicted: DrawnContent,
): DrawnContent | undefined {
	if (reference === undefined) return undefined;
	return withLinesOf(read().content, depicted);
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
 * @param choices Hidden relationship kinds, what the scope expands, and whether controls are drawn.
 * @param visibility Exact imported view membership, when present.
 * @returns The requested structural reading.
 */
function projectContent(
	complete: VariantContent,
	scope: string | null,
	focus: readonly string[] | null,
	standing: Standing,
	choices: ScopeChoices,
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
 * @param choices Hidden relationship kinds, what the scope expands, and whether controls are drawn.
 * @param visibility Explicit modules and relationships in the original view.
 * @returns The same projection contract with only the requested picture narrowed.
 */
function projectVisible(
	complete: VariantContent,
	scope: string | null,
	standing: Standing,
	choices: ScopeChoices,
	visibility: NonNullable<Visibility>,
): ReturnType<typeof projectScope> {
	const visible = new Set(visibility.modules);
	const relationships = new Set(visibility.relationships);
	const allConnections = complete.edges
		.filter((edge) => relationships.has(edge.id) && visible.has(edge.from) && visible.has(edge.to))
		.map((edge) => ({ line: edge, joins: [edge] as const }));
	const connections = drawnLines(
		complete,
		allConnections.filter(({ line }) => !choices.hideKinds?.includes(line.kind)),
		visible,
	);
	return {
		...projectScope(complete, scope, standing, choices),
		children: complete.nodes.filter((node) => visible.has(node.id)),
		context: [],
		connections,
		allConnections,
		content: drawingContent(complete, visible, connections, { parents: visible, doors: [] }),
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
 * Draw exactly the focused subjects and their mutual lines, with the rest as doors or, when they hold no parts, cards (rule 11).
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
	const joined = joinedLines(complete, shown, ends, openSelf, standing);
	const connections = drawnLines(complete, joined, open);
	const children = complete.nodes.filter((node) => anchors.has(node.id));
	const visible = new Set([...anchors, ...connections.flatMap(({ line }) => [line.from, line.to])]);
	const known = new Set([...complete.nodes, ...complete.edges].map((subject) => subject.id));
	const context = complete.nodes.filter((node) => visible.has(node.id) && !anchors.has(node.id));
	return {
		focused,
		missingFocus: focus.filter((id) => !known.has(id)),
		complete,
		connections,
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
		content: drawingContent(complete, visible, connections, {
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
 * Keep only drawing fields and containment that this reading explicitly opens.
 * A door is a card with a name only (rule 5).
 * @param complete The full model content.
 * @param visible Modules present in this reading.
 * @param connections Its projected lines.
 * @param framing What the picture nests, and which of its cards are doors.
 * @param framing.parents Containers whose visible children remain nested.
 * @param framing.doors The modules outside the reading that a line reaches. One that holds parts is a door, and one with none has nothing to open, so it stands as its card.
 * @param framing.toggles What a door and a frame offer a live reader, if one draws the picture.
 * @returns Renderer content without private evidence or file metadata.
 */
function drawingContent(
	complete: VariantContent,
	visible: ReadonlySet<string>,
	connections: readonly OverviewLine[],
	framing: { parents: ReadonlySet<string>; doors: readonly Node[]; toggles?: Toggles | undefined },
): DrawnContent {
	const doors = new Set(framing.doors.map((node) => node.id));
	const byId = new Map(complete.nodes.map((node) => [node.id, node]));
	const [open] = framing.parents;
	const childrenOf = containment(complete);
	return {
		nodes: complete.nodes
			.filter((node) => visible.has(node.id))
			.map((node) => {
				const { description: _description, binding: _binding, ...drawn } = node;
				const card = withToggle(
					doors.has(node.id) && childrenOf.has(node.id)
						? nameOnly(drawn, doorWay(byId, node.id, open))
						: withCodePath(drawn, node, childrenOf),
					framing.toggles,
				);
				if (node.parent !== undefined && framing.parents.has(node.parent)) return card;
				const { parent: _parent, ...unframed } = card;
				return unframed;
			}),
		edges: connections.map((connection) => {
			const { anchor: _anchor, description: _description, ...line } = connection.line;
			return line;
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
	return { ...named, door };
}

/**
 * Where a door lies in the tree from the open module.
 * @param byId Every module by its identity.
 * @param door The door's module.
 * @param open The open module, if the reading has one.
 * @returns Whether it lies higher, level or deeper.
 */
function doorWay(byId: ReadonlyMap<string, Node>, door: string, open: string | undefined): DoorWay {
	const levels =
		open === undefined ? 0 : ancestors(byId, door).length - ancestors(byId, open).length;
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

export { projectModel, modelContent, type Model, type ModelFilters, type ModelFlow };
