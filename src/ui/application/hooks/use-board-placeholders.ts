// Whether each pane's board is scratch: a note without a chosen name (ADR
// 0009). Read once per board a pane adopts, so the navigator can offer the
// name it is missing.

import { useEffect } from "react";

import { recordFor, type PaneRecord } from "@/ui/application/pane-records";
import type { Panes } from "@/ui/application/hooks/use-panes";
import { fetchBoardInfo } from "@/ui/canvas/api";

/** Where a flag is written. */
type Patch = (paneId: string, patch: Partial<PaneRecord>) => void;

/**
 * Read one board's placeholder flag into its pane's record.
 * @param patch Where the flag goes.
 * @param paneId The pane.
 * @param boardKey The board it holds.
 * @param current Whether the answer is still for the board the pane holds.
 */
async function readPlaceholder(
	patch: Patch,
	paneId: string,
	boardKey: string,
	current: () => boolean,
): Promise<void> {
	try {
		const info = await fetchBoardInfo(boardKey);
		if (current()) {
			patch(paneId, { placeholder: info.placeholder });
		}
	} catch {
		// An unreadable board is not scratch; the record keeps its flag.
	}
}

/**
 * Keep each pane's placeholder flag current with the board it holds.
 * @param panes The panes.
 */
function useBoardPlaceholders(panes: Panes): void {
	const { list, records, patch } = panes;
	// One string per pane and board, so a record change that moves no board is not a read.
	const signature = list.panes
		.map((entry) => `${entry.paneId}:${recordFor(records, entry.paneId).status.boardKey ?? ""}`)
		.join("\n");
	useEffect(() => {
		let live = true;
		for (const pair of signature.split("\n")) {
			const separator = pair.indexOf(":");
			const paneId = pair.slice(0, separator);
			const boardKey = pair.slice(separator + 1);
			if (boardKey !== "") {
				void readPlaceholder(patch, paneId, boardKey, () => live);
			}
		}
		return () => {
			live = false;
		};
	}, [signature, patch]);
}

export { useBoardPlaceholders };
