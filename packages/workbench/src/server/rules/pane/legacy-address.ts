// What a pane's model key names. Pure: it reads no pane and no vault.

import { parsePaneKey } from "@archboard/model/legacy-address";

type LegacyIdentity = ReturnType<typeof parsePaneKey>;

/**
 * What a pane's key names, or nothing when it does not name a model at all.
 *
 * Parsing rather than reading the key whole, and never throwing: a key reaches
 * here from a pane that has been reconnecting for a while, and a bad one must
 * cost that pane its model rather than cost the socket its acceptance.
 * @param key The pane's model key.
 * @returns The identity, or null when the key is not one.
 */
function paneAddress(key: string): LegacyIdentity | null {
	try {
		return parsePaneKey(key);
	} catch {
		return null;
	}
}

/**
 * The aggregate a pane key is about, which is what a lease, a claim and a
 * settled change are all keyed by.
 *
 * Every variant of a model lives in the one document (ADR 0023), so there is
 * one lock for the family and not one per proposal. A pane showing a proposal
 * is looking at the same file as a pane showing what is current, and has to be
 * told the same things about it.
 * @param key The pane's model key, or null when it is showing none.
 * @returns The model's name, or null.
 */
function aggregateOf(key: string | null): string | null {
	if (key === null) {
		return null;
	}
	return paneAddress(key)?.board ?? null;
}

export { aggregateOf, paneAddress };
