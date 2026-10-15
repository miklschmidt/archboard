import type { SettledChangeSource } from "@/runtime/codex-semantic-context";
import { semanticChangeFeed } from "@/server/archboard/lib/semantic-change-feed";

/**
 * The changes one tab session of the Codex workbench hears: those of the vaults its panes are in.
 * A tab can show boards of several vaults, and a change to a board of a vault it shows none of
 * is not its news, even when that board goes by the same name.
 * @param shows Whether a change to a board of a vault is the tab session's news, asked at each change.
 * @returns The feed.
 */
function workbenchFeedFor(shows: (vault: string) => boolean): SettledChangeSource {
	return {
		/**
		 * Hear each settled change to a board of a vault the tab session's panes are in.
		 * @param listener What to tell.
		 * @returns Stops listening.
		 */
		onChange: (listener) =>
			semanticChangeFeed.onChange((event) => {
				if (shows(event.vault)) {
					listener(event);
				}
			}),
	};
}

export { workbenchFeedFor };
