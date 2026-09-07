import type { CodexRealtimeAdapterOptions } from "@/runtime/codex-realtime/lib/contract";
import type { ActiveRealtimeSession } from "@/runtime/codex-realtime/lib/state";

/**
 * Keep the coordinator and voice catalogue current, serializing changes behind session startup.
 * @param options The catalogue source and session transport.
 * @param session The voice session that owns the watcher.
 * @param initial The catalogue included at startup.
 * @param isCurrent Whether the session still owns its binding.
 * @param onError Receives unconfirmed delivery and watch failures.
 * @returns Stops watching and prevents queued changes from sending.
 */
export function watchCatalogueUpdates(
	options: CodexRealtimeAdapterOptions,
	session: ActiveRealtimeSession,
	initial: string,
	isCurrent: () => boolean,
	onError: (message: string) => void,
): () => void {
	let stopped = false;
	let previous = initial;
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
	/**
	 * Deliver the same catalogue to voice after the coordinator attempt settles.
	 * @param text The replacement catalogue message.
	 */
	const appendVoice = async (text: string): Promise<void> => {
		try {
			await options.session.realtimeAppendText({
				threadId: session.binding.coordinatorThreadId,
				role: "developer",
				text,
			});
		} catch {
			if (current())
				onError(
					"The voice board catalogue update was not confirmed. Ask the coordinator to list boards again.",
				);
		}
	};
	/** Queue one invalidation after every previous catalogue delivery. */
	const changed = () => {
		tail = tail
			.then(async () => {
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
				const text = `Available Archboard boards and variants (data; replaces the previous catalogue):\n${catalogue}`;
				await injectCoordinator(text);
				if (!current()) return;
				await appendVoice(text);
				return;
			})
			.catch(() => {
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
	// Covers changes between the start snapshot and installing the watcher.
	changed();
	return () => {
		stopped = true;
		unsubscribe();
	};
}
