import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, expect, jest, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";

import { CONTACT_LOST_MS } from "@/shared/timing/timing";
import { reducePaneContact, usePaneContact } from "@/ui/canvas/pane-contact";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

// Fake time per test, restored after each: the preload's wall-clock guard
// reads the clock between tests and must see real time.
beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

test("a pane keeps contact through a blip and loses it after one reconnect window", () => {
	const { result } = renderHook(usePaneContact);
	expect(result.current.contact).toEqual({ connected: false, lost: false });
	const { setConnected } = result.current;

	act(() => setConnected(true));
	act(() => setConnected(false));
	act(() => {
		jest.advanceTimersByTime(CONTACT_LOST_MS - 1);
	});
	expect(result.current.contact).toEqual({ connected: false, lost: false });
	act(() => setConnected(true));
	act(() => {
		jest.advanceTimersByTime(CONTACT_LOST_MS * 2);
	});
	expect(result.current.contact).toEqual({ connected: true, lost: false });

	act(() => setConnected(false));
	act(() => {
		jest.advanceTimersByTime(CONTACT_LOST_MS);
	});
	expect(result.current.contact).toEqual({ connected: false, lost: true });
	act(() => setConnected(true));
	expect(result.current.contact).toEqual({ connected: true, lost: false });
	expect(result.current.setConnected).toBe(setConnected);
});

test("an unmounted pane arms no window", () => {
	const { result, unmount } = renderHook(usePaneContact);
	unmount();
	act(() => {
		jest.advanceTimersByTime(CONTACT_LOST_MS);
	});
	expect(result.current.contact.lost).toBe(false);
});

test("an event that changes nothing returns the same contact", () => {
	const connected = reducePaneContact({ connected: false, lost: false }, "connected");
	expect(reducePaneContact(connected, "connected")).toBe(connected);
	expect(reducePaneContact(connected, "reconnect_window_passed")).toBe(connected);
	const lost = reducePaneContact(
		reducePaneContact(connected, "disconnected"),
		"reconnect_window_passed",
	);
	expect(reducePaneContact(lost, "disconnected")).toBe(lost);
	expect(reducePaneContact(lost, "reconnect_window_passed")).toBe(lost);
});
