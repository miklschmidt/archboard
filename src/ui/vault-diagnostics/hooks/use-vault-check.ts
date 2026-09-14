import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { VaultCheck } from "@/shared/semantic-policy";
import { semanticBoardKeys, vaultCheckQuery } from "@/ui/semantic-board-canvas";

/**
 * Read the shared checker; disk edits become visible without reopening the vault.
 *
 * The query itself is owned by the semantic canvas, which draws under the same
 * policy and names groups out of it; this is the diagnostics bell's reader of
 * that one cache entry.
 * @returns The shared vault check query.
 */
function useVaultCheck(): UseQueryResult<VaultCheck> {
	return useQuery(vaultCheckQuery());
}

/**
 * Synchronize pictures with the first checked policy, then with policy changes.
 */
function useVaultPolicyRefresh(): void {
	const client = useQueryClient();
	const { data } = useVaultCheck();
	const previous = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (data === undefined) return;
		// A picture may have loaded before this first check, using an older policy.
		if (previous.current !== data.fingerprint) {
			// An initial request has no cached data, so invalidation alone reuses it.
			void client
				.cancelQueries({ queryKey: semanticBoardKeys.renders })
				.then(() => client.invalidateQueries({ queryKey: semanticBoardKeys.renders }));
		}
		previous.current = data.fingerprint;
	}, [data, client]);
}

export { useVaultCheck, useVaultPolicyRefresh };
