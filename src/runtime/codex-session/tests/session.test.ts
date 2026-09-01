import {
	CODEX_SESSION_CONTROL,
	CodexSessionError,
	CodexSessionMutationError,
	type ControlledCodexSession,
	type SessionLoginParams,
} from "../index.js";
import { describe, expect, test } from "bun:test";
import {
	CodexTransportRemoteError,
	CodexTransportRequestError,
} from "../../codex-transport/errors.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import {
	createSessionFixture,
	emptyResponse,
	makeNotification,
	reverseRequest,
	type SessionFixture,
} from "./support.js";

async function rejected(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected the promise to reject");
}

async function readyFixture(): Promise<SessionFixture> {
	const fixture = createSessionFixture();
	await fixture.session.initialize();
	fixture.transport.enqueueResponse("account/read", {
		account: { type: "chatgpt", email: null, planType: "pro" },
		requiresOpenaiAuth: true,
	});
	await fixture.session.accountRead();
	return fixture;
}

describe("typed Codex session", () => {
	test("leaves notification and reverse-request listeners to composition when configured", async () => {
		const fixture = createSessionFixture({ listenerOwnership: "composition" });
		try {
			fixture.transport.emitNotification(makeNotification(fixture) as TransportServerNotification);
			fixture.transport.emitServerRequest(
				reverseRequest(fixture, "account/chatgptAuthTokens/refresh", {}),
			);
			await Promise.resolve();
			expect(fixture.events).toEqual([]);
			expect(fixture.transport.reverseResponses).toEqual([]);
		} finally {
			(fixture.session as ControlledCodexSession)[CODEX_SESSION_CONTROL].dispose();
			fixture.close();
		}
	});

	test("emits the authored initialize policy and buffers notifications until storage proof", async () => {
		const fixture = createSessionFixture({ now: () => 12_345 });
		fixture.transport.beforeRequest = (method) => {
			if (method === "initialize")
				fixture.transport.emitNotification(
					makeNotification(fixture) as TransportServerNotification,
				);
		};
		fixture.transport.beforeNotificationWrite = () => {
			fixture.transport.emitNotification(
				makeNotification(
					fixture,
					"thread/realtime/transcript/delta",
				) as TransportServerNotification,
			);
		};
		const initialized = await fixture.session.initialize();
		expect(initialized.codexHome).toBe(fixture.storage.codexHome);
		expect(fixture.transport.notifications).toEqual(["initialized"]);
		expect(fixture.transport.requests.map(({ method }) => method)).toEqual([
			"initialize",
			"configRequirements/read",
			"config/read",
		]);
		expect(fixture.transport.requests[0]?.params).toEqual({
			clientInfo: { name: "archboard", title: "archboard canvas", version: "0.1.0" },
			capabilities: {
				experimentalApi: true,
				requestAttestation: false,
				mcpServerOpenaiFormElicitation: true,
				optOutNotificationMethods: [],
				extensions: {},
			},
		});
		expect(fixture.transport.requests[1]?.params).toBeUndefined();
		expect(fixture.events.map(({ notification }) => notification.method)).toEqual([
			"warning",
			"thread/realtime/transcript/delta",
		]);
		expect(fixture.lifecycle.appServerReady()).toBe(1);
		expect(fixture.lifecycle.terminalFailure()).toBe(0);
		const second = await rejected(fixture.session.initialize());
		expect(second).toMatchObject({ code: "already_initialized" });
		expect(fixture.transport.requests).toHaveLength(3);
		fixture.close();
	});
	test("keeps account readiness separate from login start and gates thread methods", async () => {
		const fixture = createSessionFixture();
		await fixture.session.initialize();
		const beforeAccount = await rejected(fixture.session.threadStart({}));
		expect(beforeAccount).toBeInstanceOf(CodexSessionMutationError);
		expect((beforeAccount as CodexSessionMutationError).cause).toBeInstanceOf(CodexSessionError);
		expect(beforeAccount).toMatchObject({
			method: "thread/start",
			outcome: "not_delivered",
			cause: { code: "not_account_ready" },
		});
		expect(fixture.transport.requests.map(({ method }) => method)).toEqual([
			"initialize",
			"configRequirements/read",
			"config/read",
		]);
		fixture.transport.enqueueResponse("account/login/start", { type: "apiKey" });
		await fixture.session.accountLogin({ type: "apiKey", apiKey: "secret" });
		expect(fixture.lifecycle.accountReady()).toBe(0);
		fixture.transport.enqueueResponse("account/read", {
			account: { type: "chatgpt", email: null, planType: "pro" },
			requiresOpenaiAuth: true,
		});
		await fixture.session.accountRead();
		expect(fixture.lifecycle.accountReady()).toBe(1);
		fixture.close();
	});
	test("enforces the reviewed login support table before account readiness", async () => {
		const fixture = createSessionFixture();
		await fixture.session.initialize();
		const supported: ReadonlyArray<{
			readonly params: SessionLoginParams;
			readonly response: unknown;
		}> = [
			{ params: { type: "apiKey", apiKey: "api-key-secret" }, response: { type: "apiKey" } },
			{
				params: { type: "chatgpt", useHostedLoginSuccessPage: true },
				response: {
					type: "chatgpt",
					loginId: "login-1",
					authUrl: "https://example.test/login",
				},
			},
			{
				params: { type: "amazonBedrock", apiKey: "bedrock-key", region: "eu-west-1" },
				response: { type: "amazonBedrock" },
			},
			{
				params: {
					type: "amazonBedrockAccessKeys",
					accessKeyId: "access-key",
					secretAccessKey: "secret-key",
					sessionToken: null,
					region: "eu-west-1",
				},
				response: { type: "amazonBedrock" },
			},
		];
		for (const entry of supported) {
			fixture.transport.enqueueResponse("account/login/start", entry.response as never);
			await fixture.session.accountLogin(entry.params);
		}
		const requestCount = fixture.transport.requests.length;
		for (const params of [
			{ type: "chatgptDeviceCode" },
			{
				type: "chatgptAuthTokens",
				accessToken: "access-token",
				chatgptAccountId: "account-1",
				chatgptPlanType: null,
			},
			{ type: "profile", profile: "default", region: "eu-west-1" },
			{ type: "environment", region: "eu-west-1" },
		] as SessionLoginParams[]) {
			const error = await rejected(fixture.session.accountLogin(params));
			expect(error).toBeInstanceOf(CodexSessionMutationError);
			expect(error).toMatchObject({
				method: "account/login/start",
				outcome: "not_delivered",
				cause: { code: "unsupported_login" },
			});
		}
		expect(fixture.transport.requests).toHaveLength(requestCount);
		fixture.close();
	});
	test("preserves mutation settlement classes and never retries", async () => {
		const fixture = await readyFixture();
		const threadId = fixture.identity.decoder.adoptThreadId("thread-1");
		fixture.transport.enqueueResponse("thread/delete", emptyResponse);
		await fixture.session.threadDelete({ threadId });
		expect(fixture.transport.requests.at(-1)?.options).toMatchObject({
			idempotent: false,
			retryEligible: false,
		});
		const remote = new CodexTransportRemoteError({
			method: "thread/delete",
			correlation: fixture.identity.decoder.createWireRequestCorrelation({
				requestId: fixture.identity.issuer.mintJsonRpcRequestId(),
			}),
			rpcError: { code: -32000, message: "server refused" },
		});
		fixture.transport.enqueueResponse("thread/delete", remote);
		const refused = await rejected(fixture.session.threadDelete({ threadId }));
		expect(refused).toBeInstanceOf(CodexSessionMutationError);
		expect(refused).toMatchObject({
			outcome: "not_delivered",
			method: "thread/delete",
			retryEligible: false,
			cause: remote,
		});
		const unknown = Object.assign(new Error("hostile accepted write lost"), {
			accepted: true,
			outcome: "outcome_unknown",
		});
		fixture.transport.enqueueResponse("thread/delete", unknown);
		const uncertain = await rejected(fixture.session.threadDelete({ threadId }));
		expect(uncertain).toBeInstanceOf(CodexSessionMutationError);
		expect(uncertain).toMatchObject({
			outcome: "outcome_unknown",
			retryEligible: false,
			cause: unknown,
		});
		const transportError = new CodexTransportRequestError({
			method: "thread/delete",
			correlation: fixture.identity.decoder.createWireRequestCorrelation({
				requestId: fixture.identity.issuer.mintJsonRpcRequestId(),
			}),
			outcome: "outcome_unknown",
			reason: "timeout",
			accepted: true,
			retryEligible: false,
		});
		fixture.transport.enqueueResponse("thread/delete", transportError);
		const transportFailure = await rejected(fixture.session.threadDelete({ threadId }));
		expect(transportFailure).toBeInstanceOf(CodexSessionMutationError);
		expect(transportFailure).toMatchObject({
			outcome: "outcome_unknown",
			retryEligible: false,
			cause: transportError,
		});
		expect(
			fixture.transport.requests.filter(({ method }) => method === "thread/delete"),
		).toHaveLength(4);
		fixture.close();
	});

	test("requires a current issued TurnId for steer and serializes it once", async () => {
		const fixture = await readyFixture();
		const threadId = fixture.identity.decoder.adoptThreadId("thread-1");
		const expectedTurnId = fixture.identity.decoder.adoptTurnId("turn-server");
		fixture.transport.enqueueResponse("turn/steer", { turnId: "turn-2" });
		await fixture.session.turnSteer({
			threadId,
			clientUserMessageId: "message-1",
			input: [{ type: "text", text: "continue", text_elements: [] }],
			additionalContext: {},
			expectedTurnId,
		});
		expect(fixture.transport.requests.at(-1)?.params).toEqual({
			threadId: "thread-1",
			clientUserMessageId: "message-1",
			input: [{ type: "text", text: "continue", text_elements: [] }],
			additionalContext: {},
			expectedTurnId: "turn-server",
		});
		const requestCount = fixture.transport.requests.length;
		for (const invalid of [
			{ threadId },
			{ threadId, expectedTurnId: null },
			{ threadId, expectedTurnId: "turn-server" },
			{
				threadId,
				expectedTurnId: fixture.identity.decoder.adoptThreadId("wrong-domain"),
			},
		]) {
			const error = await rejected(fixture.session.turnSteer(invalid as never));
			expect(error).toMatchObject({ outcome: "not_delivered" });
		}
		expect(fixture.transport.requests).toHaveLength(requestCount);
		fixture.close();
	});

	test("answers current time and unsupported reverse requests exactly once", async () => {
		const fixture = createSessionFixture({ now: () => 12_345 });
		await fixture.session.initialize();
		const currentThreadId = fixture.identity.decoder.adoptThreadId("thread-1");
		fixture.transport.emitServerRequest(
			reverseRequest(fixture, "currentTime/read", { threadId: currentThreadId }),
		);
		fixture.transport.emitServerRequest(
			reverseRequest(fixture, "account/chatgptAuthTokens/refresh", { reason: "unauthorized" }),
		);
		fixture.transport.emitServerRequest(reverseRequest(fixture, "attestation/generate", {}));
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(fixture.transport.reverseResponses.map(({ response }) => response)).toEqual([
			{ result: { currentTimeAt: 12 } },
			{ error: { code: -32601, message: "Client-managed ChatGPT token refresh is not supported" } },
			{ error: { code: -32601, message: "Attestation is not supported by this client" } },
		]);
		fixture.close();
	});

	test("forwards realtime notifications without a second interpretation", async () => {
		const fixture = createSessionFixture();
		await fixture.session.initialize();
		const event = makeNotification(
			fixture,
			"thread/realtime/transcript/delta",
		) as TransportServerNotification;
		fixture.transport.emitNotification(event);
		expect(fixture.events.at(-1)).toBe(event);
		expect(fixture.events.at(-1)?.notification).toEqual(event.notification);
		fixture.close();
	});
});
