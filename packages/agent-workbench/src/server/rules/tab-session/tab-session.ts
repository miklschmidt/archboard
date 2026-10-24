import { z } from "zod";

/**
 * The tab session a browser tab names on every pane socket (TASK-373): minted by the tab, kept
 * in its sessionStorage, shared by both of its panes. Opaque to the server beyond its bounds.
 */
const TabSessionIdSchema = z.string().min(1).max(128).brand<"TabSessionId">();

export type TabSessionId = z.infer<typeof TabSessionIdSchema>;

/**
 * The tab session a socket named, when it named one the server accepts.
 * @param value The `tabSession` query parameter as it arrived.
 * @returns The id, or null when it is missing or out of bounds.
 */
export function parseTabSessionId(value: unknown): TabSessionId | null {
	const parsed = TabSessionIdSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

/**
 * The thread-link key of one workhorse (ADR 0050). A tab session has one workhorse for each
 * checkout it works in, and each workhorse has a link of its own, keyed by both.
 * @param tabSessionId The tab session.
 * @param checkout The checkout the workhorse works in.
 * @returns The key, which no other tab session and checkout share.
 */
export function workhorseLinkKey(tabSessionId: TabSessionId, checkout: string): string {
	return JSON.stringify([tabSessionId, checkout]);
}

/**
 * The tab session and checkout a workhorse's link key names.
 * @param key The key, as `workhorseLinkKey` made it.
 * @returns Both, or null when the key is not a workhorse's.
 */
export function parseWorkhorseLinkKey(
	key: string,
): { readonly tabSessionId: TabSessionId; readonly checkout: string } | null {
	let named: unknown;
	try {
		named = JSON.parse(key);
	} catch {
		return null;
	}
	if (!Array.isArray(named) || named.length !== 2 || typeof named[1] !== "string") {
		return null;
	}
	const tabSessionId = parseTabSessionId(named[0]);
	return tabSessionId === null ? null : { tabSessionId, checkout: named[1] };
}
