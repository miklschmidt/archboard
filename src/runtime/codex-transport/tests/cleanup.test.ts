import { describe, expect, test } from "bun:test";

import { captureRejection, createHarness, flushStreams, type FakeChild } from "./fake-child.js";

function expectChildDisposed(child: FakeChild): void {
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
}

describe("Codex app-server test transport cleanup", () => {
	test("releases fake child streams, queued bytes, and listeners", async () => {
		const harness = createHarness();
		const { child } = harness;
		child.stdin.write("queued fixture");
		child.stdout.write("partial frame");
		child.stderr.write("diagnostic fixture");

		await harness.close();

		expectChildDisposed(child);
	});

	test("settles a blocked fake write before destroying child streams", async () => {
		const harness = createHarness();
		harness.child.stdin.blockNext = true;
		harness.child.stdin.write(Buffer.alloc(1_024));
		harness.child.dispose();
		await flushStreams();

		expectChildDisposed(harness.child);
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

	test("emits one terminal exit when stdout ends before the child exit event", async () => {
		const { child, transport, close } = createHarness();
		try {
			const exits: unknown[] = [];
			transport.onExit((event) => exits.push(event));
			const pending = transport.request("turn/steer", {});
			child.stdout.end();
			expect(await captureRejection(pending)).toMatchObject({
				reason: "stdout-error",
				outcome: "outcome_unknown",
				accepted: true,
			});
			await flushStreams();
			expect(exits).toHaveLength(1);
			expect(exits[0]).toMatchObject({ code: null, signal: null });
			child.exit(17, "SIGTERM");
			await flushStreams();
			expect(exits).toHaveLength(1);
			expect(transport.inspect().state).toBe("closed");
		} finally {
			await close();
		}
	});
});
