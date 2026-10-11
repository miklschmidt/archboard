// Reading cached resources again, from after a change rather than from before it.

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Read these queries again, so that an event is answered from after it and
 * never by a request that was already on the wire before it.
 *
 * Every read in flight is cancelled first. A read already on the wire carries
 * an answer the server decided before the event: a cache with nothing behind
 * that key cannot restart it, and a query no one is reading right now is
 * skipped by a refetch altogether, so the stale answer would land, clear the
 * invalidation and count as fresh. A cancelled read is reverted rather than
 * failed: data already in hand stays on screen, no error reaches a person, and
 * the invalidation stands.
 *
 * Then they are marked stale in the order given, without cancelling a read
 * that started after the cancelling (such a read is from after the event). Give
 * what a picture is drawn from before the picture: a picture reads its board
 * the moment it is asked for again, and a document not yet marked stale is the
 * one from before the write.
 * @param client The cache.
 * @param queryKeys The queries to read again, by exact key or by prefix, sources before what they feed.
 * @returns Settles once the fresh reads have been asked for.
 */
async function readAgain(client: QueryClient, queryKeys: readonly QueryKey[]): Promise<void> {
	await Promise.all(queryKeys.map((queryKey) => client.cancelQueries({ queryKey })));
	await Promise.all(
		queryKeys.map((queryKey) => client.invalidateQueries({ queryKey }, { cancelRefetch: false })),
	);
}

export { readAgain };
