import { describe, expect, test } from "bun:test";

import { closeTransport, createHarness } from "./fake-child.js";

describe("Codex app-server test transport cleanup", () => {
	test("releases fake child streams, queued bytes, and listeners", async () => {
		const { child, transport } = createHarness();
		child.stdin.write("queued fixture");
		child.stdout.write("partial frame");
		child.stderr.write("diagnostic fixture");

		await closeTransport(transport, child);

		expect(child.stdin.destroyed).toBeTrue();
		expect(child.stdout.destroyed).toBeTrue();
		expect(child.stderr.destroyed).toBeTrue();
		expect(child.stdin.writableLength).toBe(0);
		expect(child.stdout.readableLength).toBe(0);
		expect(child.stderr.readableLength).toBe(0);
		expect(child.stdin.writes).toHaveLength(0);
		expect(child.stdin.listenerCount("drain")).toBe(0);
		expect(child.stdin.listenerCount("error")).toBe(0);
		expect(child.stdout.listenerCount("data")).toBe(0);
		expect(child.stdout.listenerCount("error")).toBe(0);
		expect(child.stdout.listenerCount("end")).toBe(0);
		expect(child.stdout.listenerCount("close")).toBe(0);
		expect(child.stderr.listenerCount("data")).toBe(0);
		expect(child.stderr.listenerCount("error")).toBe(0);
		expect(child.listenerCount("exit")).toBe(0);
	});
});
