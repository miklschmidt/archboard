import type { ArchitectureFeed } from "#ui/architecture-drawing/model-reader/access/clients/events.ts";

/**
 * A cached reading stays on screen with its availability stated. An event that is being applied
 * and a stream that is opening are healthy, so only a failure counts.
 * @param query The selected read and its last coherent result.
 * @param query.data The result.
 * @param query.isError Whether its last read failed.
 * @param current Whether this reading follows live inputs.
 * @param feed The update stream's availability.
 * @returns Whether the visible cached model lacks fresh confirmation.
 */
function readingIsStale(
	query: { data: unknown; isError: boolean },
	current: boolean,
	feed: ArchitectureFeed,
): boolean {
	if (!current || query.data === undefined) return false;
	return query.isError || feed.connection === "unavailable" || feed.failure !== null;
}

export { readingIsStale };
