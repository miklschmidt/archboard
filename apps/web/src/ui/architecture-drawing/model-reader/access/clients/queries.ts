import type { ModelAddress } from "#ui/panes/reading-routing/rules/address.ts";
import { queryOptions, skipToken, type QueryClient } from "@tanstack/react-query";
import {
	type ArchitectureEvent,
	type ArchitectureModelRead,
	readModelReply,
	type ModelReply,
	type ReplyOperation,
} from "@archboard/model-contract";
import { inVault, strictReply } from "@archboard/server-requests";
import {
	architectureHistoryResultSchema,
	type architectureHistoryRequestSchema,
} from "@archboard/code-intel/history";
import type { z } from "zod";

type StateSelection = {
	readonly [Field in "ref" | "state" | "against" | "preview" | "bookmark" | "legacyAddress"]?:
		| ModelAddress[Field]
		| null;
} & {
	readonly compare?: boolean;
	readonly walkthrough?: string;
	readonly shared?: boolean;
	readonly module?: Extract<ArchitectureModelRead, { success: true }>["selectedModule"];
	readonly reference?: number;
};

type CheckpointRows = ModelReply<"listCheckpointRows">;

/** A request of one history analysis, as the route of its name parses its query. */
type HistoryRequest = z.input<ReturnType<typeof architectureHistoryRequestSchema>>;
/** The analyses of the history, each answered by the route of its name. */
type HistoryAnalysis = HistoryRequest["analysis"];
/** What a history route answers, a refusal included. */
type HistoryReply = z.infer<ReturnType<typeof architectureHistoryResultSchema>>;
/** The answer of one analysis. */
type HistoryAnswer<A extends HistoryAnalysis> = Extract<HistoryReply, { analysis: A }>;
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
	readonly ref: string | undefined;
	readonly preview: string | undefined;
	readonly code: boolean;
}

/** Where a removed module was last retained, or null when no reading holds it. */
type RetainedModule = Extract<ModelReply<"readRetainedModule">, { success: true }>["retained"];

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
	"ref",
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
	 * The current reading as the History destination reads it, kept apart from the one that
	 * a live snapshot replaces, because a snapshot lists no states but the proposals.
	 * @param vault The explicit vault.
	 * @returns Its query key, which every change of the model reads again.
	 */
	record: (vault: string) => ["architecture-model", vault, "reading", null, "record"] as const,
	/**
	 * The retained metadata in one vault.
	 * @param vault The explicitly addressed vault.
	 * @returns Its query key.
	 */
	checkpoints: (vault: string) => ["architecture-model", vault, "checkpoints"] as const,
	/**
	 * Where a removed module was last retained.
	 * @param vault The addressed vault.
	 * @param module The removed module.
	 * @returns Its query key.
	 */
	retainedModule: (vault: string, module: string) =>
		["architecture-model", vault, "retained-module", module] as const,
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
	/**
	 * Every module's details in one vault. A correction changes them and keeps the revision.
	 * @param vault The explicit vault.
	 * @returns Their shared prefix.
	 */
	modules: (vault: string) => ["architecture-model", vault, "module"] as const,
};

/**
 * The failure of a read whose reply is no answer: a refusal the transport reports keeps its words,
 * and anything else says that the architecture could not be read.
 * @param error What the transport reported.
 * @returns The failure the read throws.
 */
function unreadable(error?: unknown): Error {
	return error instanceof Error && "code" in error
		? error
		: new Error("The architecture could not be read. Retry when the local server is available.");
}

/**
 * Read a model operation's answer without discarding structured refusals: an answer that came
 * with a success status reads as the operation's answer, and a body that came with an HTTP failure
 * reads only as its refusal.
 * @param url The explicitly addressed resource.
 * @param operation The model operation whose answer it is.
 * @param signal Cancels an obsolete request.
 * @returns The shared runtime answer.
 */
async function readReply<O extends ReplyOperation>(
	url: string,
	operation: O,
	signal?: AbortSignal,
): Promise<ModelReply<O>> {
	const result = await strictReply<ModelReply<O>, ModelReply<O> | Error>(
		url,
		signal === undefined ? {} : { signal },
		{
			/**
			 * Read a body that came with a success status as the operation's answer.
			 * @param body The body as received.
			 * @returns The answer, or why the body is not one.
			 */
			safeParse: (body) => readModelReply(operation, body, "answered"),
		},
		{
			/**
			 * Read a body that came with an HTTP failure only as the operation's refusal.
			 * @param body The body as received.
			 * @returns The refusal, or why the body is not one.
			 */
			safeParse: (body) => readModelReply(operation, body, "failed"),
		},
		unreadable,
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
	const result = await readReply(url, "read", signal);
	if (!result.success) throw new ArchitectureReadError(result);
	// A walkthrough plays the vault on disk, so a branch reading offers none.
	return selection.ref == null ? result : { ...result, walkthroughs: [] };
}

/**
 * A model has one server snapshot, shared by every reader of its vault.
 * The feed reports each change of a followed vault, so a reading stays fresh until a model event
 * or an explicit refresh marks it stale. A preview, a state and a checkpoint can live in history,
 * which has no feed, so they read again when they are shown.
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
		meta: { sourceRef: selection.ref },
		/**
		 * Read the addressed model through the shared transport.
		 * @param context The query cancellation signal.
		 * @returns The runtime answer.
		 */
		queryFn: (context) => readModel(vault, checkpoint, context.signal, selection),
		...(followsFeed(checkpoint, selection) ? followed : shownFresh),
		retry: false,
	});
}

