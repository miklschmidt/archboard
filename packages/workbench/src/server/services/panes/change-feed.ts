// Every settled change to a board, as one stream.
//
// A semantic write is already settled when it is announced: it was validated,
// version-checked, committed atomically and only then broadcast (ADR 0023), so
// there is no settle delay to wait out and no partial state to coalesce. That
// makes this a thin reading of what the panes are told rather than a second
// account of what changed — the pane and the agent's context can never
// disagree, because both come off the same announcement.
//
// What it exists for is the agent's context: a thread that was told about a
// board needs to know when what it was told stopped being true, and a cursor
// it can say it has read up to.

import { mintId } from "@archboard/board/ids";
import { watchArchitectureModel } from "@archboard/board/store-read";
import type { ArchitectureEvent } from "@archboard/board/model";
import type { SettledChangeSourceEvent } from "#runtime/schemas/semantic-context-types.ts";
/** One settled change, as a context consumer reads it. */
interface SettledBoardChange extends SettledChangeSourceEvent {
	readonly by: string | null;
	readonly doing: string | null;
}

/** Hears settled changes until the returned function is called. */
type SettledChangeListener = (event: SettledBoardChange) => void;

/**
 * This process's feed of settled board changes.
 *
 * The id is minted per process: a cursor is only meaningful against the feed
 * that issued it, and a server that restarted has not got the same one.
 */
const feedId = mintId();

const listeners = new Set<SettledChangeListener>();
let cursor = 0;

const watched = new Map<string, () => void>();
/**
 * Publish one durable canonical change through the existing agent feed.
 * @param message The shared runtime event.
 */
function changed(message: ArchitectureEvent): void {
	if (message.type !== "architecture_changed") return;
	cursor += 1;
	const request = message.operation?.checkpoint.request;
	const event: SettledBoardChange = {
		cursor,
		vault: message.vault,
		board: `model:${message.model}`,
		at: new Date().toISOString(),
		significance: "structural",
		text: `Architecture ${message.model} changed at revision ${message.revision.digest}`,
		...(request === undefined
			? { origin: "external", by: null, doing: null }
			: { origin: "agent", by: request.writer, doing: request.doing }),
	};
	for (const listener of listeners) listener(event);
}
/**
 * Follow canonical authority once for every vault that an agent reads.
 * @param vault The explicit vault.
 */
function follow(vault: string): void {
	if (watched.has(vault)) return;
	watched.set(vault, watchArchitectureModel(vault, changed));
}

/** The one settled-change source the agent's context reads. */
const semanticChangeFeed = {
	follow,
	feedId,
	/**
	 * Hear every settled change.
	 * @param listener What to tell.
	 * @returns Stops listening.
	 */
	onChange: (listener: SettledChangeListener): (() => void) => {
		listeners.add(listener);
		return (): void => {
			listeners.delete(listener);
		};
	},
	/**
	 * Where the feed stands.
	 * @returns Its id and the cursor of the last change it issued.
	 */
	status: (): { feedId: string; cursor: number } => ({ feedId, cursor }),
	/** Forget every listener, because the server is stopping. */
	dispose: (): void => {
		listeners.clear();
		for (const stop of watched.values()) stop();
		watched.clear();
	},
};

export { semanticChangeFeed, type SettledBoardChange, type SettledChangeListener };
