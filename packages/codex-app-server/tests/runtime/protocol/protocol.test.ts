import { describe, expect, test } from "bun:test";

import {
	CLIENT_NOTIFICATION_METHODS,
	RESPONSE_METHODS,
	SERVER_NOTIFICATION_METHODS,
	SERVER_REQUEST_METHODS,
} from "#runtime/protocol/protocol-methods.ts";
import { CODEX_PROTOCOL_VERSION } from "#runtime/protocol/protocol-version.ts";
import {
	FunctionCallOutputContentItemSchema,
	UserInputSchema,
} from "#runtime/schemas/core-schemas.ts";
import {
	ProtocolDecodeError,
	decodeClientNotification,
	decodeJsonRpcError,
	decodeLoginAccountParams,
	decodeResponse,
	decodeResponseEnvelope,
	decodeServerNotification,
	decodeServerRequest,
} from "#runtime/protocol/protocol-decoder.ts";
import {
	clientNotificationFixtures,
	responseFixtures,
	serverRequestFixtures,
} from "#tests/runtime/support/protocol-fixtures.ts";
import {
	notificationFixture,
	serverNotificationFixtures,
} from "#tests/runtime/support/notification-fixtures.ts";
describe("image references", () => {
	test("an image names exactly one of an inline URL and an uploaded file", () => {
		expect(UserInputSchema.parse({ type: "image", url: "https://x.test/a.png" })).toEqual({
			type: "image",
			url: "https://x.test/a.png",
		});
		expect(UserInputSchema.parse({ type: "image", fileId: "file-1" })).toEqual({
			type: "image",
			fileId: "file-1",
		});
		expect(
			FunctionCallOutputContentItemSchema.parse({ type: "input_image", file_id: "file-1" }),
		).toEqual({ type: "input_image", file_id: "file-1" });
		expect(UserInputSchema.safeParse({ type: "image" }).success).toBe(false);
		expect(UserInputSchema.safeParse({ type: "image", url: "u", fileId: "f" }).success).toBe(false);
		expect(FunctionCallOutputContentItemSchema.safeParse({ type: "input_image" }).success).toBe(
			false,
		);
	});
});

