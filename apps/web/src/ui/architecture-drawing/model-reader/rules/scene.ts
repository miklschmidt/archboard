import type { Model, ModelFilters, projectModel } from "@archboard/model/content";
import type { LayoutEngineName } from "@archboard/model/render-reply";
import { DiagramGrammarSchema, type DiagramGrammar } from "@archboard/model/views";
import type { ModelDrawing } from "#ui/architecture-drawing/model-reader/access/clients/drawing.ts";
import type {
	Departure,
	DepartureSide,
	DepartureWay,
} from "#ui/architecture-drawing/canvas/picture/transitions/clients/picture-departure.ts";
import type { MovingPicture } from "#ui/architecture-drawing/canvas/picture/clients/picture-transition.ts";
import type { SemanticBox } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import { moduleOrder } from "#ui/architecture-drawing/model-reader/rules/module-tree.ts";

type Projection = ReturnType<typeof projectModel>;
type ReadingFilters = { readonly hideKinds: NonNullable<ModelFilters["hideKinds"]> };

/** The fields of an address that decide what a reading draws and what an agent is told about it. */
interface SceneReading {
	readonly scope: string | null;
	readonly focus: string[] | null;
	/** The modules opened beside the scope, which draw into the same picture. */
	readonly expand: string[];
	readonly filters: ReadingFilters;
	readonly grammar: string;
	readonly flow: string | null;
	readonly subject: string | null;
	readonly state: string | null;
	readonly checkpoint: string | null;
	readonly against: string | null;
}

/** One presented beat, and the subjects its author asked the picture to show. */
interface ScenePresentation {
	readonly key: string;
	readonly subjects: readonly string[];
}

/** The destination a pane asks for. It stays separate from the picture on screen until it is drawn. */
interface SceneRequest {
	readonly model: Model;
	readonly projection: Projection;
	readonly reading: SceneReading;
	/** The drawing mode, or null when this reading has no picture, as with a missing flow. */
	readonly grammar: DiagramGrammar | null;
	/** Whether the model is the answer to this reading, not the last answer kept on screen. */
	readonly settled: boolean;
	/** Whether the read of this reading failed, so that no answer is on its way. */
	readonly failed?: boolean | undefined;
	readonly presentation?: ScenePresentation | undefined;
	/** The history entry of this reading. A later visit to the entry returns its camera. */
	readonly entry?: string | undefined;
	/** The engine that lays a structural reading out. A flow has none, because no engine lays it out. */
	readonly layout?: LayoutEngineName | undefined;
}

/** A drawing, named for the transitions that move it. */
type ScenePicture = ModelDrawing & MovingPicture;

/** The one reading that is on screen. Hit testing, inspection, Ask and pane reports all read this. */
interface AcceptedScene extends SceneRequest {
	readonly key: string;
	readonly picture: ScenePicture;
	/** The drawing this scene took its picture from, so a new drawing of one reading replaces it. */
	readonly drawing: ModelDrawing;
	/** Where the reader went from the scene before this one. */
	readonly heading: Departure | null;
	/** The identities selected in this scene. They hold still while another reading is drawn. */
	readonly selected: ReadonlySet<string>;
}

/** What an empty coherent reading puts on the surface: nothing, and it is finished. */
const EMPTY_DRAWING: ModelDrawing = Object.freeze({
	appearances: [],
	legend: null,
	painting: "",
	svg: "",
	width: 0,
	height: 0,
	atlas: { nodes: {}, edges: {}, regions: {} },
	placed: [],
});

/**
 * The drawing mode of a reading that has a picture.
 * @param grammar The requested mode.
 * @param projection The requested reading.
 * @returns The mode, or null for an unknown mode, a missing scope or a behavior with no flow.
 */
function drawableGrammar(grammar: string, projection: Projection): DiagramGrammar | null {
	const parsed = DiagramGrammarSchema.safeParse(grammar);
	if (!parsed.success) return null;
	const missing = parsed.data === "architecture" ? projection.missing : projection.flow === null;
	return missing ? null : parsed.data;
}

