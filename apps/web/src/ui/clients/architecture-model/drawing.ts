import type { DiagramGrammar } from "@archboard/board/views";
import { queryOptions } from "@tanstack/react-query";
import type { projectModel, Model } from "@archboard/board/content";
import { rendererBuild } from "virtual:archboard-renderer";
import {
	browserPictureStorage,
	cachedModelDrawing,
} from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";

type ModelDrawing = Awaited<ReturnType<typeof cachedModelDrawing>>;

const storage = browserPictureStorage();

/**
 * Each reading revision accepts only the scene key derived from its content and interfaces.
 * The renderer loads only when a picture is drawn, so a reader can own this query in the first chunk.
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
	const request = {
		grammar,
		content: projection.content,
		variant: projection.complete,
		held: projection.held,
		standing: projection.standing,
		unsettled: projection.unsettled,
		policy: model.policy,
	};
	const key = JSON.stringify(["canonical", rendererBuild, model.manifest.id, request]);
	return queryOptions({
		queryKey: ["model-drawing", key],
		/**
		 * Reuse a matching scene or render it locally.
		 * @returns The stored or newly rendered scene.
		 */
		queryFn: async () => {
			const { prepareContentHere } = await import("@archboard/renderer/browser");
			return cachedModelDrawing(storage, key, prepareContentHere(request).draw);
		},
		staleTime: Infinity,
		retry: false,
	});
}

export { modelDrawingQuery, type ModelDrawing };
