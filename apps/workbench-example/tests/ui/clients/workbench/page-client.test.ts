import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { followPageLifecycle } from "#ui/clients/workbench/page-client.ts";

beforeAll(() => {
	GlobalRegistrator.register();
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * A page lifecycle event.
 * @param type `pagehide` or `pageshow`.
 * @param persisted Whether the browser keeps the page in its back-forward cache.
 * @returns The event.
 */
function transition(type: "pagehide" | "pageshow", persisted: boolean): Event {
	return Object.assign(new Event(type), { persisted });
}

test("a page restored from the back-forward cache shows a new connected client", () => {
	const clients: { connect: ReturnType<typeof mock>; dispose: ReturnType<typeof mock> }[] = [];
	const shown: unknown[] = [];
	followPageLifecycle(
		() => {
			const client = { connect: mock(async () => true), dispose: mock(async () => undefined) };
			clients.push(client);
			return client;
		},
		(client) => shown.push(client),
	);
	expect(clients).toHaveLength(1);
	expect(clients[0]?.connect).toHaveBeenCalledTimes(1);

	window.dispatchEvent(transition("pagehide", true));
	expect(clients[0]?.dispose).toHaveBeenCalledTimes(1);
	window.dispatchEvent(transition("pageshow", true));
	expect(clients).toHaveLength(2);
	expect(clients[1]?.connect).toHaveBeenCalledTimes(1);
	expect(shown).toEqual([clients[0], clients[1]]);

	window.dispatchEvent(transition("pageshow", false));
	expect(clients).toHaveLength(2);
	window.dispatchEvent(transition("pagehide", false));
	expect(clients[1]?.dispose).toHaveBeenCalledTimes(1);
});
