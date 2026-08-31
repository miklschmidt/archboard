import { describe, expect, test } from "bun:test";

import { createHarness, flushStreams } from "./fake-child.js";

describe("Codex app-server test transport cleanup", () => {
	test("releases fake child streams, queued bytes, and listeners", async () => {
		const harness = createHarness();
		const { child } = harness;
		child.stdin.write("queued fixture");
		child.stdout.write("partial frame");
		child.stderr.write("diagnostic fixture");

		await harness.close();

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

	test("settles a blocked fake write before destroying child streams", async () => {
		const harness = createHarness();
		harness.child.stdin.blockNext = true;
		harness.child.stdin.write(Buffer.alloc(1_024));
		harness.child.dispose();
		await flushStreams();

		expect(harness.child.stdin.destroyed).toBeTrue();
		expect(harness.child.stdout.destroyed).toBeTrue();
		expect(harness.child.stderr.destroyed).toBeTrue();
		expect(harness.child.stdin.writableLength).toBe(0);
		expect(harness.child.stdin.writes).toHaveLength(0);
		expect(harness.child.stdin.listenerCount("drain")).toBe(0);
		expect(harness.child.stdin.listenerCount("error")).toBe(0);
		expect(harness.child.stdout.listenerCount("data")).toBe(0);
		expect(harness.child.stdout.listenerCount("error")).toBe(0);
		expect(harness.child.stdout.listenerCount("end")).toBe(0);
		expect(harness.child.stdout.listenerCount("close")).toBe(0);
		expect(harness.child.stderr.listenerCount("data")).toBe(0);
		expect(harness.child.stderr.listenerCount("error")).toBe(0);
		expect(harness.child.listenerCount("exit")).toBe(0);
	});

	test("releases a blocked transport write before awaiting shutdown", async () => {
		const harness = createHarness();
		harness.child.stdin.blockNext = true;
		const write = harness.transport.sendNotification("initialized");
		await flushStreams();

		await harness.close();
		await write;
		expect(harness.child.stdin.finalizations).toBe(1);
		expect(harness.child.stdin.writableLength).toBe(0);
	});
});
