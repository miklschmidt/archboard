import { existsSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import {
	CLIENT_NOTIFICATION_METHODS,
	CODEX_PROTOCOL_GENERATED_FILE_COUNT,
	CODEX_PROTOCOL_GENERATED_TREE_SHA256,
	CODEX_PROTOCOL_VERSION,
	ProtocolDecodeError,
	RESPONSE_METHODS,
	SERVER_NOTIFICATION_METHODS,
	SERVER_REQUEST_METHODS,
	decodeClientNotification,
	decodeInitializeParams,
	decodeJsonRpcError,
	decodeLoginAccountParams,
	decodeResponse,
	decodeResponseEnvelope,
	decodeServerNotification,
	decodeServerRequest,
	digestGeneratedTree,
} from "../index.js";
import {
	clientNotificationFixtures,
	notificationFixture,
	responseFixtures,
	serverRequestFixtures,
} from "./fixtures.js";

const GENERATED_ROOT = new URL("../generated/", import.meta.url).pathname;

describe("codex 0.151.0 manifest", () => {
	test("records the exact generated tree when the ignored output is present", () => {
		if (!existsSync(GENERATED_ROOT)) return;
		const digest = digestGeneratedTree(GENERATED_ROOT);
		expect(digest.fileCount).toBe(CODEX_PROTOCOL_GENERATED_FILE_COUNT);
		expect(digest.sha256).toBe(CODEX_PROTOCOL_GENERATED_TREE_SHA256);
	});
});

describe("public response boundary", () => {
	for (const method of RESPONSE_METHODS)
		test(`decodes ${method}`, () => {
			expect(decodeResponse(method, responseFixtures[method]) as unknown).toEqual(
				responseFixtures[method],
			);
		});

	test("retains JSON-RPC result identity and decodes the result payload", () => {
		expect(
			decodeResponseEnvelope("turn/steer", { id: 7, result: responseFixtures["turn/steer"] }),
		).toEqual({
			id: 7,
			result: { turnId: "turn-1" },
		});
	});
});

describe("public notification boundary", () => {
	for (const method of SERVER_NOTIFICATION_METHODS)
		test(`decodes ${method}`, () => {
			const input = { method, params: notificationFixture(method), emittedAtMs: 42 };
			expect(decodeServerNotification(input) as unknown).toEqual(input);
		});

	for (const method of CLIENT_NOTIFICATION_METHODS)
		test(`decodes client ${method}`, () => {
			expect(decodeClientNotification(clientNotificationFixtures[method]) as unknown).toEqual(
				clientNotificationFixtures[method],
			);
		});

	test("accepts notifications from older servers without emittedAtMs", () => {
		expect(
			decodeServerNotification({
				method: "thread/realtime/closed",
				params: { threadId: "thread-1", reason: null },
			}),
		).toEqual({ method: "thread/realtime/closed", params: { threadId: "thread-1", reason: null } });
	});
});

describe("reverse request boundary", () => {
	for (const method of SERVER_REQUEST_METHODS.filter(
		(candidateMethod) =>
			candidateMethod !== "account/chatgptAuthTokens/refresh" &&
			candidateMethod !== "attestation/generate",
	))
		test(`decodes ${method}`, () => {
			const input = { id: 1, method, params: serverRequestFixtures[method] };
			expect(decodeServerRequest(input) as unknown).toEqual({ ...input });
		});

	test("decodes JSON-RPC errors with their original id and data", () => {
		const error = {
			id: 3,
			error: { code: -32602, message: "invalid params", data: { field: "threadId" } },
		};
		expect(decodeJsonRpcError(error, "thread/start")).toEqual(error);
	});
});

describe("fail-closed diagnostics", () => {
	test("names unknown response methods", () => {
		let thrown: unknown;
		try {
			decodeResponse("thread/future", {});
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(ProtocolDecodeError);
		expect(thrown).toMatchObject({
			method: "thread/future",
			direction: "response",
			expectedVersion: CODEX_PROTOCOL_VERSION,
		});
		expect((thrown as Error).message).toContain("Recovery:");
	});

	test("rejects malformed required response fields", () => {
		expect(() => decodeResponse("thread/list", { data: [] })).toThrow(ProtocolDecodeError);
	});

	test("rejects unknown discriminated thread status members", () => {
		expect(() =>
			decodeServerNotification({
				method: "thread/status/changed",
				params: { threadId: "thread-1", status: { type: "futureStatus" } },
			}),
		).toThrow(ProtocolDecodeError);
	});

	test("rejects unknown realtime item members without reducing the item", () => {
		expect(() =>
			decodeServerNotification({
				method: "thread/realtime/item/started",
				params: {
					threadId: "thread-1",
					item: { id: "item", realtimeSessionId: "session", type: "futureRealtimeItem" },
				},
			}),
		).toThrow(ProtocolDecodeError);
	});

	test("rejects initialize responses from a different Codex version", () => {
		expect(() =>
			decodeResponse("initialize", {
				userAgent: "Codex Desktop/0.150.0",
				codexHome: "/tmp/codex",
				platformFamily: "unix",
				platformOs: "linux",
			}),
		).toThrow(ProtocolDecodeError);
	});

	test("requires the authored initialize capabilities", () => {
		expect(() =>
			decodeInitializeParams({
				clientInfo: { name: "archboard", title: null, version: "0.1.0" },
				capabilities: { experimentalApi: true, requestAttestation: true },
			}),
		).toThrow(ProtocolDecodeError);
	});

	test("refuses unsupported login variants with a recovery action", () => {
		let thrown: unknown;
		try {
			decodeLoginAccountParams({ type: "chatgptDeviceCode" });
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(ProtocolDecodeError);
		expect(thrown).toMatchObject({ method: "account/login/start", direction: "client-request" });
		expect((thrown as Error).message).toContain("visual login flow");
	});

	for (const method of ["attestation/generate", "account/chatgptAuthTokens/refresh"] as const)
		test(`refuses unsupported server capability ${method}`, () => {
			expect(() =>
				decodeServerRequest({ id: 1, method, params: serverRequestFixtures[method] }),
			).toThrow(ProtocolDecodeError);
		});

	test("rejects unknown methods in every envelope direction", () => {
		expect(() => decodeClientNotification({ method: "future/notification" })).toThrow(
			ProtocolDecodeError,
		);
		expect(() => decodeServerNotification({ method: "future/notification", params: {} })).toThrow(
			ProtocolDecodeError,
		);
		expect(() => decodeServerRequest({ id: 1, method: "future/request", params: {} })).toThrow(
			ProtocolDecodeError,
		);
	});
});

describe("raw realtime preservation", () => {
	test("does not invent phase or transcript state", () => {
		const input = {
			method: "thread/realtime/transcript/delta",
			params: { threadId: "thread-1", role: "assistant", delta: "raw delta" },
			emittedAtMs: 99,
		};
		const decoded = decodeServerNotification(input);
		expect(decoded as unknown).toEqual(input);
		expect(decoded).not.toHaveProperty("phase");
		expect(decoded.params).not.toHaveProperty("transcript");
	});

	test("keeps item-scoped realtime identity and presentation untouched", () => {
		const input = {
			method: "thread/realtime/item/completed",
			params: {
				threadId: "thread-1",
				item: {
					id: "realtime-item-1",
					realtimeSessionId: "realtime-1",
					type: "bemItemPromoted",
					turnId: "turn-1",
					itemId: "item-1",
					presentation: { type: "inlineVisualization", index: 0 },
				},
			},
		};
		expect(decodeServerNotification(input) as unknown).toEqual(input);
	});
});
