import { hashKey, type Query, type QueryClient } from "@tanstack/react-query";
import {
	ArchitectureEventSchema,
	type ArchitectureEvent,
	type ArchitectureModelRead,
} from "@archboard/board/model";
import { inVault } from "@archboard/server-requests";
import {
	ArchitectureReadError,
	architectureModelKeys,
} from "#ui/clients/architecture-model/queries.ts";

interface FeedState {
	connection: "connecting" | "live" | "unavailable";
	failure: Extract<ArchitectureModelRead, { success: false }> | null;
	refreshing: boolean;
}

/** One event connection per vault and query cache, shared by panes. */
const feeds = new WeakMap<QueryClient, Map<string, ReturnType<typeof createFeed>>>();

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
	let feed = byVault.get(vault);
	if (feed === undefined) {
		feed = createFeed(client, vault);
		byVault.set(vault, feed);
	}
	return feed;
}

/**
 * Own transport availability separately from the cached architecture.
 * @param client The sole content cache.
 * @param vault The event stream's vault.
 * @returns A shared external store that closes its connection when nobody reads it.
 */
function createFeed(client: QueryClient, vault: string) {
	const listeners = new Set<() => void>();
	let state: FeedState = { connection: "connecting", failure: null, refreshing: false };
	let source: EventSource | null = null;
	let generation = 0;
	let claimsGeneration = 0;
	const currentKey = architectureModelKeys.reading(vault, null);
	const currentHash = hashKey(currentKey);
	const claimsKey = architectureModelKeys.claims(vault);
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
		if (source !== null && accepted === claimsGeneration) client.setQueryData(claimsKey, claims);
	}
	/**
	 * An asynchronous completion belongs only to its still-open generation.
	 * @param accepted The generation that began this read.
	 * @returns Whether it still owns the current-reading update.
	 */
	function isCurrent(accepted: number): boolean {
		return source !== null && accepted === generation;
	}
	/**
	 * Apply a fresh snapshot or request a coherent read after a change.
	 * @param event The ordered model event.
	 */
	async function receiveModel(
		event: Exclude<ArchitectureEvent, { type: "architecture_claims" }>,
	): Promise<void> {
		const accepted = ++generation;
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
		const snapshot = coherentSnapshot(event);
		if (snapshot !== null) {
			client.setQueryData(currentKey, snapshot);
			await client.invalidateQueries({
				...changingReadings,
				/**
				 * The snapshot replaces only the default current read; other states need their own result.
				 * @param query A cached mutable reading.
				 * @returns Whether its selected state or comparison requires a fresh read.
				 */
				predicate: (query) => query.queryHash !== currentHash && changingReadings.predicate(query),
			});
		} else {
			await client.invalidateQueries(changingReadings);
		}
		if (!isCurrent(accepted)) return;
		await resumeInterruptedHistory(client, vault, event);
		if (isCurrent(accepted)) publish({ ...state, refreshing: false });
	}
	/**
	 * Route a validated event to its existing query owner.
	 * @param event One event from the addressed vault.
	 */
	function receive(event: ArchitectureEvent): void {
		if (event.vault !== vault) return;
		if (event.type === "architecture_claims") {
			void receiveClaims(event.claims).catch(unavailable);
			return;
		}
		if (event.type === "architecture_snapshot") void receiveClaims(event.claims).catch(unavailable);
		publish({ connection: "live", failure: failureOf(event), refreshing: true });
		void receiveModel(event).catch(unavailable);
		if (event.type === "architecture_changed" && event.reason === "completed") {
			void client.invalidateQueries({ queryKey: architectureModelKeys.checkpoints(vault) });
		}
	}
	/**
	 * Decode the shared event contract at the network boundary.
	 * @param message The SSE message.
	 */
	function handleMessage(message: MessageEvent<string>): void {
		try {
			const parsed = ArchitectureEventSchema.safeParse(JSON.parse(message.data));
			if (parsed.success) receive(parsed.data);
			else unavailable();
		} catch {
			unavailable();
		}
	}
	/**
	 * Subscribe to one shared stream and close it after the last reader leaves.
	 * @param listener A reader of transport availability.
	 * @returns Its unsubscribe operation.
	 */
	function subscribe(listener: () => void): () => void {
		listeners.add(listener);
		if (source === null) {
			state = { connection: "connecting", failure: null, refreshing: false };
			source = new EventSource(inVault("/api/architecture/events", vault));
			source.addEventListener("message", handleMessage);
			source.addEventListener("error", unavailable);
		}
		return () => {
			listeners.delete(listener);
			if (listeners.size > 0) return;
			source?.close();
			source = null;
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
 * Only a successful full snapshot can replace the default current query.
 * @param event The addressed architecture event.
 * @returns Its coherent model, or no replacement content.
 */
function coherentSnapshot(event: ArchitectureEvent) {
	return event.type === "architecture_snapshot" && event.reading.success ? event.reading : null;
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
	const reading = client.getQueryData<Extract<ArchitectureModelRead, { success: true }>>(
		query.queryKey,
	);
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
	event: Exclude<ArchitectureEvent, { type: "architecture_claims" }>,
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
function failureOf(
	event: Exclude<ArchitectureEvent, { type: "architecture_claims" }>,
): FeedState["failure"] {
	if (event.type === "architecture_status") return event.reading;
	if (event.type === "architecture_snapshot" && !event.reading.success) return event.reading;
	return null;
}

export { architectureFeed };
