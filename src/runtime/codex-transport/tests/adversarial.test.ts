import { describe, expect, test } from "bun:test";

import {
	CodexTransportOwnershipError,
	CodexTransportRequestError,
	CodexTransportUsageError,
	CodexTransportWriteError,
} from "../errors.js";
import type { TransportServerRequest } from "../server-requests.js";
import { CODEX_APP_SERVER_CAPACITY } from "../../../shared/codex-app-server-capacity/index.js";
import {
	createIdentityAuthority,
	type IdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	captureRejection,
	closeTransport,
	createHarness,
	frameAt,
	frames,
	flushStreams,
	sendJson,
	sendRaw,
} from "./fake-child.js";

function currentTimeRequest(id: string | number) {
	return { id, method: "currentTime/read", params: { threadId: "thread-1" } };
}

function exactTurnResponse(
	id: string | number,
	payloadBytes: number,
): { frame: Buffer; turnId: string } {
	const prefix = `{"id":${JSON.stringify(id)},"result":{"turnId":"`;
	const suffix = `"}}`;
	const length = payloadBytes - Buffer.byteLength(prefix + suffix, "utf8");
	if (length < 0) throw new Error("payload target is smaller than the response envelope");
	const turnId = "x".repeat(length);
	return { frame: Buffer.from(`${prefix}${turnId}${suffix}`, "utf8"), turnId };
}

function makeMintCountingIdentity(): { identity: IdentityAuthority; minted: () => number } {
	const base = createIdentityAuthority();
	let count = 0;
	const identity: IdentityAuthority = {
		...base,
		issuer: {
			...base.issuer,
			mintJsonRpcRequestId: () => {
				count += 1;
				return base.issuer.mintJsonRpcRequestId();
			},
		},
	};
	return { identity, minted: () => count };
}

function makeLongIdIdentity(): IdentityAuthority {
	const base = createIdentityAuthority();
	const requestId = base.decoder.adoptJsonRpcRequestId("x".repeat(4_096));
	return {
		...base,
		issuer: { ...base.issuer, mintJsonRpcRequestId: () => requestId },
	};
}

