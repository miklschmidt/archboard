import type { CodexRealtimeAdapterOptions } from "./contract.js";
import type { ActiveRealtimeSession } from "./state.js";

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
	const current = () => !stopped && isCurrent();
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
				const threadId = session.binding.coordinatorThreadId;
				try {
					await options.session.threadInjectItems({
						threadId,
						items: [
							{ type: "message", role: "developer", content: [{ type: "input_text", text }] },
						],
					});
				} catch {
					if (current())
						onError(
							"The coordinator board catalogue update was not confirmed. Read the catalogue again before relying on it.",
						);
				}
				if (!current()) return;
				try {
					await options.session.realtimeAppendText({ threadId, role: "developer", text });
				} catch {
					if (current())
						onError(
							"The voice board catalogue update was not confirmed. Ask the coordinator to list boards again.",
						);
				}
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
