// Which boards an agent is editing right now, for every pane at once (ADR 0022).
//
// A claimed board is read-only to people, and an agent may edit any board
// whether or not somebody is looking at it. What every pane owes the person in
// return is real-time visibility: which board an agent holds and what it said
// it is doing, including boards no pane has open. The lock and the `doing`
// line are already broadcast, but board-scoped, so a pane only hears about
// the board it is showing. This is the boardless account of the same two
// facts, kept as one snapshot so the navigator can mark every board at once.
//
// An entry exists while a claim stands, and for ACTIVITY_LINGER_MS after an
// unclaimed agent write, so a lone write is on screen long enough to be seen.
// Human holds are not activity: a person's own hold is what their pane is
// doing, and it is nobody else's business.

import type { DoingEntry } from "@/runtime/engine/board-doing";
import type { LockHolder } from "@/runtime/engine/board-lock";
import { normalizeBoardKey } from "@/runtime/engine/board";
import type { AgentActivity, AgentActivityMessage } from "@/runtime/engine/types";
import { ACTIVITY_LINGER_MS } from "@/shared/timing/timing";

interface Entry {
	board: string;
	claim: LockHolder | null;
	doing: DoingEntry | null;
	linger: ReturnType<typeof setTimeout> | null;
}

interface AgentActivityTracker {
	/** A board's lock announced: a claim taken, changed or gone. Anything else is not activity. */
	lockChanged(board: string, holder: Readonly<LockHolder> | null): void;
	/** An agent's write landed and said what it was doing. */
	doingLanded(board: string, entry: Readonly<DoingEntry>): void;
	/** The whole list, for a client that has just connected. Reference-stable until it changes. */
	snapshot(): AgentActivityMessage;
}

/**
 *
 */
function clearLinger(entry: Entry): void {
	if (entry.linger) {
		clearTimeout(entry.linger);
		entry.linger = null;
	}
}

/**
 *
 */
function createAgentActivity(options: {
	/** Sends the snapshot to every connected client. */
	send: (message: AgentActivityMessage) => void;
	/** The board key as panes know it, for a key the lock module normalized. */
	displayKey: (board: string) => string;
}): AgentActivityTracker {
	const entries = new Map<string, Entry>();
	let current: AgentActivityMessage = { type: "agent_activity", activity: [] };

	/**
	 *
	 */
	const publish = (): void => {
		const activity: AgentActivity[] = [...entries.values()].map(({ board, claim, doing }) => ({
			board,
			claim,
			doing,
		}));
		current = { type: "agent_activity", activity };
		options.send(current);
	};

	// Each write restarts the linger, so continuous unclaimed work is one
	// visit. When it fires under a claim taken meanwhile, the claim keeps the
	// entry and the timer simply ends.
	/**
	 *
	 */
	const lingerThenDrop = (key: string, entry: Entry): void => {
		clearLinger(entry);
		const timer = setTimeout(() => {
			entry.linger = null;
			if (entry.claim || entries.get(key) !== entry) {
				return;
			}
			entries.delete(key);
			publish();
		}, ACTIVITY_LINGER_MS);
		timer.unref?.();
		entry.linger = timer;
	};

	return {
		/**
		 *
		 */
		lockChanged(board, holder) {
			const key = normalizeBoardKey(board);
			const claim = holder?.kind === "agent" && holder.claimed ? holder : null;
			const entry = entries.get(key);
			if (claim) {
				if (entry) {
					clearLinger(entry);
					entry.claim = claim;
				} else {
					entries.set(key, {
						board: options.displayKey(board),
						claim,
						doing: null,
						linger: null,
					});
				}
				publish();
				return;
			}
			// A human hold, a per-write agent hold or a free board: only news when
			// it ends a claim this list was showing.
			if (!entry?.claim) {
				return;
			}
			entry.claim = null;
			if (entry.doing) {
				lingerThenDrop(key, entry);
			} else {
				entries.delete(key);
			}
			publish();
		},
		/**
		 *
		 */
		doingLanded(board, doing) {
			if (doing.kind !== "agent") {
				return;
			}
			const key = normalizeBoardKey(board);
			const entry = entries.get(key);
			if (entry) {
				entry.doing = doing;
				if (!entry.claim) {
					lingerThenDrop(key, entry);
				}
			} else {
				const made: Entry = { board, claim: null, doing, linger: null };
				entries.set(key, made);
				lingerThenDrop(key, made);
			}
			publish();
		},
		/**
		 *
		 */
		snapshot() {
			return current;
		},
	};
}

export { createAgentActivity, type AgentActivityTracker };