describe("public response boundary", () => {
	for (const method of RESPONSE_METHODS) {
		test(`decodes ${method}`, () => {
			expect(decodeResponse(method, responseFixtures[method]) as unknown).toEqual(
				responseFixtures[method],
			);
		});
	}

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
	for (const method of SERVER_NOTIFICATION_METHODS) {
		test(`decodes ${method}`, () => {
			const input = { method, params: notificationFixture(method), emittedAtMs: 42 };
			expect(decodeServerNotification(input) as unknown).toEqual(input);
		});
	}

	for (const method of SERVER_NOTIFICATION_METHODS) {
		test(`rejects an incomplete ${method}`, () => {
			const fixture = serverNotificationFixtures[method];
			const malformed = Object.keys(fixture as object).length
				? Object.fromEntries(Object.entries(fixture as Record<string, unknown>).slice(1))
				: { unexpected: true };
			expect(() => decodeServerNotification({ method, params: malformed })).toThrow(
				ProtocolDecodeError,
			);
		});
	}

	for (const method of CLIENT_NOTIFICATION_METHODS) {
		test(`decodes client ${method}`, () => {
			expect(decodeClientNotification(clientNotificationFixtures[method]) as unknown).toEqual(
				clientNotificationFixtures[method],
			);
		});
	}

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
	)) {
		test(`decodes ${method}`, () => {
			const input = { id: 1, method, params: serverRequestFixtures[method] };
			expect(decodeServerRequest(input) as unknown).toEqual({ ...input });
		});
	}

	test("decodes JSON-RPC errors with their original id and data", () => {
		const error = {
			id: 3,
			error: { code: -32602, message: "invalid params", data: { field: "threadId" } },
		};
		expect(decodeJsonRpcError(error, "thread/start")).toEqual(error);
	});

	test("rejects a JSON-RPC object that contains both result and error", () => {
		expect(() =>
			decodeJsonRpcError({
				id: 3,
				result: {},
				error: { code: -32602, message: "invalid params" },
			}),
		).toThrow(ProtocolDecodeError);
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

	test("rejects a response envelope that contains both result and error", () => {
		expect(() =>
			decodeResponseEnvelope("turn/steer", {
				id: 7,
				result: { turnId: "turn-1" },
				error: { code: -32602, message: "invalid params" },
			}),
		).toThrow(ProtocolDecodeError);
	});

	test("rejects extra fields on every public envelope boundary", () => {
		expect(() => decodeClientNotification({ method: "initialized", extra: true })).toThrow(
			ProtocolDecodeError,
		);
		expect(() =>
			decodeServerNotification({
				method: "thread/realtime/closed",
				params: notificationFixture("thread/realtime/closed"),
				extra: true,
			}),
		).toThrow(ProtocolDecodeError);
		expect(() =>
			decodeServerRequest({
				id: 1,
				method: "currentTime/read",
				params: serverRequestFixtures["currentTime/read"],
				extra: true,
			}),
		).toThrow(ProtocolDecodeError);
		expect(() =>
			decodeResponseEnvelope("turn/steer", {
				id: 7,
				result: responseFixtures["turn/steer"],
				extra: true,
			}),
		).toThrow(ProtocolDecodeError);
		expect(() =>
			decodeJsonRpcError({
				id: 3,
				error: { code: -32602, message: "invalid params" },
				extra: true,
			}),
		).toThrow(ProtocolDecodeError);
		expect(() =>
			decodeJsonRpcError({
				id: 3,
				error: { code: -32602, message: "invalid params", extra: true },
			}),
		).toThrow(ProtocolDecodeError);
	});

	test("rejects unknown members of security-sensitive request unions", () => {
		expect(() =>
			decodeServerRequest({
				id: 1,
				method: "item/commandExecution/requestApproval",
				params: {
					...(serverRequestFixtures["item/commandExecution/requestApproval"] as Record<
						string,
						unknown
					>),
					availableDecisions: ["futureDecision"],
				},
			}),
		).toThrow(ProtocolDecodeError);
		expect(() =>
			decodeServerRequest({
				id: 1,
				method: "item/permissions/requestApproval",
				params: {
					...(serverRequestFixtures["item/permissions/requestApproval"] as Record<string, unknown>),
					permissions: {
						network: null,
						fileSystem: {
							read: null,
							write: null,
							entries: [{ path: { type: "future" }, access: "read" }],
						},
					},
				},
			}),
		).toThrow(ProtocolDecodeError);
	});

	test("accepts every command approval decision and permission branch", () => {
		const params = {
			...(serverRequestFixtures["item/commandExecution/requestApproval"] as Record<
				string,
				unknown
			>),
			networkApprovalContext: { host: "example.test", protocol: "https" },
			additionalPermissions: {
				network: { enabled: true },
				fileSystem: {
					read: ["/tmp/archboard"],
					write: null,
					globScanMaxDepth: 2,
					entries: [
						{
							path: {
								type: "special",
								value: { kind: "project_roots", subpath: null },
							},
							access: "read",
						},
					],
				},
			},
			proposedExecpolicyAmendment: ["prefix_rule"],
			proposedNetworkPolicyAmendments: [{ host: "example.test", action: "allow" }],
			availableDecisions: [
				"accept",
				"acceptForSession",
				{ acceptWithExecpolicyAmendment: { execpolicy_amendment: ["prefix_rule"] } },
				{
					applyNetworkPolicyAmendment: {
						network_policy_amendment: { host: "example.test", action: "deny" },
					},
				},
				"decline",
				"cancel",
			],
		};
		const input = { id: 1, method: "item/commandExecution/requestApproval", params } as const;
		expect(decodeServerRequest(input) as unknown).toEqual(input);
	});

	test("rejects unknown config security enums on the response graph", () => {
		const configResponse = responseFixtures["config/read"] as {
			config: Record<string, unknown>;
			origins: Record<string, unknown>;
			layers: null;
		};
		expect(() =>
			decodeResponse("config/read", {
				...configResponse,
				config: { ...configResponse.config, forced_login_method: "future" },
			}),
		).toThrow(ProtocolDecodeError);
	});

	test("rejects unknown network policy values", () => {
		expect(() =>
			decodeServerRequest({
				id: 1,
				method: "item/commandExecution/requestApproval",
				params: {
					...(serverRequestFixtures["item/commandExecution/requestApproval"] as Record<
						string,
						unknown
					>),
					networkApprovalContext: { host: "example.test", protocol: "ftp" },
					proposedNetworkPolicyAmendments: [{ host: "example.test", action: "future" }],
				},
			}),
		).toThrow(ProtocolDecodeError);
	});

	test("rejects unknown notification union variants", () => {
		expect(() =>
			decodeServerNotification({
				method: "item/autoApprovalReview/started",
				params: {
					...(notificationFixture("item/autoApprovalReview/started") as Record<string, unknown>),
					action: { type: "futureAction" },
				},
			}),
		).toThrow(ProtocolDecodeError);
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

	test("does not let a reserved JSON key supply inherited login fields", () => {
		const payload = JSON.parse('{"__proto__":{"type":"apiKey","apiKey":"inherited-secret"}}');

		expect(Object.hasOwn(payload, "__proto__")).toBeTrue();
		expect(() => decodeLoginAccountParams(payload)).toThrow(ProtocolDecodeError);
	});

	for (const method of ["attestation/generate", "account/chatgptAuthTokens/refresh"] as const) {
		test(`refuses unsupported server capability ${method}`, () => {
			expect(() =>
				decodeServerRequest({ id: 1, method, params: serverRequestFixtures[method] }),
			).toThrow(ProtocolDecodeError);
		});
	}

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
