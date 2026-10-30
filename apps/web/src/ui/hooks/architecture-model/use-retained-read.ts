import { useCallback } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ArchitectureCheckpointRows } from "@archboard/board/model";
import type { Model } from "@archboard/board/content";

/**
 * Opening a menu reads the retained rows once, and repeats only a read that failed.
 * @param history The retained rows.
 * @param catalogue The current catalogue.
 * @returns The menu's open handler.
 */
function useRetainedRead(
	history: UseQueryResult<ArchitectureCheckpointRows>,
	catalogue: UseQueryResult<Model>,
) {
	const { refetch: readHistory, isError: historyFailed, data: rows } = history;
	const { refetch: readCatalogue, isError: catalogueFailed } = catalogue;
	return useCallback(
		(open: boolean): void => {
			if (!open) return;
			if (rows === undefined || historyFailed) void readHistory();
			if (catalogueFailed) void readCatalogue();
		},
		[readHistory, rows, historyFailed, readCatalogue, catalogueFailed],
	);
}

export { useRetainedRead };
