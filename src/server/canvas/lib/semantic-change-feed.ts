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

import { mintId } from "@/shared/ids/ids";
import type { WebSocketMessage } from "@/runtime/engine/types";
import { onBoardBroadcast } from "@/server/canvas/lib/pane-registry";

/** One settled change, as a context consumer reads it. */
interface SettledBoardChange {
	/** Monotonic within this feed: what a reader says it has read up to. */
	readonly cursor: number;
	readonly board: string;
	readonly at: string;
	readonly origin: "agent";
	readonly significance: "structural";
	readonly text: string;
	/**
	 * The pane the write said it was for, or null when it named none.
	 *
	 * What a reader uses to tell its own work from somebody else's. Every board
	 * write is an agent's now (ADR 0023), so the role stopped separating them
	 * and only the pane does. Authorship, not custody: the identity a write
	 * holds the board under is one value shared by every write in a claimed
	 * campaign and names no pane, so it answers a different question.
	 *
	 * Null is the ordinary case for a command line, and it means unattributable
	 * — which is delivered to everybody, its own author included. Redundancy
	 * rather than silence.
	 */
	readonly by: string | null;
}

/** Hears settled changes until the returned function is called. */
type SettledChangeListener = (event: SettledBoardChange) => void;

/**
 * This process's feed of settled board changes.
 *
 * The id is minted per process: a cursor is only meaningful against the feed
 * that issued it, and a canvas that restarted has not got the same one.
 */
const feedId = mintId();

const listeners = new Set<SettledChangeListener>();
let cursor = 0;

/**
 * Whether an announcement is a board that has just changed.
 * @param message The broadcast message.
 * @returns True for a settled board change.
 */
function isBoardChange(message: WebSocketMessage): boolean {
	return message.type === "board_note";
}

/** What a settled write announces about itself, beyond the board it changed. */
interface SettledAnnouncement {
	/** The version the board landed at. */
	readonly version: number;
	/** The pane the write said it was for, or null when it named none. */
	readonly by: string | null;
	/** The identity the board was held under: custody, not authorship. */
	readonly heldAs: string;
}

/**
 * The announcement a settled write broadcasts, as this feed reads it.
 *
 * Built here and read here, because the two halves are in different files and
 * agreed on nothing but the spelling of a field: `by` drifted to `paneId` on one
 * side once, and every change arrived unattributable while each half stayed
 * right on its own. A shape with one author cannot drift from itself.
 * @param announcement What the write says about itself.
 * @returns The fields the `board_note` message carries.
 */
function settledChangeFields(announcement: SettledAnnouncement): {
	semantic: true;
	version: number;
	by: string | null;
	heldAs: string;
} {
	return {
		semantic: true,
		version: announcement.version,
		by: announcement.by,
		heldAs: announcement.heldAs,
	};
}

/**
 * The pane a broadcast change says it was written for.
 * @param message The announcement, as it arrived.
 * @returns The pane id, or null when the write named none.
 */
function authorOf(message: WebSocketMessage): string | null {
	return typeof message["by"] === "string" ? message["by"] : null;
}

onBoardBroadcast((message, board) => {
	if (!isBoardChange(message)) {
		return;
	}
	cursor += 1;
	const version = typeof message["version"] === "number" ? message["version"] : null;
	// Absent is a real answer: a change nobody can attribute is delivered to
	// everybody, its own author included, which is redundancy rather than silence.
	const by = authorOf(message);
	const event: SettledBoardChange = {
		cursor,
		board,
		at: new Date().toISOString(),
		// Only an agent writes a board: a person reads one (ADR 0023).
		origin: "agent",
		significance: "structural",
		text: version === null ? `${board} changed` : `${board} is at version ${version}`,
		by,
	};
	for (const listener of listeners) {
		listener(event);
	}
});

/** The one settled-change source the agent's context reads. */
const semanticChangeFeed = {
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
	/** Forget every listener, because the canvas is stopping. */
	dispose: (): void => {
		listeners.clear();
	},
};

export {
	semanticChangeFeed,
	settledChangeFields,
	type SettledAnnouncement,
	type SettledBoardChange,
	type SettledChangeListener,
};
