import type { Model, ModelFilters, projectModel } from "@archboard/board/content";
import { DiagramGrammarSchema, type DiagramGrammar } from "@archboard/board/views";
import type { ModelDrawing } from "#ui/clients/architecture-model/drawing.ts";
import type {
	Departure,
	DepartureWay,
} from "#ui/clients/semantic-board-canvas/picture/picture-departure.ts";
import type { MovingPicture } from "#ui/clients/semantic-board-canvas/picture/picture-transition.ts";

type Projection = ReturnType<typeof projectModel>;
type ReadingFilters = { [Field in keyof ModelFilters]-?: NonNullable<ModelFilters[Field]> };

/** The fields of an address that decide what a reading draws and what an agent is told about it. */
interface SceneReading {
	readonly scope: string | null;
	readonly focus: string[] | null;
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
	key: null,
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
function sceneBoard(reading: SceneReading): string {
	return JSON.stringify(
		reading.grammar === "architecture"
			? ["architecture", reading.scope]
			: [reading.grammar, reading.flow],
	);
}

/**
 * How a picture is narrowed. As with a view of a board, a focus starts a picture afresh.
 * @param reading The address fields.
 * @returns The focus as a view, or null for the whole scope.
 */
function sceneView(reading: SceneReading): { readonly id: string } | null {
	return reading.focus === null ? null : { id: reading.focus.join(",") };
}

/**
 * Which reading a camera is fitted to. An edit of the same reading keeps the camera.
 * @param reading The address fields.
 * @returns A value that changes with each reading the camera fits afresh.
 */
function sceneFit(reading: SceneReading): string {
	const { state, checkpoint, against, filters, focus } = reading;
	return JSON.stringify([sceneBoard(reading), focus, state, checkpoint, against, filters]);
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
 * Which way a move between two scopes goes.
 * @param model The modules.
 * @param from The scope left.
 * @param to The scope opened.
 * @param entered Whether the scene left draws the scope opened as a card.
 * @returns Out to a module that holds the scope left, into a card or a part, or across.
 */
function wayBetween(
	model: Model,
	from: string | null,
	to: string | null,
	entered: boolean,
): DepartureWay {
	if (within(model, from, to)) return "out";
	return entered || within(model, to, from) ? "into" : "across";
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
	const { hideKinds, showGroups } = reading.filters;
	return reading.focus !== null || hideKinds.length > 0 || showGroups.length > 0;
}

/**
 * Where the reader goes from one reading to another, read from the two readings.
 * Every route to a reading takes the same way out: a card, a crumb, the list, and Back.
 * @param from The scene on screen.
 * @param to The destination.
 * @returns The way the picture leaves, and the name of the destination.
 */
function departureTo(from: AcceptedScene, to: SceneRequest): Departure {
	const board = destinationName(to);
	if (from.reading.grammar !== "architecture" || to.reading.grammar !== "architecture")
		return { way: "across", toward: null, board };
	const { scope } = to.reading;
	const toward = from.picture.atlas.nodes[scope ?? ""] ?? null;
	return { way: wayBetween(to.model, from.reading.scope, scope, toward !== null), toward, board };
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
		picture: { ...drawing, board: sceneBoard(request.reading), view: sceneView(request.reading) },
		heading: before === null ? null : departureTo(before, request),
		selected,
	};
}

/**
 * Whether a drawing lets a request replace the scene on screen.
 * @param before The scene on screen.
 * @param request The destination.
 * @param drawing Its drawing, once it exists.
 * @returns True for a settled destination with a new drawing or a new identity.
 */
function arrives(
	before: AcceptedScene | null,
	request: SceneRequest,
	drawing: ModelDrawing | undefined,
): drawing is ModelDrawing {
	if (drawing === undefined || !request.settled) return false;
	return before?.key !== sceneKey(request) || before.drawing !== drawing;
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
	return scene.picture.board === sceneBoard(request.reading) ? null : departureTo(scene, request);
}

/** How a reader goes from the scene on screen to a module. */
type Move =
	| { readonly kind: "plain" }
	| { readonly kind: "into"; readonly card: string | null }
	| { readonly kind: "out"; readonly card: string };

/**
 * Which flight, if any, a move to a module can make. Only the entered subject
 * justifies a flight: a card that opens, or the open module's own card above it.
 * @param scene The scene on screen.
 * @param next The module, or null for the roots.
 * @returns The move.
 */
function moveTo(scene: AcceptedScene | null, next: string | null): Move {
	if (scene?.reading.grammar !== "architecture" || next === scene.reading.scope)
		return { kind: "plain" };
	const { scope } = scene.reading;
	if (scope !== null && within(scene.model, scope, next)) return { kind: "out", card: scope };
	return { kind: "into", card: drawnCard(scene, next) };
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
	sceneBoard,
	sceneFit,
	sceneKey,
	sceneView,
	type AcceptedScene,
	type Projection,
	type ScenePicture,
	type SceneReading,
	type SceneRequest,
};