/**
 * Whether a reading follows the live feed: only the current state of the vault on disk does. A
 * checkpoint, a chosen state, a migration preview and a branch reading are each fixed.
 * @param checkpoint The addressed checkpoint, or null.
 * @param selection The addressed state, preview or ref.
 * @returns Whether the reading follows the feed.
 */
function followsFeed(checkpoint: string | null, selection: StateSelection): boolean {
	if (checkpoint !== null) return false;
	return selection.state == null && selection.preview == null && selection.ref == null;
}

/**
 * The complete catalogue of states, read when the History destination opens.
 * @param vault The addressed vault.
 * @returns Query options for the record of the model.
 */
function architectureRecordQuery(vault: string) {
	return queryOptions({
		queryKey: architectureModelKeys.record(vault),
		/**
		 * Read the current model with its whole catalogue of states.
		 * @param context The query cancellation signal.
		 * @returns The runtime answer.
		 */
		queryFn: (context) => readModel(vault, null, context.signal, {}),
		staleTime: 0,
		refetchOnMount: "always",
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
		meta: { sourceRef: target.ref },
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
				"readModule",
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
				"listCheckpointRows",
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
 * Find the newest retained reading of a removed module. History only grows, so a found answer
 * stays true until an explicit refresh.
 * @param vault The addressed vault.
 * @param module The removed module.
 * @returns Query options for its checkpoint and name, or null when no reading holds it.
 */
function retainedModuleQuery(vault: string, module: string) {
	return queryOptions({
		queryKey: architectureModelKeys.retainedModule(vault, module),
		/**
		 * Search the retained history.
		 * @param context The query cancellation signal.
		 * @returns Where the module was last retained.
		 */
		queryFn: async (context) => {
			const url = `${inVault("/api/architecture/retained-module", vault)}&${new URLSearchParams({ module })}`;
			const result = await readReply(url, "readRetainedModule", context.signal);
			if (!result.success) throw new ArchitectureReadError(result);
			return result.retained;
		},
		staleTime: Number.POSITIVE_INFINITY,
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
			readReply(inVault("/api/architecture/claims", vault), "readClaims", context.signal),
		...followed,
		retry: false,
	});
}

/**
 * Whether a history answer is the analysis that was asked for.
 * @param answer The answer.
 * @param analysis The analysis asked for.
 * @returns True when the answer is that analysis.
 */
function answers<A extends HistoryAnalysis>(
	answer: Extract<HistoryReply, { success: true }>,
	analysis: A,
): answer is HistoryAnswer<A> {
	return answer.analysis === analysis;
}

/**
 * Read one analysis of the existing Git history, from the route of its name. A history read walks
 * Git, so its answer is kept until its key moves or a person asks again, a failure waits for a
 * person too, and the read takes no signal: a selection that moves on drops its subscriber before
 * the next one mounts, and letting go must not stop a read that the next one joins.
 * @param vault The explicitly addressed vault.
 * @param request The analysis and its fields, which become the route's query in their order.
 * @param options What the read is after the vault in the cache, and what the reader keeps of the
 *   answer, which runs inside the read so that a throw fails it.
 * @param options.key The query key after the vault's prefix.
 * @param options.accept Checks the answer against what was asked and keeps what the reader needs.
 * @returns One cached history request.
 */
function historyQuery<A extends HistoryAnalysis, const Key extends readonly unknown[], T>(
	vault: string,
	request: Extract<HistoryRequest, { analysis: A }>,
	options: { readonly key: Key; readonly accept: (answer: HistoryAnswer<A>) => T },
) {
	const { analysis, ...fields } = request;
	const parameters = new URLSearchParams(
		Object.entries(fields).flatMap(([field, value]) =>
			value === undefined ? [] : [[field, String(value)]],
		),
	);
	return queryOptions({
		queryKey: vaultQueryKey(vault, ...options.key),
		/**
		 * Read the analysis and keep what the reader accepts of it.
		 * @returns What the reader keeps, or an explicit refusal.
		 */
		queryFn: async () => {
			const result = await strictReply<HistoryReply, HistoryReply | Error>(
				`${inVault(`/api/architecture/${analysis}`, vault)}&${parameters}`,
				{},
				architectureHistoryResultSchema(),
				architectureHistoryResultSchema(),
				unreadable,
			);
			if (result instanceof Error) throw result;
			if (!result.success) throw new ArchitectureReadError(result);
			if (!answers(result, analysis))
				throw new Error("The history response contains another analysis. Retry the read.");
			return options.accept(result);
		},
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
		retryOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});
}

/**
 * The cache key of a read of one vault that the readers of this module do not make, under the
 * vault's prefix so that what invalidates the vault invalidates it.
 * @param vault The explicit vault.
 * @param rest What the read is, after the vault.
 * @returns The query key.
 */
function vaultQueryKey<const Rest extends readonly unknown[]>(vault: string, ...rest: Rest) {
	return [...architectureModelKeys.vault(vault), ...rest] as const;
}

/**
 * Read every resource of one vault again, or of every vault.
 * @param client The tab's query client.
 * @param vault The explicit vault, or none for every vault.
 * @returns When the reads are invalidated.
 */
function invalidateModelQueries(client: QueryClient, vault?: string): Promise<void> {
	return client.invalidateQueries({
		queryKey: vault === undefined ? architectureModelKeys.all : architectureModelKeys.vault(vault),
	});
}

export {
	readModel,
	architectureModelKeys,
	historyQuery,
	invalidateModelQueries,
	vaultQueryKey,
	architectureModelQuery,
	architectureModuleQuery,
	architectureSummaryQuery,
	architectureCheckpointsQuery,
	architectureRecordQuery,
	architectureClaimsQuery,
	retainedModuleQuery,
	ArchitectureReadError,
	type CheckpointRows,
	type ModelSummary,
	type RetainedModule,
};
