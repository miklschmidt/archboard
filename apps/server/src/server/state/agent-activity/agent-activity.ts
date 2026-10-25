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
// An entry exists while a claim stands, and for CLAIM_MS.activityLinger after an
// unclaimed agent write, so a lone write is on screen long enough to be seen.
// Human holds are not activity: a person's own hold is what their pane is
// doing, and it is nobody else's business.
//
// One list per vault (ADR 0049): a board of one name in two vaults is two
// boards. Every pane is told every vault's list, each naming its vault,
// because the navigator marks the boards of every repository it lists.

import { boardMemoryKey } from "@archboard/board/address";
import type {
	AgentActivity,
	AgentActivityMessage,
} from "@archboard/server-lifecycle/pane-messages";
import { CLAIM_MS } from "@archboard/timing";
import type { boardLockState } from "@archboard/board/lock";
import type { recentDoing } from "@archboard/board/doing";

type DoingEntry = ReturnType<typeof recentDoing>[number];
type LockHolder = NonNullable<ReturnType<typeof boardLockState>>;

interface Entry {
	vault: string;
	board: string;
	claim: LockHolder | null;
	doing: DoingEntry | null;
	linger: ReturnType<typeof setTimeout> | null;
}

interface AgentActivityTracker {
	/** A board's lock announced: a claim taken, changed or gone. Anything else is not activity. */
	lockChanged(vault: string, board: string, holder: Readonly<LockHolder> | null): void;
	/** An agent's write landed and said what it was doing. */
	doingLanded(vault: string, board: string, entry: Readonly<DoingEntry>): void;
	/** Every vault's list where an agent is at work, for a client that has just connected. */
	snapshots(): AgentActivityMessage[];
}

/**
 * Stop an entry's linger timer, if one is running.
 * @param entry The entry.
 */
function clearLinger(entry: Entry): void {
	if (entry.linger) {
		clearTimeout(entry.linger);
		entry.linger = null;
	}
}

/**
 * The tracker of which boards an agent is editing right now, which publishes
 * one snapshot to every pane whenever that changes.
 * @param options How to reach the panes and how to name a board to them.
 * @param options.send Sends one vault's snapshot to every client.
 * @param options.displayKey The board key as panes know it.
 * @returns The tracker.
 */
function createAgentActivity(options: {
	/** Sends one vault's snapshot to every client. */
	send: (message: AgentActivityMessage) => void;
	/** The board key as panes know it, for a key the lock module normalized. */
	displayKey: (board: string) => string;
}): AgentActivityTracker {
	const entries = new Map<string, Entry>();
	const snapshots = new Map<string, AgentActivityMessage>();

	/**
	 * Rebuild one vault's snapshot and send it to every pane. A vault with no
	 * agent at work is sent once as empty and then forgotten.
	 * @param vault The vault whose list changed.
	 */
	const publish = (vault: string): void => {
		const activity: AgentActivity[] = [...entries.values()]
			.filter((entry) => entry.vault === vault)
			.map(({ board, claim, doing }) => ({ board, claim, doing }));
		const current: AgentActivityMessage = { type: "agent_activity", vault, activity };
		if (activity.length === 0) {
			snapshots.delete(vault);
		} else {
			snapshots.set(vault, current);
		}
		options.send(current);
	};

	// Each write restarts the linger, so continuous unclaimed work is one
	// visit. When it fires under a claim taken meanwhile, the claim keeps the
	// entry and the timer simply ends.
	/**
	 * Keep an unclaimed board's entry on screen for a moment, then drop it.
	 * @param key The normalized board key.
	 * @param entry Its entry.
	 */
	const lingerThenDrop = (key: string, entry: Entry): void => {
		clearLinger(entry);
		const timer = setTimeout(() => {
			entry.linger = null;
			if (entry.claim || entries.get(key) !== entry) {
				return;
			}
			entries.delete(key);
			publish(entry.vault);
		}, CLAIM_MS.activityLinger);
		timer.unref();
		entry.linger = timer;
	};

	/**
	 * Record that an agent has claimed this board.
	 * @param vault The vault the board lives in.
	 * @param board The board as the lock spelled it.
	 * @param key Its memory key.
	 * @param claim The claim.
	 */
	const claimTaken = (vault: string, board: string, key: string, claim: LockHolder): void => {
		const entry = entries.get(key);
		if (entry) {
			clearLinger(entry);
			entry.claim = claim;
		} else {
			entries.set(key, {
				vault,
				board: options.displayKey(board),
				claim,
				doing: null,
				linger: null,
			});
		}
		publish(vault);
	};

	/**
	 * Record that a claim this list was showing has ended, keeping the entry on
	 * screen for a moment when the agent had said what it was doing.
	 * @param key The board's memory key.
	 */
	const claimEnded = (key: string): void => {
		const entry = entries.get(key);
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
		publish(entry.vault);
	};

	return {
		/**
		 * A board's lock announced: a claim taken, changed or gone.
		 * @param vault The vault the board lives in.
		 * @param board The board as the lock spelled it.
		 * @param holder Who holds it now, or null when it is free.
		 */
		lockChanged(vault, board, holder) {
			const key = boardMemoryKey(vault, board);
			const claim = holder?.kind === "agent" && holder.claimed ? holder : null;
			if (claim) {
				claimTaken(vault, board, key, claim);
				return;
			}
			claimEnded(key);
		},
		/**
		 * An agent's write landed and said what it was doing.
		 * @param vault The vault the board lives in.
		 * @param board The board it wrote.
		 * @param doing What it said.
		 */
		doingLanded(vault, board, doing) {
			if (doing.kind !== "agent") {
				return;
			}
			const key = boardMemoryKey(vault, board);
			const entry = entries.get(key);
			if (entry) {
				entry.doing = doing;
				if (!entry.claim) {
					lingerThenDrop(key, entry);
				}
			} else {
				const made: Entry = { vault, board, claim: null, doing, linger: null };
				entries.set(key, made);
				lingerThenDrop(key, made);
			}
			publish(vault);
		},
		/**
		 * Every vault's list where an agent is at work, for a client that has just connected.
		 * @returns The snapshots, one per vault.
		 */
		snapshots() {
			return [...snapshots.values()];
		},
	};
}

export { createAgentActivity, type AgentActivityTracker };
