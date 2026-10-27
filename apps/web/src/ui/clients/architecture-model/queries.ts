import type { ModelAddress } from "#ui/rules/board-routing/address.ts";
import { queryOptions } from "@tanstack/react-query";
import {
	ArchitectureModelReadSchema,
	ArchitectureCheckpointListSchema,
	ArchitectureClaimListSchema,
	type ArchitectureModelRead,
	type ArchitectureCheckpointList,
} from "@archboard/board/model";
import { inVault, strictReply, type ReplySchema } from "@archboard/server-requests";

type StateSelection = {
	readonly [Field in "state" | "against" | "preview" | "bookmark" | "legacyAddress"]?:
		| ModelAddress[Field]
		| null;
} & {
	readonly compare?: boolean;
	readonly walkthrough?: string;
	readonly shared?: boolean;
	readonly module?: Extract<ArchitectureModelRead, { success: true }>["selectedModule"];
	readonly code?: boolean;
	readonly references?: boolean;
	readonly reference?: number;
};

/** A failed read retains its structured diagnostics while Query keeps the last coherent data. */
class ArchitectureReadError extends Error {
	/**
	 * Keep the public refusal attached to the failed read.
	 * @param failure The runtime refusal.
	 */
	constructor(readonly failure: Extract<ArchitectureModelRead, { success: false }>) {
		super(failure.error);
		this.name = "ArchitectureReadError";
	}
}

const READING_FIELDS = [
	"preview",
	"bookmark",
	"legacyAddress",
	"state",
	"against",
	"compare",
	"module",
	"code",
	"references",
	"reference",
	"walkthrough",
	"shared",
] as const;

/** The canonical readings cached by this tab. */
const architectureModelKeys = {
	all: ["architecture-model"] as const,
	/**
	 * Every active read resource in one vault, including mutable publication metadata.
	 * @param vault The explicit vault.
	 * @returns Its resource prefix.
	 */
	vault: (vault: string) => ["architecture-model", vault] as const,
	/**
	 * One explicit current or retained reading.
	 * @param vault The explicitly addressed vault.
	 * @param checkpoint The exact identity, or null for current inputs.
	 * @param selection The explicit mutable state and comparison base.
	 * @returns Its query key.
	 */
	reading: (vault: string, checkpoint: string | null, selection: StateSelection = {}) =>
		[
			"architecture-model",
			vault,
			"reading",
			checkpoint,
			...READING_FIELDS.map((field) => selection[field] ?? null),
		] as const,
	/**
	 * Every mutable state and comparison follows completed model edits.
	 * @param vault The explicit vault.
	 * @returns Current-input reading keys, excluding exact checkpoints.
	 */
	mutable: (vault: string) => ["architecture-model", vault, "reading", null] as const,
	/**
	 * The retained metadata in one vault.
	 * @param vault The explicitly addressed vault.
	 * @returns Its query key.
	 */
	checkpoints: (vault: string) => ["architecture-model", vault, "checkpoints"] as const,
	/**
	 * Current ownership remains separate from any historical reading.
	 * @param vault The addressed vault.
	 * @returns Its claim-list query key.
	 */
	claims: (vault: string) => ["architecture-model", vault, "claims"] as const,
};

/**
 * Read a shared architecture contract without discarding structured refusals.
 * @param url The explicitly addressed resource.
 * @param schema Its shared runtime schema.
 * @param signal Cancels an obsolete request.
 * @returns The shared runtime answer.
 */
async function readReply<T>(url: string, schema: ReplySchema<T>, signal?: AbortSignal): Promise<T> {
	const result = await strictReply<T, T | Error>(
		url,
		signal === undefined ? {} : { signal },
		schema,
		schema,
		(error) =>
			error instanceof Error && "code" in error
				? error
				: new Error(
						"The architecture could not be read. Retry when the local server is available.",
					),
	);
	if (result instanceof Error) throw result;
	return result;
}

/**
 * Read only the explicitly selected inputs.
 * @param vault The addressed vault.
 * @param checkpoint The exact identity, or null for current inputs.
 * @param signal Cancels an obsolete request.
 * @param selection The explicit state and comparison selectors.
 * @returns The shared runtime reading.
 */
async function readModel(
	vault: string,
	checkpoint: string | null,
	signal: AbortSignal,
	selection: StateSelection,
): Promise<Extract<ArchitectureModelRead, { success: true }>> {
	const parameters = new URLSearchParams(
		Object.entries({ checkpoint, ...selection }).flatMap(([key, value]) =>
			typeof value === "string" || typeof value === "boolean" || typeof value === "number"
				? [[key, String(value)]]
				: [],
		),
	);
	const url = `${inVault("/api/architecture/model", vault)}&${parameters}`;
	const result = await readReply(url, ArchitectureModelReadSchema, signal);
	if (!result.success) throw new ArchitectureReadError(result);
	return result;
}

/**
 * A model has one server snapshot, shared by every reader of its vault.
 * Reads refresh on selection, mounting, focus, model events, or an explicit refresh.
 * Query cancellation discards obsolete reads. A failed refresh keeps the last coherent data.
 * @param vault The addressed vault.
 * @param checkpoint The exact identity, or null for current inputs.
 * @param selection The explicit mutable state and comparison base.
 * @returns Query options for the shared model result.
 */
function architectureModelQuery(
	vault: string,
	checkpoint: string | null = null,
	selection: StateSelection = {},
) {
	return queryOptions({
		queryKey: architectureModelKeys.reading(vault, checkpoint, selection),
		/**
		 * Read the addressed model through the shared transport.
		 * @param context The query cancellation signal.
		 * @returns The runtime answer.
		 */
		queryFn: (context) => readModel(vault, checkpoint, context.signal, selection),
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
 * Read current subject ownership independently of architecture content.
 * @param vault The addressed vault.
 * @returns The shared claim outcome.
 */
function architectureClaimsQuery(vault: string) {
	return queryOptions({
		queryKey: architectureModelKeys.claims(vault),
		/**
		 * Read the current claim list.
		 * @param context The query cancellation signal.
		 * @returns The shared ownership result.
		 */
		queryFn: (context) =>
			readReply(
				inVault("/api/architecture/claims", vault),
				ArchitectureClaimListSchema,
				context.signal,
			),
		staleTime: 0,
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
 * @param error The structured read failure.
 * @returns True when the existing empty-board surface remains appropriate.
 */
function hasNoCanonicalModel(error: Error | null): boolean {
	return (
		error instanceof ArchitectureReadError &&
		(error.failure.code === "LEGACY_AUTHORITY" || error.failure.code === "MODEL_NOT_FOUND")
	);
}

export {
	readReply,
	readModel,
	architectureModelKeys,
	architectureModelQuery,
	architectureCheckpointsQuery,
	architectureClaimsQuery,
	ArchitectureReadError,
	hasNoCanonicalModel,
	hasNoCheckpoints,
};
