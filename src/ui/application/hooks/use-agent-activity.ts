// The agent activity maps as React state, one per vault, each replaced whole by
// each snapshot a pane's socket hears about its vault (ADR 0022).

import { useCallback, useMemo, useState } from "react";

import {
	NO_AGENT_ACTIVITY,
	replaceAgentActivity,
	type AgentActivityMap,
} from "@/ui/application/agent-activity";
import type { AgentActivityEntry } from "@/ui/types";

/** Which boards an agent is working on, by vault and then by board key. */
type AgentActivityByVault = Readonly<Record<string, AgentActivityMap>>;

/** The maps and their one move. */
interface AgentActivity {
	readonly byVault: AgentActivityByVault;
	/**
	 * A snapshot of one vault arrived; every pane in that vault hears the same one.
	 * @param vault The vault.
	 * @param snapshot The whole snapshot.
	 */
	readonly replace: (vault: string, snapshot: readonly AgentActivityEntry[]) => void;
}

/**
 * The agent activity of every vault a pane of this tab is in.
 * @returns The maps and a stable replace.
 */
function useAgentActivity(): AgentActivity {
	const [byVault, setByVault] = useState<AgentActivityByVault>({});
	const replace = useCallback((vault: string, snapshot: readonly AgentActivityEntry[]): void => {
		setByVault((current) => {
			const before = current[vault] ?? NO_AGENT_ACTIVITY;
			const next = replaceAgentActivity(before, snapshot);
			return next === before && vault in current ? current : { ...current, [vault]: next };
		});
	}, []);
	return useMemo(() => ({ byVault, replace }), [byVault, replace]);
}

export { useAgentActivity, type AgentActivity, type AgentActivityByVault };
