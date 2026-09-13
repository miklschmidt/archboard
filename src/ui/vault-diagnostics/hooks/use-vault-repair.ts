import { useCallback, useEffect, useState } from "react";

import { requestVaultRepair, type VaultRepairTarget } from "@/ui/vault-diagnostics/api";

/**
 * Use the workbench composer and recheck authoritative turn endings.
 * @param target The active workbench.
 * @param recheck Read diagnostics again.
 * @param chooseThread Open the existing link/create flow.
 * @returns Dispatch state and the repair action.
 */
function useVaultRepair(
	target: VaultRepairTarget | null,
	recheck: () => void,
	chooseThread: () => void,
) {
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const transport = target?.transport;
	useEffect(() => {
		if (transport === undefined) return undefined;
		let turns = new Map(
			transport.snapshot()?.timeline?.turns.map((turn) => [turn.turnId, turn.status]),
		);
		return transport.subscribe(() => {
			const next = transport.snapshot()?.timeline?.turns;
			if (next === undefined) return;
			if (
				next.some((turn) => turn.status !== "inProgress" && turns.get(turn.turnId) === "inProgress")
			)
				recheck();
			turns = new Map(next.map((turn) => [turn.turnId, turn.status]));
		});
	}, [transport, recheck]);
	const repair = useCallback(async (): Promise<void> => {
		setPending(true);
		try {
			setMessage(await requestVaultRepair(target, chooseThread, globalThis.location.origin));
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "The repair request failed. Try again.");
		} finally {
			setPending(false);
		}
		recheck();
	}, [target, recheck, chooseThread]);
	return { pending, message, repair };
}

export { useVaultRepair };
