import { queryOptions } from "@tanstack/react-query";
import type { projectModel, Model } from "#ui/rules/architecture-model/projection.ts";

/**
 * An obsolete drawing belongs only to its own reading and revision.
 * @param model The coherent architecture revision.
 * @param projection The content this reading shows.
 * @returns A local rendering query, independent of selection and camera state.
 */
function modelDrawingQuery(model: Model, projection: ReturnType<typeof projectModel>) {
	return queryOptions({
		queryKey: ["model-drawing", model.manifest.id, model.revision.digest, projection.content],
		queryFn: async () => {
			const { drawContentHere } = await import("@archboard/renderer/browser");
			return drawContentHere({
				grammar: "architecture",
				content: projection.content,
				variant: projection.complete,
				policy: model.policy,
			});
		},
		staleTime: Infinity,
		retry: false,
		enabled: projection.content.nodes.length > 0,
	});
}

export { modelDrawingQuery };
