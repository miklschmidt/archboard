import { queryOptions } from "@tanstack/react-query";
import { readModel } from "#ui/clients/architecture-model/queries.ts";

/**
 * Resolve one presentation once, independently of mutable reading invalidations.
 * @param vault The addressed vault.
 * @param request The deliberate playback invocation and its source selection.
 * @param request.id The unique invocation identity.
 * @param request.walkthrough The authored narrative identity.
 * @param request.checkpoint The exact source checkpoint, or current inputs.
 * @param request.state The selected proposal, or current architecture.
 * @param request.preview The migration origin, when reading original architecture.
 * @returns A captured read that changes only after an explicit new invocation.
 */
function modelWalkthroughQuery(
	vault: string,
	request: {
		id: string;
		walkthrough: string;
		checkpoint: string | null;
		state: string | null;
		preview?: string | null;
	},
) {
	return queryOptions({
		queryKey: ["architecture-playback", vault, request] as const,
		/**
		 * Resolve the narrative and its complete target together.
		 * @param context The request cancellation signal.
		 * @returns One immutable presentation reading.
		 */
		queryFn: (context) =>
			readModel(vault, request.checkpoint, context.signal, {
				preview: request.preview,
				state: request.state,
				walkthrough: request.walkthrough,
			}),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 0,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		retry: false,
	});
}

export { modelWalkthroughQuery };