/**
 * What a picture is of. Two pictures of one subject of reading can be carried into each other.
 * @param reading The address fields.
 * @returns The scope of a structural reading, or the flow of a behavioral one.
 */
function sceneModel(reading: SceneReading): string {
	return JSON.stringify(
		reading.grammar === "architecture"
			? ["architecture", reading.scope]
			: [reading.grammar, reading.flow],
	);
}

/**
 * How a picture is narrowed. As with a view of a model, a focus starts a picture afresh.
 * @param reading The address fields.
 * @returns The focus as a view, or null for the whole scope.
 */
function sceneView(reading: SceneReading): { readonly id: string } | null {
	return reading.focus === null ? null : { id: reading.focus.join(",") };
}

/**
 * Which reading a camera is fitted to. An edit of the same reading keeps the camera, and
 * another engine draws another picture, so it fits afresh.
 * @param request The reading and its engine.
 * @returns A value that changes with each reading the camera fits afresh.
 */
function sceneFit(request: Pick<SceneRequest, "reading" | "layout">): string {
	const { reading, layout } = request;
	const { state, checkpoint, against, filters, focus, expand } = reading;
	return JSON.stringify([
		sceneModel(reading),
		focus,
		expand,
		state,
		checkpoint,
		against,
		filters,
		layout,
	]);
}

/**
 * The exact identity of a requested scene.
 * @param request The destination.
 * @returns A value that changes with its reading or with either revision.
 */
function sceneKey(request: SceneRequest): string {
	return JSON.stringify([
		request.model.revision.digest,
		request.model.comparison?.revision.digest,
		request.reading,
		request.presentation?.key,
		request.layout,
	]);
}

/**
 * The modules that hold a module, nearest first.
 * @param model The modules.
 * @param id The module.
 * @returns Its ancestors.
 */
function ancestorsOf(model: Model, id: string): string[] {
	const parents = new Map(model.modules.map((module) => [module.id, module.parent]));
	const held: string[] = [];
	for (let at = parents.get(id); at !== undefined; at = parents.get(at)) held.push(at);
	return held;
}

/**
 * Whether a module lies inside another.
 * @param model The modules.
 * @param inner The module, or null for the roots.
 * @param outer The outer module, or null for the roots.
 * @returns True when `outer` holds `inner`.
 */
function within(model: Model, inner: string | null, outer: string | null): boolean {
	if (inner === null || inner === outer) return false;
	return outer === null || ancestorsOf(model, inner).includes(outer);
}

/**
 * How deep a scope stands in the containment forest.
 * @param model The modules.
 * @param scope The scope, or null for the roots.
 * @returns How many modules hold it, itself among them.
 */
function depthOf(model: Model, scope: string | null): number {
	return scope === null ? 0 : ancestorsOf(model, scope).length + 1;
}

/**
 * Which way a move between two scopes goes. The modules nest, so depth alone says
 * it: a deeper scope lies in, a shallower one out, and one at the same depth beside.
 * @param model The modules.
 * @param from The scope left.
 * @param to The scope opened.
 * @returns The way.
 */
function wayBetween(model: Model, from: string | null, to: string | null): DepartureWay {
	const change = depthOf(model, to) - depthOf(model, from);
	if (change === 0) return "across";
	return change > 0 ? "into" : "out";
}

/**
 * Which way along the tree a scope at the same depth stands.
 * @param order Every module in the order the tree shows it.
 * @param from The scope left.
 * @param to The scope opened.
 * @returns Right to a scope later in the tree, left to an earlier one.
 */
function sideOf(
	order: readonly string[],
	from: string | null,
	to: string | null,
): DepartureSide | undefined {
	if (from === null || to === null || from === to) return undefined;
	return order.indexOf(to) > order.indexOf(from) ? "right" : "left";
}

/**
 * Name a destination.
 * @param to The destination.
 * @returns The open module, the proposal it opens, or the model.
 */
