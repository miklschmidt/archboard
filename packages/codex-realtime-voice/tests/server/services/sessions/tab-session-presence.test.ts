import { afterEach, beforeEach, expect, jest, test } from "bun:test";

import { TAB_SESSION_GRACE_MS } from "@archboard/timing";
import { parseTabSessionId, type TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { createTabSessions } from "#server/services/sessions/browser-tabs.ts";

const TAB = parseTabSessionId("tab-one") as TabSessionId;

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

/**
 * The tab sessions, and every session they said ended.
 * @returns Both.
 */
function watched() {
	const tabs = createTabSessions();
	const ended: TabSessionId[] = [];
	tabs.onEnded((tabSessionId) => ended.push(tabSessionId));
	return { tabs, ended };
}

test("a tab session ends once the grace passes with none of its chats back, and only once", () => {
	const { tabs, ended } = watched();
	tabs.note("chat-a", TAB);
	tabs.note("chat-b", TAB);

	tabs.forget("chat-a");
	jest.advanceTimersByTime(TAB_SESSION_GRACE_MS * 2);
	// Its other chat still holds it.
	expect(ended).toEqual([]);

	tabs.forget("chat-b");
	jest.advanceTimersByTime(TAB_SESSION_GRACE_MS - 1);
	expect(ended).toEqual([]);
	jest.advanceTimersByTime(1);
	expect(ended).toEqual([TAB]);

	jest.advanceTimersByTime(TAB_SESSION_GRACE_MS * 2);
	expect(ended).toEqual([TAB]);
});

test("a chat of the tab back within the grace keeps the session, as a reload does", () => {
	const { tabs, ended } = watched();
	tabs.note("chat-a", TAB);

	// A reload closes the tab's sockets and opens them again.
	tabs.forget("chat-a");
	jest.advanceTimersByTime(TAB_SESSION_GRACE_MS - 1);
	tabs.note("chat-a", TAB);
	jest.advanceTimersByTime(TAB_SESSION_GRACE_MS * 2);

	expect(ended).toEqual([]);
	expect(tabs.of("chat-a")).toBe(TAB);
});

test("a server that stops ends no tab session", () => {
	const { tabs, ended } = watched();
	tabs.note("chat-a", TAB);
	tabs.forget("chat-a");

	tabs.forgetAll();
	jest.advanceTimersByTime(TAB_SESSION_GRACE_MS * 2);

	expect(ended).toEqual([]);
});
