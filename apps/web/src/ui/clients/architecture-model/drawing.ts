import { prepareContentHere } from "@archboard/renderer/browser";
import { queryOptions } from "@tanstack/react-query";
import type { projectModel, Model } from "#ui/rules/architecture-model/projection.ts";

/**
 * Each reading revision accepts only the scene key derived from its content and interfaces.
 * @param model The coherent architecture revision.
 * @param projection The content this reading shows.
 * @returns A local rendering query, independent of selection and camera state.
 */
function modelDrawingQuery(model: Model, projection: ReturnType<typeof projectModel>) {
	const prepared = prepareContentHere({
		grammar: "architecture",
		content: projection.content,
		variant: projection.complete,
		policy: model.policy,
	});
	return queryOptions({
		queryKey: ["model-drawing", model.manifest.id, prepared.key],
		queryFn: prepared.draw,
		staleTime: Infinity,
		retry: false,
		enabled: projection.content.nodes.length > 0,
	});
}

export { modelDrawingQuery };