function destinationName(to: SceneRequest): string {
	const proposal = to.model.proposals.find(({ id }) => id === to.reading.state);
	return to.projection.trail.at(-1)?.name ?? proposal?.name ?? to.model.manifest.name;
}

/**
 * Whether a reading narrows its scope, so that it can come up empty while the scope is not.
 * @param reading The address fields.
 * @returns True with a focus or a filter.
 */
function isNarrowed(reading: SceneReading): boolean {
	return reading.focus !== null || reading.filters.hideKinds.length > 0;
}

/**
 * Where the reader goes from one reading to another, read from the two readings.
 * Every route to a reading takes the same way out: a card, a crumb, the list, and Back.
 * @param from The scene on screen.
 * @param to The destination.
 * @returns The way the picture leaves, and the name of the destination.
 */
function departureTo(from: AcceptedScene, to: SceneRequest): Departure {
	const model = destinationName(to);
	if (from.reading.grammar !== "architecture" || to.reading.grammar !== "architecture")
		return { way: "across", toward: null, model };
	const { scope } = to.reading;
	const way = wayBetween(to.model, from.reading.scope, scope);
	const toward = way === "into" ? towardOf(from, to.model, scope) : null;
	const side =
		way === "across"
			? sideOf(moduleOrder(to.projection.depicted), from.reading.scope, scope)
			: undefined;
	return { way, toward, side, model };
}

/**
 * The box of the card a move goes into: the scope's own, or the nearest card
 * that holds it on the scene left.
 * @param from The scene on screen.
 * @param model The modules.
 * @param scope The scope opened.
 * @returns The box, or null when the scene draws neither.
 */
function towardOf(from: AcceptedScene, model: Model, scope: string | null): SemanticBox | null {
	const card = cardToward(from, model, scope);
	return card === null ? null : (from.picture.atlas.nodes[card] ?? null);
}

/**
 * The card a move goes into: the scope's own when it is drawn, or the nearest
 * card that holds it, so that a reader goes deeper by way of what they can see.
 * @param scene The scene on screen.
 * @param model The modules.
 * @param scope The scope opened.
 * @returns The card, or null when the scene draws neither.
 */
function cardToward(scene: AcceptedScene, model: Model, scope: string | null): string | null {
	if (scope === null) return null;
	const way = [scope, ...ancestorsOf(model, scope)];
	return way.find((module) => drawnCard(scene, module) !== null) ?? null;
}

/**
 * The card a legacy board stands for on a legacy board above it: the module directly under
 * that legacy board on the way to this one.
 * @param model The modules.
 * @param scope The scope left.
 * @param to The legacy board above, or null for the roots.
 * @returns The card, or null when the destination does not hold the scope.
 */
function cardAbove(model: Model, scope: string | null, to: string | null): string | null {
	if (scope === null || !within(model, scope, to)) return null;
	const way = [scope, ...ancestorsOf(model, scope)];
	const below = to === null ? way.length : way.indexOf(to);
	return way[below - 1] ?? scope;
}

/**
 * Accept a drawn destination as the scene on screen.
 * @param request The destination.
 * @param drawing Its picture.
 * @param selected The selected identities.
 * @param before The scene it replaces.
 * @returns The scene.
 */
function acceptScene(
	request: SceneRequest,
	drawing: ModelDrawing,
	selected: ReadonlySet<string>,
	before: AcceptedScene | null,
): AcceptedScene {
	return {
		...request,
		key: sceneKey(request),
		drawing,
		picture: { ...drawing, model: sceneModel(request.reading), view: sceneView(request.reading) },
		heading: before === null ? null : departureTo(before, request),
		selected,
	};
}

/**
 * Whether a drawing lets a request replace the scene on screen.
 * @param before The scene on screen.
 * @param request The destination.
 * @param drawing Its drawing, once it exists.
 * @returns True for a settled destination with a new drawing, identity or reading.
 */
