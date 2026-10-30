import { queryOptions } from "@tanstack/react-query";
import type { Model } from "@archboard/board/content";
import { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import { inVault } from "@archboard/server-requests";
import {
	architectureModelKeys,
	ArchitectureReadError,
	readReply,
} from "#ui/clients/architecture-model/queries.ts";

/**
 * Read the existing Git analysis for the exact canonical architecture on screen.
 * @param vault The explicitly addressed vault.
 * @param model The coherent model, state, and optional checkpoint.
 * @returns One cached locality request, refreshed on demand rather than on a timer.
 */
function modelHistoryQuery(
	vault: string,
	model: Pick<Model, "manifest" | "selectedState" | "checkpoint" | "revision">,
) {
	const state = model.selectedState?.id;
	const checkpoint = model.checkpoint?.id;
	const expected = JSON.stringify([model.manifest.id, model.revision.digest, state, checkpoint]);
	const parameters = new URLSearchParams();
	if (checkpoint !== undefined) parameters.set("checkpoint", checkpoint);
	else if (state !== undefined) parameters.set("state", state);
	return queryOptions({
		queryKey: [
			...architectureModelKeys.vault(vault),
			"locality",
			model.manifest.id,
			state,
			checkpoint,
			model.revision.digest,
		],
		/**
		 * Keep Git evidence paired with the model revision that selected the module.
		 * @returns Matching locality evidence, or an explicit refusal.
		 */
		queryFn: async () => {
			const result = await readReply(
				`${inVault("/api/architecture/locality", vault)}&${parameters}`,
				ArchitectureHistoryResultSchema,
			);
			if (!result.success) throw new ArchitectureReadError(result);
			if (result.analysis !== "locality")
				throw new Error("The history response contains another analysis. Retry the read.");
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
		staleTime: 0,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
	});
}

export { modelHistoryQuery };
