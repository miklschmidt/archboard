import type { LayoutEngineName } from "@archboard/board/render-reply";
import type { DiagramGrammar } from "@archboard/board/views";
import { scopedDrawingKey } from "@archboard/renderer/picture";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { projectModel, Model } from "@archboard/board/content";
import { rendererBuild } from "virtual:archboard-renderer";
import {
	browserPictureStorage,
	cachedModelDrawing,
	modelDrawingKey,
} from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";

type ModelDrawing = Awaited<ReturnType<typeof cachedModelDrawing>>;

const storage = browserPictureStorage();
const DRAWINGS = "model-drawing";

/**
 * A drawing is keyed by a digest of what it is drawn from, so an edit it does not read keeps it.
 * The renderer loads only when a picture is drawn, so a reader can own this query in the first chunk.
 * @param model The coherent architecture revision.
 * @param projection The content this reading shows.
 * @param grammar The explicitly requested diagram mode.
 * @param layout The engine, which the digest names, so one engine never answers for the other.
 * @returns A local rendering query, independent of selection and camera state.
 */
function modelDrawingQuery(
	model: Model,
	projection: ReturnType<typeof projectModel>,
	grammar: DiagramGrammar,
	layout: LayoutEngineName | undefined,
) {
	const request = {
		grammar,
		layout,
		content: projection.content,
		variant: projection.complete,
		held: projection.held,
		standing: projection.standing,
		unsettled: projection.unsettled,
		policy: model.policy,
	};
	const key = modelDrawingKey(rendererBuild, model.manifest.id, scopedDrawingKey(request));
	return queryOptions({
		queryKey: [DRAWINGS, key],
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

/**
 * Draw again what failed on screen. A drawing of a reading never goes stale by itself, so
 * only this and an explicit retry reach one that failed.
 * @param client The query cache.
 * @returns After the failed drawings have run again.
 */
function retryFailedDrawings(client: QueryClient): Promise<void> {
	return client.refetchQueries({
		queryKey: [DRAWINGS],
		type: "active",
		/**
		 * Keep every drawing that succeeded.
		 * @param query A drawing.
		 * @returns Whether it failed.
		 */
		predicate: (query) => query.state.status === "error",
	});
}

export { modelDrawingQuery, retryFailedDrawings, type ModelDrawing };
