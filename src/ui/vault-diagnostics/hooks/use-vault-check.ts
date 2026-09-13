import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { VaultCheckSchema, type VaultCheck } from "@/shared/semantic-policy";
import { semanticBoardKeys } from "@/ui/semantic-board-canvas";
import { VAULT_CHECK_POLL_MS } from "@/shared/timing/timing";

/**
 * Read the shared checker; disk edits become visible without reopening the vault.
 * @returns The shared vault check query.
 */
function useVaultCheck(): UseQueryResult<VaultCheck> {
	return useQuery({
		queryKey: ["vault-check"],
		/**
		 * Read and validate the server response.
		 * @param context The query cancellation signal.
		 * @returns The shared checker snapshot.
		 */
		queryFn: async (context): Promise<VaultCheck> => {
			const { signal } = context;
			const response = await fetch("/api/vault/check", { signal });
			if (!response.ok)
				throw new Error("The vault check failed. Check the server connection and try again.");
			return VaultCheckSchema.parse(await response.json());
		},
		staleTime: VAULT_CHECK_POLL_MS,
		refetchInterval: VAULT_CHECK_POLL_MS,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		retry: false,
	});
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
