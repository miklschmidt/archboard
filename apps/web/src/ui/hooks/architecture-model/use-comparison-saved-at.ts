import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/board/content";
import { architectureCheckpointsQuery } from "#ui/clients/architecture-model/queries.ts";

/**
 * When an exact base was saved. Only the retained list knows, and only a reading compared with a
 * saved reading asks it.
 * @param vault The addressed vault.
 * @param comparison The comparison on show.
 * @returns The time, once the list has said.
 */
function useComparisonSavedAt(vault: string, comparison: Model["comparison"]): string | undefined {
	const exact = comparison?.reason === "explicit" ? comparison.checkpoint : undefined;
	const rows = useQuery({ ...architectureCheckpointsQuery(vault), enabled: exact !== undefined });
	if (rows.data?.success !== true) return undefined;
	return rows.data.checkpoints.find(({ id }) => id === exact)?.createdAt;
}

export { useComparisonSavedAt };