function arrives(
	before: AcceptedScene | null,
	request: SceneRequest,
	drawing: ModelDrawing | undefined,
): drawing is ModelDrawing {
	if (drawing === undefined || !request.settled) return false;
	if (before?.key !== sceneKey(request) || before.drawing !== drawing) return true;
	// A correction keeps the revision and the drawing, and changes what inspection reads.
	return before.model !== request.model;
}

/**
 * Keep a scene up to date with the pane while no destination is on its way.
 * @param scene The scene on screen.
 * @param request The destination it answers.
 * @param selected The selection the pane holds.
 * @returns The scene, with each new pick and the history entry it lives in.
 */
function followPane(
	scene: AcceptedScene,
	request: SceneRequest,
	selected: ReadonlySet<string>,
): AcceptedScene {
	return scene.selected === selected && scene.entry === request.entry
		? scene
		: { ...scene, selected, entry: request.entry };
}

/**
 * The scene on screen once a render has had its say.
 * @param before The scene on screen.
 * @param request The destination.
 * @param drawing Its drawing, once it exists.
 * @param selected The selection the pane holds.
 * @returns The same scene, or the one that replaces it.
 */
function nextScene(
	before: AcceptedScene | null,
	request: SceneRequest,
	drawing: ModelDrawing | undefined,
	selected: ReadonlySet<string>,
): AcceptedScene | null {
	const scene = arrives(before, request, drawing)
		? acceptScene(request, drawing, selected, before)
		: before;
	return scene?.key === sceneKey(request) ? followPane(scene, request, selected) : scene;
}

/**
 * Where the picture on screen goes while its destination is drawn. A picture stays
 * through a change of state or an edit, and a presented beat holds until the next one exists.
 * @param scene The scene on screen.
 * @param request The destination.
 * @returns The departure, or null while the picture stays.
 */
function leavingTo(scene: AcceptedScene | null, request: SceneRequest): Departure | null {
	if (scene === null || request.grammar === null || request.presentation !== undefined) return null;
	return scene.picture.model === sceneModel(request.reading) ? null : departureTo(scene, request);
}

/** How a reader goes from the scene on screen to a module. */
type Move =
	| { readonly kind: "plain" }
	| { readonly kind: "into"; readonly card: string | null }
	| { readonly kind: "out"; readonly card: string };

/**
 * Which flight, if any, a move to a module can make. The camera flies when it has
 * a card to fly through: into the nearest card that holds a deeper module, or out
 * of the card that holds this model on a model above it. Any other move changes
 * the picture the plain way, which the painter makes a passage of.
 * @param scene The scene on screen.
 * @param next The module, or null for the roots.
 * @returns The move.
 */
function moveTo(scene: AcceptedScene | null, next: string | null): Move {
	if (scene?.reading.grammar !== "architecture" || next === scene.reading.scope)
		return { kind: "plain" };
	const { model } = scene;
	const { scope } = scene.reading;
	const above = cardAbove(model, scope, next);
	if (above !== null) return { kind: "out", card: above };
	return wayBetween(model, scope, next) === "into"
		? { kind: "into", card: cardToward(scene, model, next) }
		: { kind: "plain" };
}

/**
 * The card that stands for a module in the scene, if it is drawn.
 * @param scene The scene on screen.
 * @param module The module, or null for the roots.
 * @returns The card's identity, or null.
 */
function drawnCard(scene: AcceptedScene, module: string | null): string | null {
	return module !== null && module in scene.picture.atlas.nodes ? module : null;
}

/**
 * The module that holds a scope.
 * @param model The modules.
 * @param scope The scope.
 * @returns Its parent, or null for the roots.
 */
function parentOf(model: Model, scope: string): string | null {
	return ancestorsOf(model, scope)[0] ?? null;
}

export {
	EMPTY_DRAWING,
	destinationName,
	drawableGrammar,
	isNarrowed,
	leavingTo,
	moveTo,
	nextScene,
	parentOf,
	sceneModel,
	sceneFit,
	sceneKey,
	sceneView,
	type AcceptedScene,
	type Projection,
	type ScenePicture,
	type SceneReading,
	type SceneRequest,
};
