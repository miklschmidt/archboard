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

export { NO_AGENT_ACTIVITY, replaceAgentActivity, type AgentActivityMap };
