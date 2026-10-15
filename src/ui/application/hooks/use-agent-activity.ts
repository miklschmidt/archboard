// The agent activity maps as React state, one per vault, each replaced whole by
// each snapshot of that vault a pane's socket hears (ADR 0022). Every socket
// hears every vault's snapshots, so the tab keeps one account.

import { useCallback, useMemo, useState } from "react";

import {
	NO_AGENT_ACTIVITY,
	replaceAgentActivity,
	type AgentActivityMap,
} from "@/ui/application/agent-activity";
import type { AgentActivityEntry } from "@/ui/types";

/** Which boards an agent is working on, by vault and then by board key. */
type AgentActivityByVault = Readonly<Record<string, AgentActivityMap>>;

/** The maps and their moves. */
interface AgentActivity {
	readonly byVault: AgentActivityByVault;
	/**
	 * A snapshot of one vault arrived; every pane hears the same one.
	 * @param vault The vault.
	 * @param snapshot The whole snapshot.
	 */
	readonly replace: (vault: string, snapshot: readonly AgentActivityEntry[]) => void;
	/**
	 * A socket came back: what the tab heard before is not current. The server
	 * tells a new socket only the vaults where an agent is at work, so a vault
	 * that went quiet while the socket was down is never said to be clear.
	 */
	readonly forget: () => void;
}

/**
 * The agent activity of every vault the server reports.
 * @returns The maps, a stable replace and a stable forget.
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
	const forget = useCallback((): void => {
		setByVault({});
	}, []);
	return useMemo(() => ({ byVault, replace, forget }), [byVault, replace, forget]);
}

export { useAgentActivity, type AgentActivity, type AgentActivityByVault };
