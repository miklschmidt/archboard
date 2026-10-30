import { afterEach, expect, mock, test } from "bun:test";

const running = new Set<string>();
let started = 0;

await mock.module("@archboard/board/store-read", () => ({
	/**
	 * Record one watcher's life.
	 * @param vault The followed vault.
	 * @returns The function that stops it.
	 */
	watchArchitectureModel: (vault: string) => {
		started += 1;
		running.add(vault);
		return () => running.delete(vault);
	},
}));
const { createAgentActivity } = await import("#server/state/agent-activity/agent-activity.ts");

afterEach(() => {
	running.clear();
	started = 0;
});

test("activity follows what connected panes can show and stops with the last pane", () => {
	const activity = createAgentActivity(() => {});
	activity.register(["/shop", "/billing"]);
	expect(running.size).toBe(0);

	const first = activity.hold("/shop");
	const second = activity.hold("/elsewhere");
	expect([...running].toSorted()).toEqual(["/billing", "/elsewhere", "/shop"]);
	expect(started).toBe(3);

	activity.register(["/shop"]);
	expect([...running].toSorted()).toEqual(["/elsewhere", "/shop"]);

	second();
	expect([...running]).toEqual(["/shop"]);
	activity.addressed("/off-screen");
	expect([...running].toSorted()).toEqual(["/off-screen", "/shop"]);
	first();
	expect(running.size).toBe(0);
	activity.dispose();
});