describe("Codex app-server transport adversarial public contract", () => {
	test("classifies method frames before response correlation and recovers with protocol errors", async () => {
		const { child, transport } = createHarness();
		try {
			const pending = transport.request("turn/steer", {});
			const id = frameAt(child, 0).id;
			sendJson(child, {
				id,
				method: "currentTime/read",
				params: { threadId: "thread-1" },
				result: { turnId: "wrong-direction" },
			});
			await flushStreams();
			expect(transport.inspect().pendingRequests).toBe(1);
			expect(frames(child).at(-1)).toMatchObject({
				id,
				error: { code: -32600 },
			});
			sendJson(child, { id, result: { turnId: "delivered" } });
			expect((await pending).result).toEqual({ turnId: "delivered" });

			sendJson(child, { id: "unknown", method: "future/reverse", params: {} });
			sendJson(child, { id: "invalid-params", method: "currentTime/read" });
			sendJson(child, {
				id: "missing-owner",
				method: "item/tool/call",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					callId: "call-1",
					namespace: "not-registered",
					tool: "inspect",
					arguments: {},
				},
			});
			sendJson(child, { method: "future/notification", params: {} });
			await flushStreams();
			expect(frames(child).findLast((frame) => frame.id === "unknown")).toMatchObject({
				error: { code: -32601 },
			});
			expect(frames(child).findLast((frame) => frame.id === "invalid-params")).toMatchObject({
				error: { code: -32602 },
			});
			expect(frames(child).findLast((frame) => frame.id === "missing-owner")).toMatchObject({
				error: { code: -32601 },
			});
			expect(frames(child).filter((frame) => frame.id === undefined)).toHaveLength(0);
		} finally {
			await closeTransport(transport, child);
		}
	});

	test("rejects duplicate keys, settles the owner, and preserves escaped-key identity", async () => {
		const { child, transport } = createHarness();
		try {
			const pending = transport.request("turn/steer", {});
			const malformed = captureRejection(pending);
			const id = frameAt(child, 0).id;
			sendRaw(
				child,
				`{"id":${JSON.stringify(id)},"result":{"turnId":"first"},"result":{"turnId":"second"}}`,
			);
			await flushStreams();
			const malformedError = await malformed;
			expect(malformedError).toMatchObject({
				name: "CodexTransportRequestError",
				reason: "malformed-response",
				outcome: "outcome_unknown",
			});
			expect(transport.inspect().pendingRequests).toBe(0);
			expect(transport.inspectIssues()).toContainEqual(
				expect.objectContaining({ kind: "duplicate-key" }),
			);
			const recovered = transport.request("turn/steer", {});
			const recoveredId = frameAt(child, 1).id;
			sendJson(child, { id: recoveredId, result: { turnId: "recovered" } });
			expect((await recovered).result).toEqual({ turnId: "recovered" });

			sendRaw(
				child,
				'{"params":{"threadId":"a","thr\\u0065adId":"b"},"method":"currentTime/read","id":"nested-duplicate"}',
			);
			await flushStreams();
			expect(frames(child).at(-1)).toMatchObject({
				id: "nested-duplicate",
				error: { code: -32600 },
			});
		} finally {
			await closeTransport(transport, child);
		}
	});

	test("keeps numeric and string reverse ids distinct and writes their original types", async () => {
		const { child, identity, transport } = createHarness();
		try {
			const seen: TransportServerRequest[] = [];
			transport.onServerRequest((request) => seen.push(request));
			sendJson(child, currentTimeRequest(1));
			sendJson(child, currentTimeRequest("1"));
			await flushStreams();
			expect(seen).toHaveLength(2);
			expect(identity.decoder.serializeJsonRpcRequestId(seen[0]!.requestId)).toBe(1);
			expect(identity.decoder.serializeJsonRpcRequestId(seen[1]!.requestId)).toBe("1");
			expect(seen[0]!.requestId).not.toBe(seen[1]!.requestId);
			await Promise.all(
				seen.map((request) =>
					transport.respond(request, "codex-session", { result: { currentTimeAt: 0 } }),
				),
			);
			expect(
				frames(child)
					.filter((frame) => frame.result !== undefined)
					.map((frame) => frame.id),
			).toEqual([1, "1"]);
		} finally {
			await closeTransport(transport, child);
		}
	});

	test("validates method-specific reverse results and leaves a rejected response retryable", async () => {
		const registrations = [
			{ owner: "codex-dynamic-tools", namespace: "archboard_app", manifestHash: "manifest" },
		] as const;
		const { child, transport } = createHarness(registrations);
		try {
			let request: Parameters<typeof transport.respond>[0] | undefined;
			transport.onServerRequest((value) => {
				request = value;
			});
			sendJson(child, {
				id: "dynamic-1",
				method: "item/tool/call",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					callId: "call-1",
					namespace: "archboard_app",
					tool: "inspect",
					arguments: {},
				},
			});
			await flushStreams();
			if (!request) throw new Error("dynamic request was not routed");
			expect(
				await captureRejection(
					transport.respond(request, "codex-coordinator-tools", {
						result: { contentItems: [{ type: "inputText", text: "ok" }], success: true },
					}),
				),
			).toBeInstanceOf(CodexTransportOwnershipError);
			expect(
				await captureRejection(
					transport.respond(request, "codex-dynamic-tools", {
						result: { contentItems: [], success: true },
					}),
				),
			).toBeInstanceOf(CodexTransportUsageError);
			await transport.respond(request, "codex-dynamic-tools", {
				result: { contentItems: [{ type: "inputText", text: "ok" }], success: true },
			});
			expect(frames(child).at(-1)).toMatchObject({ id: "dynamic-1", result: { success: true } });
			sendJson(child, {
				id: "dynamic-null-namespace",
				method: "item/tool/call",
				params: {
					threadId: "thread-1",
					turnId: "turn-1",
					callId: "call-null",
					namespace: null,
					tool: "inspect",
					arguments: {},
				},
			});
			await flushStreams();
			expect(
				frames(child).findLast((frame) => frame.id === "dynamic-null-namespace"),
			).toMatchObject({ error: { code: -32602 } });
		} finally {
			await closeTransport(transport, child);
		}
	});

	test("settles owned reverse work during shutdown and redacts remote and late payloads", async () => {
		const shutdownHarness = createHarness();
		try {
			let request: TransportServerRequest | undefined;
			shutdownHarness.transport.onServerRequest((value) => (request = value));
			sendJson(shutdownHarness.child, currentTimeRequest("shutdown-owned"));
			await flushStreams();
			if (!request) throw new Error("shutdown request was not routed");
			await shutdownHarness.transport.shutdown();
			expect(frames(shutdownHarness.child).at(-1)).toMatchObject({
				id: "shutdown-owned",
				error: { code: -32603 },
			});
		} finally {
			await closeTransport(shutdownHarness.transport, shutdownHarness.child);
		}

		const { child, transport } = createHarness();
		try {
			const remote = captureRejection(transport.request("turn/steer", {}));
			const remoteId = frameAt(child, 0).id;
			sendJson(child, {
				id: remoteId,
				error: { code: -32000, message: "m".repeat(10_000), data: { secret: "x".repeat(10_000) } },
			});
			const remoteError = await remote;
			expect(remoteError).toMatchObject({
				rpcError: { code: -32000, dataPresent: true },
			});
			expect(
				(remoteError as { rpcError: { message: string } }).rpcError.message.length,
			).toBeLessThanOrEqual(CODEX_APP_SERVER_CAPACITY.text.maxChars);

			const controller = new AbortController();
			const lateRequest = captureRejection(
				transport.request("turn/steer", {}, { signal: controller.signal }),
			);
			await flushStreams();
			const lateId = frameAt(child, 1).id;
			controller.abort();
			await lateRequest;
			sendJson(child, { id: lateId, result: { turnId: "z".repeat(8_192) } });
			await flushStreams();
			expect(transport.inspectLateResponses()).toContainEqual(
				expect.objectContaining({
					kind: "redacted",
					payload: expect.objectContaining({ reason: "retained-size" }),
				}),
			);
		} finally {
			await closeTransport(transport, child);
		}

		const longId = createHarness(undefined, makeLongIdIdentity());
		try {
			const controller = new AbortController();
			const lateRequest = captureRejection(
				longId.transport.request("turn/steer", {}, { signal: controller.signal }),
			);
			const lateId = frameAt(longId.child, 0).id;
			controller.abort();
			await lateRequest;
			sendJson(longId.child, { id: lateId, result: { turnId: "late" } });
			await flushStreams();
			const retained = longId.transport.inspectLateResponses()[0];
			expect(retained?.kind).toBe("redacted");
			expect(Buffer.byteLength(JSON.stringify(retained), "utf8")).toBeLessThanOrEqual(
				CODEX_APP_SERVER_CAPACITY.retention.lateResponseRecordBytes,
			);
		} finally {
			await closeTransport(longId.transport, longId.child);
		}
	});

	test("checks the pending-request cap before minting another wire id", async () => {
		const counted = makeMintCountingIdentity();
		const { child, transport } = createHarness(undefined, counted.identity);
		try {
			child.stdin.blockNext = true;
			const pending = Array.from(
				{ length: CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests },
				() => transport.request("turn/steer", {}).catch((error: unknown) => error),
			);
			expect(transport.inspect().pendingRequests).toBe(
				CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests,
			);
			expect(counted.minted()).toBe(CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests);
			const overflow = await captureRejection(transport.request("turn/steer", {}));
			expect(overflow).toBeInstanceOf(CodexTransportWriteError);
			expect((overflow as CodexTransportWriteError).reason).toBe("backpressure");
			expect(counted.minted()).toBe(CODEX_APP_SERVER_CAPACITY.outbound.pendingRequests);
			child.stdin.release();
			await transport.shutdown();
			await Promise.all(pending);
		} finally {
			await closeTransport(transport, child);
		}
	});

	test("prioritizes response writes and retries an admitted response after reserve pressure", async () => {
		const { child, transport } = createHarness();
		try {
			child.stdin.blockNext = true;
			const firstRegular = transport.sendNotification("initialized");
			const secondRegular = transport.sendNotification("initialized");
			let request: Parameters<typeof transport.respond>[0] | undefined;
			transport.onServerRequest((value) => (request = value));
			sendJson(child, currentTimeRequest("priority"));
			await flushStreams();
			if (!request) throw new Error("priority request was not routed");
			const response = transport.respond(request, "codex-session", {
				result: { currentTimeAt: 0 },
			});
			child.stdin.release();
			await Promise.all([firstRegular, secondRegular, response]);
			expect(frames(child).slice(0, 3)).toEqual([
				{ method: "initialized" },
				{ id: "priority", result: { currentTimeAt: 0 } },
				{ method: "initialized" },
			]);
		} finally {
			await closeTransport(transport, child);
		}

		const second = createHarness();
		try {
			const requests: Parameters<typeof second.transport.respond>[0][] = [];
			const responses: Promise<void>[] = [];
			second.transport.onServerRequest((request) => requests.push(request));
			second.child.stdin.blockNext = true;
			for (
				let index = 0;
				index < CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames;
				index += 1
			) {
				sendJson(second.child, currentTimeRequest(`reserve-${index}`));
				await flushStreams();
				const request = requests.at(-1);
				if (!request) throw new Error("reserve request was not routed");
				responses.push(
					second.transport.respond(request, "codex-session", { result: { currentTimeAt: 0 } }),
				);
			}
			await flushStreams();
			expect(second.transport.inspect().responseQueuedFrames).toBe(
				CODEX_APP_SERVER_CAPACITY.outbound.responseReservedFrames,
			);
			sendJson(second.child, currentTimeRequest("reserve-retry"));
			await flushStreams();
			const last = requests.at(-1);
			if (!last) throw new Error("retry request was not routed");
			const rejected = await captureRejection(
				second.transport.respond(last, "codex-session", { result: { currentTimeAt: 0 } }),
			);
			expect(rejected).toBeInstanceOf(CodexTransportWriteError);
			expect((rejected as CodexTransportWriteError).reason).toBe("backpressure");
			second.child.stdin.release();
			await Promise.all(responses);
			await second.transport.respond(last, "codex-session", { result: { currentTimeAt: 0 } });
		} finally {
			await closeTransport(second.transport, second.child);
		}
	});

	test("accepts exact frame ceilings, then closes the child epoch on the first oversized byte", async () => {
		const boundary = createHarness();
		try {
			for (const target of [
				CODEX_APP_SERVER_CAPACITY.frameBytes - 1,
				CODEX_APP_SERVER_CAPACITY.frameBytes,
			]) {
				const pending = boundary.transport.request("turn/steer", {});
				const id = frameAt(boundary.child, frames(boundary.child).length - 1).id;
				const response = exactTurnResponse(id as string | number, target);
				boundary.child.stdout.write(response.frame.subarray(0, 17));
				boundary.child.stdout.write(response.frame.subarray(17));
				boundary.child.stdout.write("\n");
				expect((await pending).result).toEqual({ turnId: response.turnId });
			}
		} finally {
			await closeTransport(boundary.transport, boundary.child);
		}

		const fatal = createHarness();
		try {
			const pending = captureRejection(fatal.transport.request("turn/steer", {}));
			fatal.child.stdout.write(Buffer.alloc(CODEX_APP_SERVER_CAPACITY.partialFrameBytes + 1, 0x78));
			await flushStreams();
			const error = await pending;
			expect(error).toBeInstanceOf(CodexTransportRequestError);
			expect(error).toMatchObject({
				reason: "frame-too-large",
				outcome: "outcome_unknown",
				accepted: true,
			});
			expect(fatal.transport.inspect().state).toBe("closed");
			expect(fatal.transport.inspectIssues()).toContainEqual(
				expect.objectContaining({ kind: "oversized-frame" }),
			);
			fatal.child.stdout.emit(
				"data",
				Buffer.from('{"id":"ignored","result":{"turnId":"ignored"}}\n'),
			);
			await flushStreams();
			expect(
				fatal.transport.inspectIssues().filter((issue) => issue.kind === "oversized-frame"),
			).toHaveLength(1);
		} finally {
			await closeTransport(fatal.transport, fatal.child);
		}
	});

	test("bounds diagnostics, isolates listener failures, and detaches all input after shutdown", async () => {
		const { child, transport } = createHarness();
		try {
			const issueUnsubscribe = transport.onIssue(() => {
				throw new Error("listener fixture");
			});
			expect(() => transport.onIssue(() => undefined)).toThrow(CodexTransportUsageError);
			child.stdout.write("\r\n");
			child.stderr.write(Buffer.alloc(32_768, 0x68));
			child.stderr.write(Buffer.alloc(32_768, 0x74));
			await flushStreams();
			issueUnsubscribe();
			expect(transport.inspectIssues()).toContainEqual(
				expect.objectContaining({ kind: "listener-error" }),
			);
			expect(transport.inspectStderr()).toMatchObject({
				retainedBytes: CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes,
				text: `${"h".repeat(32_768)}${"t".repeat(32_768)}`,
			});

			const requestCount = { value: 0 };
			transport.onServerNotification(() => (requestCount.value += 1));
			const shutdown = transport.shutdown();
			expect(transport.inspect().state).toBe("closing");
			await shutdown;
			child.stdout.emit(
				"data",
				Buffer.from(
					'{"method":"thread/realtime/closed","params":{"threadId":"x","reason":null}}\n',
				),
			);
			await flushStreams();
			expect(requestCount.value).toBe(0);
			expect(transport.inspect().state).toBe("closed");
			await transport.shutdown();
		} finally {
			await closeTransport(transport, child);
		}
	});
});
