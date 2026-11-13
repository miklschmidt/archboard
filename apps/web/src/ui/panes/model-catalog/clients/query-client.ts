// The cache the browser keeps of what the server answered about models, and
// the defaults it keeps it under. One per tab.

import { QueryClient } from "@tanstack/react-query";

import { MODEL_CACHE_MS } from "#ui/constants/durations.ts";

/**
 * A cache with this product's read defaults.
 *
 * Two of them are deliberately not the library's. Reads never retry: the
 * Archboard server is on this machine, so a refusal is a fact rather than a
 * flutter, and the navigator already shows the reason with its own Refresh
 * beside it — three silent attempts with backoff would only delay that line.
 * Nothing refetches on focus by default either; the one resource that should
 * asks for it by name, because it is the only one cheap enough to be worth it.
 *
 * No model write goes through this cache. Writes keep their command owners,
 * their version checks and their refusal dialogs (ADR 0022), so there is no
 * automatic retry of a write and no second copy of what a person edited.
 * @returns A client for one tab.
 */
function createModelQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				refetchOnWindowFocus: false,
				gcTime: MODEL_CACHE_MS.gc,
			},
		},
	});
}

export { createModelQueryClient };
