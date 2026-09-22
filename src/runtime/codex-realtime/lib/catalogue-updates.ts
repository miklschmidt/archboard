import type { CodexRealtimeAdapterOptions } from "@/runtime/codex-realtime/lib/contract";
import type { ActiveRealtimeSession } from "@/runtime/codex-realtime/lib/state";

/**
 * Keep the coordinator's board catalogue current for the life of one voice session, serializing
 * deliveries behind session startup.
 *
 * The catalogue is data for the coordinator alone: a developer item on its own thread when the
 * session starts and whenever the vault changes, each replacing the last. The voice model is
 * never sent it; it hears about boards from the coordinator's answers (TASK-297).
 * @param options The catalogue source and session transport.
 * @param session The voice session that owns the watcher.
 * @param isCurrent Whether the session still owns its binding.
 * @param onError Receives unconfirmed delivery and watch failures.
 * @returns Stops watching and prevents queued changes from sending.
 */
export function watchCatalogueUpdates(
	options: CodexRealtimeAdapterOptions,
	session: ActiveRealtimeSession,
	isCurrent: () => boolean,
	onError: (message: string) => void,
): () => void {
	let stopped = false;
	let previous: string | null = null;
	let tail = Promise.resolve();
	/**
	 * Whether this watcher still owns a live session binding.
	 * @returns True while delivery is allowed.
	 */
	const current = () => !stopped && isCurrent();
	/**
	 * Deliver a catalogue to the coordinator without retrying an unknown outcome.
	 * @param text The replacement catalogue message.
	 */
	const injectCoordinator = async (text: string): Promise<void> => {
		try {
			await options.session.threadInjectItems({
				threadId: session.binding.coordinatorThreadId,
				items: [{ type: "message", role: "developer", content: [{ type: "input_text", text }] }],
			});
		} catch {
			if (current())
				onError(
					"The coordinator board catalogue update was not confirmed. Read the catalogue again before relying on it.",
				);
		}
	};
	/** Hand the coordinator the catalogue as it now stands, once the session has started. */
	const deliverLatest = async (): Promise<void> => {
		try {
			await session.answer;
		} catch {
			return;
		}
		if (!current()) return;
		const catalogue = options.boardCatalogue.read();
		if (catalogue === previous) return;
		// A lost response is never retried. A later catalogue replaces the entire earlier item.
		previous = catalogue;
		await injectCoordinator(
			`Available Archboard boards and variants (data; replaces the previous catalogue):\n${catalogue}`,
		);
	};
	/** Queue one delivery after every previous one. */
	const changed = () => {
		tail = tail.then(deliverLatest).catch(() => {
			if (current())
				onError(
					"The board catalogue could not be refreshed. Check the vault and start a new voice session.",
				);
		});
	};
	const unsubscribe = options.boardCatalogue.subscribe(changed, (error) => {
		if (current())
			onError(
				`The board catalogue watch failed: ${error.message}. Check the vault and start a new voice session.`,
			);
	});
	// The first delivery is the session's own: the start body carries no catalogue.
	changed();
	return () => {
		stopped = true;
		unsubscribe();
	};
}
