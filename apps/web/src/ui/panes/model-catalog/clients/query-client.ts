// The cache the browser keeps of what the server answered about models, and
// the defaults it keeps it under. One per tab.

import { QueryClient } from "@tanstack/react-query";

import { ms } from "@archboard/timing";

/**
 * A cache with this product's read defaults.
 *
 * Two of them are deliberately not the library's. Reads never retry: the
 * Archboard server is on this machine, so a refusal is a fact rather than a
 * flutter, and the page already says the reason where it reads — three
 * silent attempts with backoff would only delay that line.
 * The one exception is a model busy with a write, which a read of the model
 * waits out by name (`busyRetry`), because that refusal ends by itself.
 * Nothing refetches on focus either: the server says when what a tab holds
 * changed, over the architecture feed.
 *
 * No model write goes through this cache. Writes keep their command owners,
 * their version checks and their refusal dialogs (ADR 0022), so there is no
 * automatic retry of a write and no second copy of what a person edited.
 * Making one opens nothing: the feed opens when something first follows through it.
 * @returns A client for one tab.
 */
function createModelQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				refetchOnWindowFocus: false,
				gcTime: ms("modelCache.gc"),
			},
		},
	});
}

export { createModelQueryClient };
