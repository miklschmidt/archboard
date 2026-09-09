// The agent activity map as React state, replaced whole by each snapshot a
// pane's socket hears (ADR 0022).

import { useCallback, useMemo, useState } from "react";

import {
	NO_AGENT_ACTIVITY,
	replaceAgentActivity,
	type AgentActivityMap,
} from "@/ui/application/agent-activity";
import type { AgentActivityEntry } from "@/ui/types";

/** The map and its one move. */
interface AgentActivity {
	readonly map: AgentActivityMap;
	/** A snapshot arrived; every pane's socket hears the same one. */
	readonly replace: (snapshot: readonly AgentActivityEntry[]) => void;
}

/**
 * The agent activity map.
 * @returns The map and a stable replace.
 */
function useAgentActivity(): AgentActivity {
	const [map, setMap] = useState<AgentActivityMap>(NO_AGENT_ACTIVITY);
	const replace = useCallback((snapshot: readonly AgentActivityEntry[]): void => {
		setMap((current) => replaceAgentActivity(current, snapshot));
	}, []);
	return useMemo(() => ({ map, replace }), [map, replace]);
}

export { useAgentActivity, type AgentActivity };
