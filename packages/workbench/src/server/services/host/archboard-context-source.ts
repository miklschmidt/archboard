import type { WorkbenchContextSource } from "#runtime/protocol/voice/extension.ts";
import { readArchitectureModel, watchArchitectureModel } from "@archboard/board/store-read";

// Follow the vault a tab presents. The reusable watcher receives complete formatted snapshots.
/**
 * Follow the presenting vault and publish complete formatted catalogue replacements.
 * @param input The captured input and its operation identity.
 * @param input.vault The vault value.
 * @param input.subscribe The subscribe value.
 * @param input.canonical The current canonical pane readings and tab identity.
 * @returns The formatted catalogue source and its watcher.
 */
function createArchboardCoordinatorContextSource(input: {
	readonly vault: () => string | null;
	readonly canonical?: () => unknown;
	readonly subscribe: (listener: () => void) => () => void;
}): WorkbenchContextSource {
	return Object.freeze({
		/**
		 * Read the current complete Archboard catalogue as coordinator context.
		 * @returns The complete formatted catalogue snapshot.
		 */
  read: () => {
   const vault=input.vault();
   const model=vault===null ? null : readArchitectureModel(vault);
   return `Canonical architecture (data; use its actual vault and complete revision):\n${JSON.stringify({vault,reading:model,panes:input.canonical?.() ?? null})}`;
  },
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
				unwatch = vault === null ? null : watchArchitectureModel(vault, () => { try {onChange();} catch (error) {onError(error instanceof Error ? error : new Error(String(error)));} });
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
