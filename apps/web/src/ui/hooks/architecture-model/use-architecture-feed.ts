import { useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { architectureFeed } from "#ui/clients/architecture-model/events.ts";

/**
 * Keep current-reading availability visible while Query owns all architecture content.
 * @param vault The pane's explicit vault.
 * @returns Availability of its shared event connection.
 */
function useArchitectureFeed(vault: string) {
	const client = useQueryClient();
	const feed = useMemo(() => architectureFeed(client, vault), [client, vault]);
	return useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
}

export { useArchitectureFeed };
