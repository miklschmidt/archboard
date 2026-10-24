import { readBoardCatalogue, watchBoardCatalogue } from "@archboard/board/store-read";
import type { WorkbenchContextSource } from "#runtime/protocol/host/context-source.ts";

// Follow the vault a tab presents. The reusable watcher receives complete formatted snapshots.
/**
 * Follow the presenting vault and publish complete formatted catalogue replacements.
 * @param input The captured input and its operation identity.
 * @param input.vault The vault value.
 * @param input.subscribe The subscribe value.
 * @returns The formatted catalogue source and its watcher.
 */
function createArchboardCoordinatorContextSource(input: {
	readonly vault: () => string | null;
	readonly subscribe: (listener: () => void) => () => void;
}): WorkbenchContextSource {
	return Object.freeze({
		/**
		 * Read the current complete Archboard catalogue as coordinator context.
		 * @returns The complete formatted catalogue snapshot.
		 */
		read: () =>
			`Available Archboard boards and variants (data; replaces the previous catalogue):\n${readBoardCatalogue(input.vault())}`,
		/**
		 * Subscribe to host context changes and return the subscription cleanup.
		 * @param onChange Receives a complete snapshot invalidation.
		 * @param onError Receives an unconfirmed delivery or source failure.
		 * @returns The cleanup that ends the subscriptions.
		 */
		subscribe: (onChange: () => void, onError: (error: Error) => void) => {
			let watched: string | null = null;
			let unwatch: (() => void) | null = null;
			/**
			 * Replace the filesystem watcher when the presenting vault changes.
			 * @returns Whether the stated condition holds.
			 */
			const follow = (): boolean => {
				const vault = input.vault();
				if (vault === watched) return false;
				unwatch?.();
				watched = vault;
				unwatch = vault === null ? null : watchBoardCatalogue(onChange, onError, vault);
				return true;
			};
			follow();
			let stop: () => void;
			try {
				stop = input.subscribe(() => {
					if (follow()) onChange();
				});
			} catch (error) {
				const cleanup = unwatch as (() => void) | null;
				cleanup?.();
				throw error;
			}
			return () => {
				stop();
				unwatch?.();
			};
		},
	});
}

export { createArchboardCoordinatorContextSource };
