// The shown conversation of a browser tab (ADR 0050), as the tab registry holds it. What is
// guarded: the first read pins it to the asking pane's checkout, after that only a show changes
// it and is told, and it ends with the tab. The route that shows one and the agent's show that
// does not are owned by tests/system/server-state/shown-conversation.test.ts.

import { afterEach, beforeEach, expect, jest, test } from "bun:test";

import { TAB_SESSION_GRACE_MS } from "@archboard/timing";
import { parseTabSessionId, type TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { createTabSessions } from "#server/services/sessions/browser-tabs.ts";

const TAB = parseTabSessionId("tab-one") as TabSessionId;
const PAYMENTS = "/work/payments";
const SHOP = "/work/shop";

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

test("a tab shows the checkout of the first pane read for it, and only a show changes that", () => {
	const tabs = createTabSessions();
	const told: TabSessionId[] = [];
	tabs.onShownChange((tabSessionId) => told.push(tabSessionId));
	tabs.note("pane-a", TAB);

	expect(tabs.current(TAB)).toBeNull();
	expect(tabs.shown(TAB, () => PAYMENTS)).toBe(PAYMENTS);
	// Another pane of the tab, in another checkout, reads the same conversation.
	expect(tabs.shown(TAB, () => SHOP)).toBe(PAYMENTS);
	expect(told).toEqual([]);

	expect(tabs.show(TAB, SHOP)).toBe(true);
	expect(tabs.shown(TAB, () => PAYMENTS)).toBe(SHOP);
	expect(tabs.show(TAB, SHOP)).toBe(false);
	expect(told).toEqual([TAB]);
});

test("a tab's shown conversation ends with the tab, and a tab that comes back is pinned afresh", () => {
	const tabs = createTabSessions();
	tabs.note("pane-a", TAB);
	tabs.show(TAB, SHOP);

	// A reload within the grace keeps it.
	tabs.forget("pane-a");
	jest.advanceTimersByTime(TAB_SESSION_GRACE_MS - 1);
	tabs.note("pane-a", TAB);
	expect(tabs.current(TAB)).toBe(SHOP);

	tabs.forget("pane-a");
	jest.advanceTimersByTime(TAB_SESSION_GRACE_MS);
	expect(tabs.current(TAB)).toBeNull();
	tabs.note("pane-a", TAB);
	expect(tabs.shown(TAB, () => PAYMENTS)).toBe(PAYMENTS);
});
