import { queryOptions } from "@tanstack/react-query";
import { ArchitectureModelReadSchema, type ArchitectureModelRead } from "@archboard/board/model";
import { cancellable, inVault, strictReply } from "@archboard/server-requests";

/** The canonical readings cached by this tab. */
const architectureModelKeys = {
	all: ["architecture-model"] as const,
	/**
	 * The current authored model in one vault.
	 * @param vault The explicitly addressed vault.
	 * @returns Its query key.
	 */
	current: (vault: string) => ["architecture-model", vault, "current"] as const,
};

/**
 * Read one canonical model, retaining structured domain refusals.
 * @param vault The addressed vault.
 * @param signal Cancels an obsolete request.
 * @returns The shared runtime answer.
 */
async function readModel(vault: string, signal: AbortSignal): Promise<ArchitectureModelRead> {
	const result = await strictReply<ArchitectureModelRead, ArchitectureModelRead | Error>(
		inVault("/api/architecture/model", vault),
		cancellable(signal),
		ArchitectureModelReadSchema,
		ArchitectureModelReadSchema,
		() =>
			new Error("The architecture could not be read. Retry when the local server is available."),
	);
	if (result instanceof Error) throw result;
	return result;
}

/**
 * A model has one server snapshot, shared by every reader of its vault.
 * Reads refresh on mounting, focus, reconnect, or an explicit refresh. There
 * is no canonical write feed yet. Query cancellation discards obsolete reads.
 * @param vault The addressed vault.
 * @returns Query options for the shared model result.
 */
function architectureModelQuery(vault: string) {
	return queryOptions({
		queryKey: architectureModelKeys.current(vault),
		/**
		 * Read the addressed model through the shared transport.
		 * @param context The query cancellation signal.
		 * @returns The runtime answer.
		 */
		queryFn: (context) => readModel(vault, context.signal),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
		refetchOnReconnect: "always",
		retry: false,
	});
}

/**
 * Whether this vault still belongs to the legacy reader or has no model.
 * @param result The server answer.
 * @returns True when the existing empty-board surface remains appropriate.
 */
function hasNoCanonicalModel(result: ArchitectureModelRead): boolean {
	return (
		!result.success && (result.code === "LEGACY_AUTHORITY" || result.code === "MODEL_NOT_FOUND")
	);
}

export { architectureModelKeys, architectureModelQuery, hasNoCanonicalModel };
