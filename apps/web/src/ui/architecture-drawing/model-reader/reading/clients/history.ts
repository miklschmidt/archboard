import type { Model } from "@archboard/model-rules";
import { historyQuery } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";

/**
 * Read the existing Git analysis for the exact canonical architecture on screen. The first read of
 * a revision walks a year of Git, and its one answer holds every module, so a consumer that mounts
 * shares it and nothing reads again until the revision moves or a person asks.
 * @param vault The explicitly addressed vault.
 * @param model The coherent model, state, and optional checkpoint.
 * @returns One cached locality request.
 */
function modelHistoryQuery(
	vault: string,
	model: Pick<Model, "manifest" | "selectedState" | "checkpoint" | "revision">,
) {
	const state = model.selectedState?.id;
	const checkpoint = model.checkpoint?.id;
	const expected = JSON.stringify([model.manifest.id, model.revision.digest, state, checkpoint]);
	return historyQuery(
		vault,
		{ analysis: "locality", ...(checkpoint === undefined ? { state } : { checkpoint }) },
		{
			key: ["locality", model.manifest.id, state, checkpoint, model.revision.digest],
			/**
			 * Keep Git evidence paired with the model revision that selected the module.
			 * @param result The locality answer.
			 * @returns The answer, when it reads the model on screen.
			 */
			accept: (result) => {
				const actual = JSON.stringify([
					result.model,
					result.revision.digest,
					result.state?.id,
					result.checkpoint,
				]);
				if (actual !== expected)
					throw new Error(
						"The architecture changed while its history was read. Refresh the architecture and try again.",
					);
				return result;
			},
		},
	);
}

export { modelHistoryQuery };
