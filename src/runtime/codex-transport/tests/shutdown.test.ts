import { describe, expect, test } from "bun:test";

import { CodexTransportClosedError, CodexTransportWriteError } from "../errors.js";
import type { TransportServerRequest } from "../server-requests.js";
import {
	captureRejection,
	closeTransport,
	createHarness,
	frameAt,
	flushStreams,
	frames,
	sendJson,
} from "./fake-child.js";

function currentTimeRequest(id: string | number) {
	return { id, method: "currentTime/read", params: { threadId: "thread-1" } };
}

describe("Codex app-server shutdown contract", () => {
	test("returns a bounded internal error for an unhandled reverse request", async () => {
		const { child, transport } = createHarness();
		try {
			sendJson(child, currentTimeRequest("unhandled"));
			await flushStreams();
			expect(frames(child).at(-1)).toEqual({
				id: "unhandled",
				error: { code: -32603, message: "No reverse-request handler is available." },
			});
			expect(transport.inspect().pendingReverseRequests).toBe(0);
		} finally {
			await closeTransport(transport, child);
		}
	});

	test("answers a reverse request that arrives while shutdown is flushing", async () => {
		const { child, transport } = createHarness();
		try {
			let delivered = 0;
			transport.onServerRequest(() => (delivered += 1));
			child.stdin.blockNext = true;
			const regular = transport.sendNotification("initialized");
			const shutdown = transport.shutdown();
			sendJson(child, currentTimeRequest("closing-reverse"));
			await flushStreams();
			expect(delivered).toBe(0);
			child.stdin.release();
			await Promise.all([regular, shutdown]);
			expect(frames(child).findLast((frame) => frame.id === "closing-reverse")).toEqual({
				id: "closing-reverse",
				error: { code: -32603, message: "Codex transport is shutting down." },
			});
		} finally {
			await closeTransport(transport, child);
		}
	});

	test("substitutes a shutdown response when an admitted reverse response has not been written", async () => {
		const { child, transport } = createHarness();
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
			expect(frames(child).filter((frame) => frame.id === "shutdown-substitute")).toEqual([
				{
					id: "shutdown-substitute",
					error: { code: -32603, message: "Codex transport is shutting down." },
				},
			]);
		} finally {
			await closeTransport(transport, child);
		}
	});

	test("rejects a response waiter when its accepted write fails", async () => {
		const { child, transport } = createHarness();
		try {
			let request: TransportServerRequest | undefined;
			transport.onServerRequest((value) => (request = value));
			sendJson(child, currentTimeRequest("write-failure"));
			await flushStreams();
			if (!request) throw new Error("reverse request was not routed");
			child.stdin.failNext = true;
			const response = transport.respond(request, "codex-session", {
				result: { currentTimeAt: 0 },
			});
			const error = await captureRejection(response);
			expect(error).toBeInstanceOf(CodexTransportWriteError);
			expect(error).toMatchObject({ reason: "write-error" });
			expect(transport.inspect()).toMatchObject({ state: "closed", pendingReverseRequests: 0 });
		} finally {
			await closeTransport(transport, child);
		}
	});

	test("preserves late-response diagnostics after shutdown and child failure", async () => {
		const shutdownHarness = createHarness();
		try {
			const controller = new AbortController();
			const late = captureRejection(
				shutdownHarness.transport.request("turn/steer", {}, { signal: controller.signal }),
			);
			const id = frameAt(shutdownHarness.child, 0).id;
			await flushStreams();
			controller.abort();
			await late;
			sendJson(shutdownHarness.child, { id, result: { turnId: "late" } });
			await flushStreams();
			const before = shutdownHarness.transport.inspectLateResponses();
			expect(before).toHaveLength(1);
			expect(Object.isFrozen(before[0])).toBeTrue();
			await shutdownHarness.transport.shutdown();
			expect(shutdownHarness.transport.inspectLateResponses()).toEqual(before);
		} finally {
			await closeTransport(shutdownHarness.transport, shutdownHarness.child);
		}

		const exitHarness = createHarness();
		try {
			const controller = new AbortController();
			const late = captureRejection(
				exitHarness.transport.request("turn/steer", {}, { signal: controller.signal }),
			);
			const id = frameAt(exitHarness.child, 0).id;
			await flushStreams();
			controller.abort();
			await late;
			sendJson(exitHarness.child, { id, result: { turnId: "late-after-exit" } });
			await flushStreams();
			exitHarness.child.exit(1);
			await flushStreams();
			expect(exitHarness.transport.inspectLateResponses()).toHaveLength(1);
		} finally {
			await closeTransport(exitHarness.transport, exitHarness.child);
		}
	});
});
