import type { Query, QueryClient } from "@tanstack/react-query";
import type { ArchitectureEvent, ArchitectureModelRead } from "@archboard/model/contract";
import { createFeedSocket } from "#ui/clients/architecture-model/feed-socket.ts";
import {
	ArchitectureReadError,
	architectureModelKeys,
	type ModelSummary,
} from "#ui/clients/architecture-model/queries.ts";
import { semanticBoardKeys } from "#ui/clients/canvas/reads/read-keys.ts";

type CurrentReading = Extract<ArchitectureModelRead, { success: true }>;
type ModelEvent = Exclude<ArchitectureEvent, { type: "architecture_claims" }>;

interface FeedState {
	connection: "connecting" | "live" | "unavailable";
	failure: Extract<ArchitectureModelRead, { success: false }> | null;
}

/** One feed per vault and query cache, shared by panes. */
const feeds = new WeakMap<QueryClient, Map<string, ReturnType<typeof createFeed>>>();
/** One event connection per query cache, shared by every vault it reads. */
const sockets = new WeakMap<QueryClient, ReturnType<typeof createFeedSocket>>();

/**
 * Find the live update owner without creating another architecture cache.
 * @param client The shared query cache.
 * @param vault The explicitly addressed vault.
 * @returns Connection state and subscription lifetime.
 */
function architectureFeed(client: QueryClient, vault: string) {
	let byVault = feeds.get(client);
	if (byVault === undefined) {
		byVault = new Map();
		feeds.set(client, byVault);
	}
	let socket = sockets.get(client);
	if (socket === undefined) {
		socket = createFeedSocket();
		sockets.set(client, socket);
	}
	let feed = byVault.get(vault);
	if (feed === undefined) {
		feed = createFeed(client, vault, socket);
		byVault.set(vault, feed);
	}
	return feed;
}

/**
 * Own transport availability separately from the cached architecture.
 * @param client The sole content cache.
 * @param vault The event stream's vault.
 * @param socket The connection of this query cache.
 * @returns A shared external store that stops following its vault when nobody reads it.
 */
function createFeed(
	client: QueryClient,
	vault: string,
	socket: ReturnType<typeof createFeedSocket>,
) {
	const listeners = new Set<() => void>();
	let state: FeedState = { connection: "connecting", failure: null };
	let stopFollowing: (() => void) | null = null;
	let generation = 0;
	let claimsGeneration = 0;
	/** The revision this tab last heard, so a returning socket reads only after a real change. */
	let heard: string | undefined;
	const currentKey = architectureModelKeys.reading(vault, null);
	const claimsKey = architectureModelKeys.claims(vault);
	const summaryKey = architectureModelKeys.summary(vault);
	/**
	 * Publish transport state, without copying any model content.
	 * @param next The new state.
	 */
	function publish(next: FeedState): void {
		state = next;
		for (const listener of listeners) listener();
	}
	/** Mark cached current content unavailable until a fresh snapshot arrives. */
	function unavailable(): void {
		client.setQueryData<ModelSummary>(summaryKey, (known) => known ?? { failure: null });
		publish({ ...state, connection: "unavailable" });
	}
	/**
	 * Replace ownership only after older reads can no longer land.
	 * @param claims The latest claim outcome from this ordered stream.
	 */
	async function receiveClaims(
		claims: Extract<ArchitectureEvent, { type: "architecture_claims" }>["claims"],
	): Promise<void> {
		const accepted = ++claimsGeneration;
		await client.cancelQueries({ queryKey: claimsKey, exact: true });
		if (stopFollowing !== null && accepted === claimsGeneration)
			client.setQueryData(claimsKey, claims);
	}
	/**
	 * An asynchronous completion belongs only to its still-open generation.
	 * @param accepted The generation that began this read.
	 * @returns Whether it still owns the current-reading update.
	 */
	function isCurrent(accepted: number): boolean {
		return stopFollowing !== null && accepted === generation;
	}
	/**
	 * Whether a snapshot names another revision than this tab holds or is reading now.
	 * @param digest The snapshot's revision.
	 * @returns True when a cached reading is older than the snapshot.
	 */
	async function movedPast(digest: string): Promise<boolean> {
		const reading = client.getQueryCache().find({ queryKey: currentKey, exact: true });
		await reading?.promise?.catch(() => undefined);
		const held = client.getQueryData<CurrentReading>(currentKey)?.revision.digest;
		const known = heard ?? held;
		return known !== undefined && known !== digest;
	}
	/**
	 * Whether an event can change what this tab holds. A snapshot only reports a revision.
	 * @param event The ordered model event.
	 * @returns True when readings need a fresh read.
	 */
	async function changesReadings(event: ModelEvent): Promise<boolean> {
		if (event.type !== "architecture_snapshot" || !event.reading.success) return true;
		return movedPast(event.reading.digest);
	}
	/**
	 * Request a coherent read of everything this change can reach.
	 * @param event The ordered model event.
	 * @param accepted The generation of this event.
	 */
	async function refreshReadings(event: ModelEvent, accepted: number): Promise<void> {
		if (!isCurrent(accepted)) return;
		const changingReadings = {
			queryKey: architectureModelKeys.readings(vault),
			/**
			 * Preserve healthy retained reads until live inputs are coherent again.
			 * @param query A reading owned by this vault.
			 * @returns Whether this event can refresh its complete response.
			 */
			predicate: (query: Query) => followsChanges(client, query, failureOf(event) === null),
		};
		await client.cancelQueries(changingReadings);
		if (!isCurrent(accepted)) return;
		await Promise.all([
			client.invalidateQueries(changingReadings),
			client.invalidateQueries({ queryKey: architectureModelKeys.modules(vault) }),
			client.invalidateQueries({ queryKey: semanticBoardKeys.vaultCheck(vault) }),
		]);
	}
	/**
	 * Update the repository row, then read only when the revision moved.
	 * @param event The ordered model event.
	 */
	async function receiveModel(event: ModelEvent): Promise<void> {
		const accepted = ++generation;
		client.setQueryData<ModelSummary>(summaryKey, (known) => summaryAfter(event, known));
		const moved = await changesReadings(event);
		if (isCurrent(accepted)) heard = revisionOf(event) ?? heard;
		if (moved) await refreshReadings(event, accepted);
		if (!isCurrent(accepted)) return;
		await resumeInterruptedHistory(client, vault, event);
	}
	/**
	 * Route a validated event to its existing query owner.
	 * @param event One event from the addressed vault.
	 */
	function receive(event: ArchitectureEvent): void {
		if (event.type === "architecture_claims") {
			void receiveClaims(event.claims).catch(unavailable);
			return;
		}
		if (event.type === "architecture_snapshot") void receiveClaims(event.claims).catch(unavailable);
		publish({ connection: "live", failure: failureOf(event) });
		void receiveModel(event).catch(unavailable);
		if (event.type === "architecture_changed" && event.reason === "completed") {
			void client.invalidateQueries({ queryKey: architectureModelKeys.checkpoints(vault) });
		}
	}
	/**
	 * Subscribe to one shared stream and close it after the last reader leaves.
	 * @param listener A reader of transport availability.
	 * @returns Its unsubscribe operation.
	 */
	function subscribe(listener: () => void): () => void {
		listeners.add(listener);
		if (stopFollowing === null) {
			state = { connection: "connecting", failure: null };
			stopFollowing = socket.follow(vault, { event: receive, lost: unavailable });
		}
		return () => {
			listeners.delete(listener);
			if (listeners.size > 0) return;
			stopFollowing?.();
			stopFollowing = null;
			generation++;
			claimsGeneration++;
		};
	}
	return {
		subscribe,
		/**
		 * Read the stable availability snapshot.
		 * @returns The last transport state.
		 */
		getSnapshot: (): FeedState => state,
	};
}

