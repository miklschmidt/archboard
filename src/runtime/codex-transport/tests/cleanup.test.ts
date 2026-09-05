import { describe, expect, test } from "bun:test";

import { CodexTransportClosedError, CodexTransportWriteError } from "../errors.js";
import type { TransportServerRequest } from "../server-requests.js";
import {
	captureRejection,
	createHarness,
	frameAt,
	frames,
	flushStreams,
	sendJson,
	type FakeChild,
} from "./fake-child.js";

function currentTimeRequest(id: string | number) {
	return { id, method: "currentTime/read", params: { threadId: "thread-1" } };
}

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

	test("settles reverse requests that have no owner or arrive during the shutdown flush", async () => {
		const unhandled = createHarness();
		try {
			sendJson(unhandled.child, currentTimeRequest("unhandled"));
			await flushStreams();
			expect(frames(unhandled.child).at(-1)).toEqual({
				id: "unhandled",
				error: { code: -32603, message: "No reverse-request handler is available." },
			});
			expect(unhandled.transport.inspect().pendingReverseRequests).toBe(0);
		} finally {
			await unhandled.close();
		}

		const flushing = createHarness();
		try {
			let delivered = 0;
			flushing.transport.onServerRequest(() => (delivered += 1));
			flushing.child.stdin.blockNext = true;
			const regular = flushing.transport.sendNotification("initialized");
			const shutdown = flushing.transport.shutdown();
			sendJson(flushing.child, currentTimeRequest("closing-reverse"));
			await flushStreams();
			expect(delivered).toBe(0);
			flushing.child.stdin.release();
			await Promise.all([regular, shutdown]);
			expect(frames(flushing.child).findLast((frame) => frame["id"] === "closing-reverse")).toEqual({
				id: "closing-reverse",
				error: { code: -32603, message: "Codex transport is shutting down." },
			});
		} finally {
			await flushing.close();
		}
	});

	test("substitutes shutdown for an admitted unwritten response", async () => {
		const { child, transport, close } = createHarness();
		try {
			child.stdin.blockNext = true;
			const regular = transport.sendNotification("initialized");
			let request: TransportServerRequest | undefined;
			transport.onServerRequest((value) => (request = value));
			sendJson(child, currentTimeRequest("shutdown-substitute"));
			await flushStreams();
			if (!request) throw new Error("reverse request was not routed");
			const response = transport.respond(request, "codex-session", {
				result: { currentTimeAt: 0 },
			});
			const shutdown = transport.shutdown();
			child.stdin.release();
			expect(await captureRejection(response)).toBeInstanceOf(CodexTransportClosedError);
			await Promise.all([regular, shutdown]);
			expect(frames(child).filter((frame) => frame["id"] === "shutdown-substitute")).toEqual([
				{
					id: "shutdown-substitute",
					error: { code: -32603, message: "Codex transport is shutting down." },
				},
			]);
		} finally {
			await close();
		}
	});

	test("closes after an accepted reverse-response write fails", async () => {
		const { child, transport, close } = createHarness();
		try {
			let request: TransportServerRequest | undefined;
			transport.onServerRequest((value) => (request = value));
			sendJson(child, currentTimeRequest("write-failure"));
			await flushStreams();
			if (!request) throw new Error("reverse request was not routed");
			child.stdin.failNext = true;
			const error = await captureRejection(
				transport.respond(request, "codex-session", { result: { currentTimeAt: 0 } }),
			);
			expect(error).toBeInstanceOf(CodexTransportWriteError);
			expect(error).toMatchObject({ reason: "write-error" });
			expect(transport.inspect()).toMatchObject({ state: "closed", pendingReverseRequests: 0 });
		} finally {
			await close();
		}
	});

	test("retains late-response diagnostics across shutdown and child exit", async () => {
		for (const terminal of ["shutdown", "exit"] as const) {
			const harness = createHarness();
			try {
				const controller = new AbortController();
				const late = captureRejection(
					harness.transport.request("turn/steer", {}, { signal: controller.signal }),
				);
				const id = frameAt(harness.child, 0)["id"];
				await flushStreams();
				controller.abort();
				await late;
				sendJson(harness.child, { id, result: { turnId: `late-after-${terminal}` } });
				await flushStreams();
				const before = harness.transport.inspectLateResponses();
				expect(before).toHaveLength(1);
				expect(Object.isFrozen(before[0])).toBeTrue();
				if (terminal === "shutdown") await harness.transport.shutdown();
				else harness.child.exit(1);
				await flushStreams();
				expect(harness.transport.inspectLateResponses()).toEqual(before);
			} finally {
				await harness.close();
			}
		}
	});
});
