import { queryOptions } from "@tanstack/react-query";
import {
	ArchitectureModelReadSchema,
	ArchitectureCheckpointListSchema,
	type ArchitectureModelRead,
	type ArchitectureCheckpointList,
} from "@archboard/board/model";
import { inVault, RequestFailure, strictReply, type ReplySchema } from "@archboard/server-requests";

/** The canonical readings cached by this tab. */
const architectureModelKeys = {
	all: ["architecture-model"] as const,
	/**
	 * One explicit current or retained reading.
	 * @param vault The explicitly addressed vault.
	 * @param checkpoint The exact identity, or null for current inputs.
	 * @returns Its query key.
	 */
	reading: (vault: string, checkpoint: string | null) =>
		["architecture-model", vault, "reading", checkpoint] as const,
	/**
	 * The retained metadata in one vault.
	 * @param vault The explicitly addressed vault.
	 * @returns Its query key.
	 */
	checkpoints: (vault: string) => ["architecture-model", vault, "checkpoints"] as const,
};

/**
 * Read a shared architecture contract without discarding structured refusals.
 * @param url The explicitly addressed resource.
 * @param schema Its shared runtime schema.
 * @param signal Cancels an obsolete request.
 * @returns The shared runtime answer.
 */
async function readReply<T>(url: string, schema: ReplySchema<T>, signal: AbortSignal): Promise<T> {
	const result = await strictReply<T, T | Error>(url, { signal }, schema, schema, (error) =>
		error instanceof RequestFailure
			? error
			: new Error("The architecture could not be read. Retry when the local server is available."),
	);
	if (result instanceof Error) throw result;
	return result;
}

/**
 * Read only the explicitly selected inputs.
 * @param vault The addressed vault.
 * @param checkpoint The exact identity, or null for current inputs.
 * @param signal Cancels an obsolete request.
 * @returns The shared runtime reading.
 */
function readModel(
	vault: string,
	checkpoint: string | null,
	signal: AbortSignal,
): Promise<ArchitectureModelRead> {
	const url = inVault("/api/architecture/model", vault);
	return readReply(
		checkpoint === null ? url : `${url}&checkpoint=${encodeURIComponent(checkpoint)}`,
		ArchitectureModelReadSchema,
		signal,
	);
}

/**
 * A model has one server snapshot, shared by every reader of its vault.
 * Reads refresh on selection, mounting, focus, reconnect, or an explicit refresh. There
 * is no canonical write feed yet. Query cancellation discards obsolete reads.
 * @param vault The addressed vault.
 * @param checkpoint The exact identity, or null for current inputs.
 * @returns Query options for the shared model result.
 */
function architectureModelQuery(vault: string, checkpoint: string | null = null) {
	return queryOptions({
		queryKey: architectureModelKeys.reading(vault, checkpoint),
		/**
		 * Read the addressed model through the shared transport.
		 * @param context The query cancellation signal.
		 * @returns The runtime answer.
		 */
		queryFn: (context) => readModel(vault, checkpoint, context.signal),
		staleTime: 0,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
		refetchOnReconnect: "always",
		retry: false,
	});
}

/**
 * Retained metadata shares the existing refresh and reconnect invalidation.
 * @param vault The addressed vault.
 * @returns Query options for the checkpoint catalogue.
 */
function architectureCheckpointsQuery(vault: string) {
	return queryOptions({
		queryKey: architectureModelKeys.checkpoints(vault),
		/**
		 * Read retained metadata independently of current architecture.
		 * @param context The query cancellation signal.
		 * @returns The shared list outcome.
		 */
		queryFn: (context) =>
			readReply(
				inVault("/api/architecture/checkpoints", vault),
				ArchitectureCheckpointListSchema,
				context.signal,
			),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
		refetchOnReconnect: "always",
		retry: false,
	});
}

/**
 * Only a known empty or uninitialized archive permits legacy empty guidance.
 * @param result The retained metadata result.
 * @returns True when no saved reading can be offered.
 */
function hasNoCheckpoints(result: ArchitectureCheckpointList): boolean {
	return result.success
		? result.checkpoints.length === 0
		: result.code === "ARCHIVE_NOT_INITIALIZED";
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

export {
	architectureModelKeys,
	architectureModelQuery,
	architectureCheckpointsQuery,
	hasNoCanonicalModel,
	hasNoCheckpoints,
};
