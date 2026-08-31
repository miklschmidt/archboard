import { describe, expect, test } from "bun:test";

import { CodexTransportClosedError, type TransportServerRequest } from "../index.js";
import { closeTransport, createHarness, flushStreams, frames, sendJson } from "./fake-child.js";

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("Expected the operation to reject");
}

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
			await closeTransport(transport);
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
			await closeTransport(transport);
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
			await closeTransport(transport);
		}
	});
});
