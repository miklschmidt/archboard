import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { projectModel, type Model } from "@archboard/board/content";
import { modelDrawingQuery } from "#ui/clients/architecture-model/drawing.ts";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { useDive, type Destination } from "#ui/hooks/semantic-board-canvas/use-dive.ts";
import { useLayoutEngine } from "#ui/hooks/semantic-board-canvas/use-layout-engine.ts";
import { toggled } from "#ui/rules/architecture-model/expansion.ts";
import {
	moveTo,
	parentOf,
	sceneBoard,
	sceneView,
	type AcceptedScene,
	type ScenePicture,
	type SceneReading,
} from "#ui/rules/architecture-model/scene.ts";

/** A flight's name for the repository roots, which have no module identity. */
const ROOTS = "";

interface MoveInputs {
	camera: BoardCamera;
	/** The picture's area. */
	area: RefObject<HTMLElement | null>;
	/** The scene on screen. */
	scene: AcceptedScene | null;
	/** The destination the address asks for. */
	reading: SceneReading;
	/** That destination's projection, which says what its doors and frames do. */
	projection: Parameters<typeof toggled>[0];
	model: Model;
	/** The comparison base of the reading, which the next picture draws against too. */
	reference: Model | undefined;
	reducedMotion: boolean;
	/**
	 * Open a module the plain way.
	 * @param scope The module, or null for the repository roots.
	 */
	open: (scope: string | null) => void;
}

/**
 * Go between modules: fly into a card or out of one when the picture allows it,
 * otherwise open the module the plain way, which each flight ends with.
 * @param inputs The pane, the reading, and the plain move.
 * @returns The move, whether a flight just handed over, and the way to draw a module ahead.
 */
function useModelMoves(inputs: MoveInputs) {
	const { scene, reading, projection, model, reference, open } = inputs;
	const client = useQueryClient();
	const layout = useLayoutEngine();
	const draw = useCallback(
		async (to: Destination): Promise<ScenePicture | null> => {
			const scope = to.board === ROOTS ? null : to.board;
			const filters = { ...reading.filters, controls: true };
			const projection = projectModel(model, scope, null, filters, reference);
			if (projection.content.nodes.length === 0) return null;
			const destination = { ...reading, scope, focus: null, expand: [], grammar: "architecture" };
			return {
				...(await client.fetchQuery(modelDrawingQuery(model, projection, "architecture", layout))),
				board: sceneBoard(destination),
				view: sceneView(destination),
			};
		},
		[client, model, reference, reading, layout],
	);
	const drawToggled = useCallback(
		async (id: string): Promise<void> => {
			const expand = toggled(projection, id);
			if (expand === null) return;
			const filters = { ...reading.filters, expand: [...expand], controls: true };
			const next = projectModel(model, reading.scope, reading.focus, filters, reference);
			await client.fetchQuery(modelDrawingQuery(model, next, "architecture", layout));
		},
		[client, model, reference, reading, projection, layout],
	);
	const dive = useDive({
		camera: inputs.camera,
		area: inputs.area,
		drawn: scene?.picture ?? null,
		draw,
		reducedMotion: inputs.reducedMotion,
		presenting: false,
	});
	const { into, out, abandon } = dive;
	// A move that came another way, such as Back, ends a flight and what the flight was for.
	const address = JSON.stringify(reading);
	useEffect(abandon, [address, abandon]);
	const move = useCallback(
		(next: string | null): void => {
			/**
			 * Change the address with no flight.
			 * @returns Nothing.
			 */
			const plain = (): void => open(next);
			const route = moveTo(scene, next);
			const to = { board: next ?? ROOTS };
			if (route.kind === "out") out({ ...to, card: route.card }, plain);
			else if (route.kind === "into") into(route.card, to, plain);
			else plain();
		},
		[scene, open, into, out],
	);
	const ahead = useDrawAhead(draw, drawToggled, scene, model);
	return { move, cut: dive.cut, ahead };
}

/**
 * Draw what the reader is about to open, so a flight finds its picture in time.
 * The reader's hand bounds this work: what the door or frame they rest on or pick
 * opens, the module it stands for, and the module above the open one. One drawing
 * runs at a time, and only the latest request waits.
 * @param draw How the pane draws a module.
 * @param drawToggled How the pane draws the picture a door or frame opens.
 * @param scene The scene on screen.
 * @param model The modules.
 * @returns Ask for a subject, which is ignored unless it is a module.
 */
function useDrawAhead(
	draw: (to: Destination) => Promise<ScenePicture | null>,
	drawToggled: (id: string) => Promise<void>,
	scene: AcceptedScene | null,
	model: Model,
) {
	const queue = useRef({ running: false, next: null as (() => Promise<unknown>) | null });
	const ask = useCallback((task: () => Promise<unknown>): void => {
		const work = queue.current;
		work.next = task;
		if (work.running) return;
		work.running = true;
		/**
		 * Draw what the reader asked for last, until nothing waits.
		 * @returns Once the queue is empty.
		 */
		const step = async (): Promise<void> => {
			while (work.next !== null) {
				const task = work.next;
				work.next = null;
				// oxlint-disable-next-line no-await-in-loop -- one at a time, so drawing ahead never takes more than one of the renderer's workers
				await task().catch(() => null);
			}
			work.running = false;
		};
		void step();
	}, []);
	const modules = useMemo(() => new Set(model.modules.map((module) => module.id)), [model.modules]);
	const scope = scene?.reading.scope ?? null;
	useEffect(() => {
		if (scope !== null) ask(() => draw({ board: parentOf(model, scope) ?? ROOTS }));
	}, [scope, model, ask, draw]);
	return useCallback(
		(id: string): void => {
			const opens = modules.has(id) && id !== scope;
			ask(async () => {
				await drawToggled(id);
				if (opens) await draw({ board: id });
			});
		},
		[modules, scope, ask, draw, drawToggled],
	);
}

export { useModelMoves };
