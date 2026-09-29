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
