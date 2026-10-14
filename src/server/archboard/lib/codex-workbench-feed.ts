import { semanticChangeFeed } from "@/server/archboard/lib/semantic-change-feed";
import { serverVault } from "@/server/archboard/lib/server-vault";

/**
 * The changes the Codex workbench hears: those of the vault it works in. One
 * workbench serves the vault the server started with until each checkout has a
 * workhorse of its own, so a change to a board of another vault is not its news,
 * even when that board goes by the same name.
 */
const workbenchFeed = {
	/**
	 * Hear every settled change to a board of the workbench's vault.
	 * @param listener What to tell.
	 * @returns Stops listening.
	 */
	onChange: (listener: Parameters<typeof semanticChangeFeed.onChange>[0]): (() => void) =>
		semanticChangeFeed.onChange((event) => {
			if (event.vault === serverVault()) {
				listener(event);
			}
		}),
};

export { workbenchFeed };
