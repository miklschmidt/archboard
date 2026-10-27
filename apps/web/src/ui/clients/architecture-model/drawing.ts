import { prepareContentHere } from "@archboard/renderer/browser";
import type { DiagramGrammar } from "@archboard/board/views";
import { queryOptions } from "@tanstack/react-query";
import type { projectModel, Model } from "@archboard/board/content";
import { rendererBuild } from "virtual:archboard-renderer";
import {
	browserPictureStorage,
	cachedModelDrawing,
} from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";

const storage = browserPictureStorage();

/**
 * Each reading revision accepts only the scene key derived from its content and interfaces.
 * @param model The coherent architecture revision.
 * @param projection The content this reading shows.
 * @param grammar The explicitly requested diagram mode.
 * @returns A local rendering query, independent of selection and camera state.
 */
function modelDrawingQuery(
	model: Model,
	projection: ReturnType<typeof projectModel>,
	grammar: DiagramGrammar,
) {
	const prepared = prepareContentHere({
		grammar,
		content: projection.content,
		variant: projection.complete,
		held: projection.held,
		standing: projection.standing,
		unsettled: projection.unsettled,
		policy: model.policy,
	});
	const key = JSON.stringify(["canonical", rendererBuild, model.manifest.id, prepared.key]);
	return queryOptions({
		queryKey: ["model-drawing", key],
		/**
		 * Reuse a matching scene or render it locally.
		 * @returns The stored or newly rendered scene.
		 */
		queryFn: () => cachedModelDrawing(storage, key, prepared.draw),
		staleTime: Infinity,
		retry: false,
		enabled: projection.content.nodes.length > 0,
	});
}

export { modelDrawingQuery };
