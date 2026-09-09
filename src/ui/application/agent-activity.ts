// Which boards an agent is working on, as the server tells every client
// (ADR 0022): a map by board key, replaced whole on each snapshot and kept
// reference-stable when the snapshot says nothing new. Pure.

import type { AgentActivityEntry } from "@/ui/types";

/** Agent activity by board key. */
type AgentActivityMap = Readonly<Record<string, AgentActivityEntry>>;

/** No agent is working on any board. */
const NO_AGENT_ACTIVITY: AgentActivityMap = Object.freeze({});

/**
 * Whether two snapshots say the same thing.
 * @param current The map held now.
 * @param next The map the snapshot builds.
 * @returns True when every entry is the same, field for field.
 */
function sameActivity(current: AgentActivityMap, next: AgentActivityMap): boolean {
	const keys = Object.keys(next);
	if (keys.length !== Object.keys(current).length) {
		return false;
	}
	// Entries are plain data off the wire; a snapshot with the same words is
	// not a change, and saying so keeps the shell from re-rendering for it.
	return keys.every((key) => JSON.stringify(current[key]) === JSON.stringify(next[key]));
}

/**
 * Replace the map with a snapshot.
 * @param current The map held now.
 * @param snapshot Every board an agent is working on.
 * @returns The next map, or the same reference when nothing changed.
 */
function replaceAgentActivity(
	current: AgentActivityMap,
	snapshot: readonly AgentActivityEntry[],
): AgentActivityMap {
	const next: Record<string, AgentActivityEntry> = {};
	for (const entry of snapshot) {
		next[entry.board] = entry;
	}
	return sameActivity(current, next) ? current : Object.freeze(next);
}

/** Which boards an agent picked up or put down between two snapshots. */
interface AgentBoardChange {
	/** Boards an agent has just started working on. */
	readonly started: readonly string[];
	/** Boards an agent has stopped working on: whatever it wrote is settled. */
	readonly settled: readonly string[];
}

/**
 * What changed hands between the map held now and the snapshot that arrived.
 *
 * A board an agent put down is the moment its content is worth reading again;
 * a board an agent picked up may be one the vault has never listed. Neither is
 * announced any other way, so this is how the shell knows to ask (TASK-167).
 * @param current The map held now.
 * @param snapshot Every board an agent is working on.
 * @returns The boards started and settled.
 */
function agentBoardChange(
	current: AgentActivityMap,
	snapshot: readonly AgentActivityEntry[],
): AgentBoardChange {
	const now = new Set(snapshot.map((entry) => entry.board));
	const before = Object.keys(current);
	return {
		started: [...now].filter((board) => !(board in current)),
		settled: before.filter((board) => !now.has(board)),
	};
}

export {
	NO_AGENT_ACTIVITY,
	agentBoardChange,
	replaceAgentActivity,
	type AgentActivityMap,
	type AgentBoardChange,
};
