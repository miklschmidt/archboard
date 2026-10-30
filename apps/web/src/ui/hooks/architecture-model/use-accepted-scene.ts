import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { modelDrawingQuery } from "#ui/clients/architecture-model/drawing.ts";
import {
	EMPTY_DRAWING,
	leavingTo,
	nextScene,
	sceneKey,
	type AcceptedScene,
	type SceneRequest,
} from "#ui/rules/architecture-model/scene.ts";

/**
 * The drawing of a destination, or nothing until it exists.
 * The query answers only for the current request, so a late drawing of an older
 * destination never arrives here. An empty or unavailable reading has no picture, and
 * never shows the last one in its place.
 * @param request The destination.
 * @returns The query for its picture, and the drawing it can be accepted with.
 */
function useSceneDrawing(request: SceneRequest) {
	const { model, projection, grammar, settled } = request;
	const options = useMemo(
		() => modelDrawingQuery(model, projection, grammar ?? "architecture"),
		[model, projection, grammar],
	);
	const drawable = grammar !== null && projection.content.nodes.length > 0;
	const query = useQuery({ ...options, enabled: drawable && settled });
	return { query, drawing: drawable ? query.data : EMPTY_DRAWING };
}

/**
 * Hold one accepted scene while another reading is drawn.
 * @param request The destination the pane asks for.
 * @param selected The selection the pane holds now.
 * @returns The scene on screen, what inspection reads, the state of the destination, and how
 * to draw it again.
 */
function useAcceptedScene(request: SceneRequest, selected: ReadonlySet<string>) {
	const { query, drawing } = useSceneDrawing(request);
	const [accepted, setAccepted] = useState<AcceptedScene | null>(null);
	const scene = nextScene(accepted, request, drawing, selected);
	if (scene !== accepted) setAccepted(scene);
	// A destination that failed is not on its way, and the picture stays until the reader moves.
	const pending = scene?.key !== sceneKey(request) && !query.isError && request.failed !== true;
	const leaving = useMemo(
		() => (pending ? leavingTo(scene, request) : null),
		[pending, scene, request],
	);
	return {
		scene,
		...shownOf(scene, request, selected),
		pending,
		leaving,
		failure: query.error,
		retry: query.refetch,
	};
}

/**
 * What inspection reads: the accepted scene, or the destination before any scene exists.
 * @param scene The scene on screen.
 * @param request The destination the pane asks for.
 * @param selected The selection the pane holds now.
 * @returns The reading on show, whether a picture stands for it, and its selection.
 */
function shownOf(
	scene: AcceptedScene | null,
	request: SceneRequest,
	selected: ReadonlySet<string>,
) {
	const ready = scene !== null && request.grammar !== null;
	return { shown: ready ? scene : request, ready, selected: scene?.selected ?? selected };
}

export { useAcceptedScene };
