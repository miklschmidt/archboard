import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { OutlineNode } from "@/ui/board-catalog/lib/outline";
import { halfOf, outlineOf } from "@/ui/board-catalog/lib/vault-boards";
import { semanticBoardListQuery } from "#web/ui/clients/semantic-board-canvas/reads/queries.ts";
import type { CatalogBoard } from "@/ui/types";

/** One vault's boards, as a pane reads them. */
interface VaultBoards {
	readonly boards: readonly CatalogBoard[];
	/** Where each board sits, for the boards above a pane's own. */
	readonly outline: readonly OutlineNode<CatalogBoard>[];
}

const NO_BOARDS: VaultBoards = Object.freeze({ boards: [], outline: [] });

/**
 * The boards of one vault: what a pane in that vault searches and places its
 * board among. The same cache entry the navigator lists the vault's boards from.
 * @param vault The vault.
 * @returns Its boards and outline, empty while unread.
 */
function useVaultBoards(vault: string): VaultBoards {
	const { data } = useQuery(semanticBoardListQuery(vault));
	return useMemo(() => {
		if (data === undefined) return NO_BOARDS;
		const half = halfOf(data);
		return { boards: half.boards, outline: outlineOf(half) };
	}, [data]);
}

export { useVaultBoards, type VaultBoards };
