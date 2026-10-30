import type { ModelAddress } from "#ui/rules/board-routing/address.ts";
import { queryOptions, skipToken } from "@tanstack/react-query";
import type { z } from "zod";
import {
	ArchitectureModelReadSchema,
	ArchitectureCheckpointRowsSchema,
	ArchitectureClaimListSchema,
	ModuleNavigationReadSchema,
	type ArchitectureEvent,
	type ArchitectureModelRead,
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
	readonly reference?: number;
};

type CheckpointRows = z.infer<typeof ArchitectureCheckpointRowsSchema>;
type ArchitectureSummary = Extract<ArchitectureEvent, { type: "architecture_snapshot" }>["reading"];

/** What a repository row knows of a vault, as the feed last reported it. */
interface ModelSummary {
	readonly manifest?: Extract<ArchitectureSummary, { success: true }>["manifest"] | undefined;
	readonly failure: Extract<ArchitectureSummary, { success: false }> | null;
}

/** A selected module and the reading its details belong to. */
interface ModuleTarget {
	readonly module: string;
	readonly state: string | undefined;
	readonly checkpoint: string | undefined;
	readonly preview: string | undefined;
	readonly code: boolean;
}

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

/** A followed resource stays fresh until its feed or a person marks it stale. */
const followed = { staleTime: Number.POSITIVE_INFINITY } as const;
/** A resource without a feed is read again whenever it is shown. */
const shownFresh = {
	staleTime: 0,
	refetchOnMount: "always",
	refetchOnWindowFocus: "always",
	refetchOnReconnect: "always",
} as const;

const READING_FIELDS = [
	"preview",
	"bookmark",
	"legacyAddress",
	"state",
	"against",
	"compare",
	"module",
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
	 * Every reading in the vault, including retained content with a live comparison.
	 * @param vault The explicit vault.
	 * @returns Reading keys without claims or checkpoint catalogue metadata.
	 */
	readings: (vault: string) => ["architecture-model", vault, "reading"] as const,
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
	/**
	 * What a repository row shows, which only the feed writes.
	 * @param vault The addressed vault.
	 * @returns Its summary query key.
	 */
	summary: (vault: string) => ["architecture-model", vault, "summary"] as const,
	/**
	 * One selected module's details within one exact revision.
	 * @param vault The addressed vault.
	 * @param target The module and its reading.
	 * @param digest The revision on screen.
	 * @returns Its query key.
	 */
	module: (vault: string, target: ModuleTarget, digest: string) =>
		["architecture-model", vault, "module", target, digest] as const,
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
 * The feed reports each change of a followed vault, so a reading stays fresh until a model event
 * or an explicit refresh marks it stale. A preview has no feed and refreshes when it is shown.
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
		...(selection.preview == null ? followed : shownFresh),
		retry: false,
	});
}

/**
 * A repository row reads no model: the feed writes this entry and nothing fetches it.
 * @param vault The addressed vault.
 * @returns Query options for the shared summary.
 */
function architectureSummaryQuery(vault: string) {
	return queryOptions<ModelSummary>({
		queryKey: architectureModelKeys.summary(vault),
		queryFn: skipToken,
	});
}

/**
 * One selected module's source target and references, read again when the source can have moved.
 * @param vault The addressed vault.
 * @param target The module and its reading.
 * @param digest The revision on screen.
 * @returns Query options for the module's details.
 */
function architectureModuleQuery(vault: string, target: ModuleTarget, digest: string) {
	return queryOptions({
		queryKey: architectureModelKeys.module(vault, target, digest),
		/**
		 * Read the details of this module alone.
		 * @param context The query cancellation signal.
		 * @returns The details and the reading they belong to.
		 */
		queryFn: async (context) => {
			const parameters = new URLSearchParams(
				Object.entries(target).flatMap(([key, value]) =>
					value === undefined ? [] : [[key, String(value)]],
				),
			);
			const result = await readReply(
				`${inVault("/api/architecture/module", vault)}&${parameters}`,
				ModuleNavigationReadSchema,
				context.signal,
			);
			if (!result.success) throw new ArchitectureReadError(result);
			return result;
		},
		retry: false,
	});
}

/**
 * Nothing reads retained rows until a person opens a menu. From then on completions keep them fresh.
 * @param vault The addressed vault.
 * @returns Query options for the checkpoint rows.
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
				inVault("/api/architecture/checkpoints/rows", vault),
				ArchitectureCheckpointRowsSchema,
				context.signal,
			),
		/**
		 * Only an explicit first read starts this resource.
		 * @param query The cached rows.
		 * @returns Whether a person asked for them before.
		 */
		enabled: (query) => query.state.data !== undefined,
		...followed,
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
		...followed,
		retry: false,
	});
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
	architectureModuleQuery,
	architectureSummaryQuery,
	architectureCheckpointsQuery,
	architectureClaimsQuery,
	ArchitectureReadError,
	hasNoCanonicalModel,
	type CheckpointRows,
	type ModelSummary,
};