/**
 * The revision that an event reports, when it reports a coherent one.
 * @param event The addressed architecture event.
 * @returns Its digest, or null for a refusal.
 */
function revisionOf(event: ModelEvent) {
	if (event.type === "architecture_changed") return event.revision.digest;
	return event.type === "architecture_snapshot" && event.reading.success
		? event.reading.digest
		: null;
}

/**
 * What a repository row holds after an event.
 * @param event The addressed architecture event.
 * @param known What it held before.
 * @returns Its identity and any refusal.
 */
function summaryAfter(event: ModelEvent, known: ModelSummary | undefined): ModelSummary {
	if (event.type === "architecture_changed")
		return { manifest: { id: event.model, name: event.name }, failure: null };
	if (!event.reading.success) return { manifest: known?.manifest, failure: event.reading };
	return { manifest: event.reading.manifest, failure: null };
}

/**
 * Exact selected inputs still need fresh metadata when their comparison base is mutable.
 * @param client The owner of the typed model reading cache.
 * @param query A reading from this vault's typed query family.
 * @param coherent Whether the event permits a fresh comparison against live inputs.
 * @returns Whether a model event can change its complete response.
 */
function followsChanges(client: QueryClient, query: Query, coherent: boolean): boolean {
	if (query.queryKey[3] === null) return true;
	if (!coherent) return false;
	const reading = client.getQueryData<CurrentReading>(query.queryKey);
	const comparison = reading?.comparison;
	return (
		comparison !== undefined && comparison.against !== null && comparison.checkpoint === undefined
	);
}

/**
 * A completed write releases the read barrier for interrupted exact history.
 * @param client The existing query cache.
 * @param vault The vault that now reports coherent architecture.
 * @param event The current model availability.
 * @returns After active interrupted reads retry their original selectors.
 */
async function resumeInterruptedHistory(
	client: QueryClient,
	vault: string,
	event: ModelEvent,
): Promise<void> {
	if (failureOf(event) !== null) return;
	const interrupted = client
		.getQueryCache()
		.findAll({ queryKey: architectureModelKeys.vault(vault) })
		.filter((query) => {
			if (query.queryKey[2] !== "reading" || query.queryKey[3] === null) return false;
			const error = query.state.error;
			const blocked =
				error instanceof ArchitectureReadError &&
				(error.failure.code === "MODEL_BUSY" || error.failure.code === "RECOVERY_REQUIRED");
			return blocked || query.state.fetchStatus === "fetching";
		});
	if (interrupted.length === 0) return;
	const keys = new Set(interrupted.map((query) => query.queryHash));
	const filter = {
		/**
		 * Keep the same interrupted query set after cancellation resets its status.
		 * @param query A cached reading.
		 * @returns Whether this completion resumes it.
		 */
		predicate: (query: (typeof interrupted)[number]) => keys.has(query.queryHash),
	};
	await client.cancelQueries(filter);
	await client.invalidateQueries(filter);
}

/**
 * Extract availability failures without mistaking an external edit for adoption.
 * @param event The shared current-reading event.
 * @returns Its refusal, if any.
 */
function failureOf(event: ModelEvent): FeedState["failure"] {
	if (event.type === "architecture_status") return event.reading;
	if (event.type === "architecture_snapshot" && !event.reading.success) return event.reading;
	return null;
}

export { architectureFeed, type FeedState as ArchitectureFeed };
