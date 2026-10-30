import type { DiagramGrammar } from "@archboard/board/views";
import { scopedDrawingKey } from "@archboard/renderer/picture";
import { queryOptions } from "@tanstack/react-query";
import type { projectModel, Model } from "@archboard/board/content";
import { rendererBuild } from "virtual:archboard-renderer";
import {
	browserPictureStorage,
	cachedModelDrawing,
	modelDrawingKey,
} from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";

type ModelDrawing = Awaited<ReturnType<typeof cachedModelDrawing>>;

const storage = browserPictureStorage();

/**
 * A drawing is keyed by a digest of what it is drawn from, so an edit it does not read keeps it.
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
	const key = modelDrawingKey(rendererBuild, model.manifest.id, scopedDrawingKey(request));
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
