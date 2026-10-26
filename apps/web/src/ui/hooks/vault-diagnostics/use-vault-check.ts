import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { policyChanged } from "#ui/clients/semantic-board-canvas/reads/board-refresh.ts";
import { vaultCheckQuery } from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import type { VaultCheckSchema } from "@archboard/board/policy";
import type { z } from "zod";

type VaultCheck = z.infer<typeof VaultCheckSchema>;

/**
 * Read the shared checker; disk edits become visible without reopening the vault.
 *
 * The query itself is owned by the semantic canvas, which draws under the same
 * policy and names groups out of it; this is the diagnostics bell's reader of
 * that one cache entry.
 * @param vault The vault.
 * @returns The shared vault check query.
 */
function useVaultCheck(vault: string): UseQueryResult<VaultCheck> {
	return useQuery(vaultCheckQuery(vault));
}

/**
 * Synchronize one vault's pictures with its first checked policy, then with policy changes.
 * A pane the server moves into another vault starts again with that vault's
 * first check, even when its policy has the fingerprint of the one it left.
 * @param vault The vault.
 */
function useVaultPolicyRefresh(vault: string): void {
	const client = useQueryClient();
	const { data } = useVaultCheck(vault);
	const previous = useRef<{ vault: string; fingerprint: string } | undefined>(undefined);
	useEffect(() => {
		if (data === undefined) return;
		// A picture may have loaded before this first check, using an older policy.
		if (previous.current?.vault !== vault || previous.current.fingerprint !== data.fingerprint) {
			void policyChanged(client, vault);
		}
		previous.current = { vault, fingerprint: data.fingerprint };
	}, [data, client, vault]);
}

export { useVaultCheck, useVaultPolicyRefresh };
