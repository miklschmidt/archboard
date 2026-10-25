import { useCallback, useEffect } from "react";

import { vaultRepairRequest } from "#ui/rules/vault-diagnostics/repair-request.ts";
import type { BrowserWorkbenchTransport } from "@archboard/codex-realtime-voice/browser";

/**
 * Ask the agent to repair the vault, and check again whenever a turn ends.
 * @param vault The vault to repair: the one diagnosed.
 * @param transport The focused pane's transport, or null.
 * @param ask Send the agent a message.
 * @param recheck Read diagnostics again.
 * @returns The repair action.
 */
function useVaultRepair(
	vault: string,
	transport: BrowserWorkbenchTransport | null,
	ask: (text: string) => void,
	recheck: () => void,
): () => void {
	useEffect(() => {
		if (transport === null) return undefined;
		let turns = new Map(
			transport.snapshot()?.timeline?.turns.map((turn) => [turn.turnId, turn.status]),
		);
		return transport.subscribe(() => {
			const next = transport.snapshot()?.timeline?.turns;
			if (next === undefined) return;
			if (
				next.some((turn) => turn.status !== "inProgress" && turns.get(turn.turnId) === "inProgress")
			) {
				recheck();
			}
			turns = new Map(next.map((turn) => [turn.turnId, turn.status]));
		});
	}, [transport, recheck]);
	return useCallback(
		() => ask(vaultRepairRequest(globalThis.location.origin, vault)),
		[ask, vault],
	);
}

export { useVaultRepair };
