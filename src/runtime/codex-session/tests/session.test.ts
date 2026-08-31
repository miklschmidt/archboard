import {
	SESSION_METHODS,
	CodexSessionError,
	CodexSessionMutationError,
	type SessionLoginParams,
} from "../index.js";
import { describe, expect, test } from "bun:test";
import type { ResponseMethod } from "../../codex-protocol/index.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import {
	createSessionFixture,
	emptyResponse,
	makeNotification,
	reverseRequest,
	threadFixture,
	turnFixture,
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

function responseFor(method: ResponseMethod, fixture: SessionFixture): unknown {
	if (method === "config/read")
		return {
			config: {
				model: null,
				review_model: null,
				model_context_window: null,
				model_auto_compact_token_limit: null,
				model_auto_compact_token_limit_scope: null,
				model_provider: null,
				approval_policy: null,
				approvals_reviewer: null,
				sandbox_mode: null,
				sandbox_workspace_write: null,
				forced_chatgpt_workspace_id: null,
				forced_login_method: null,
				web_search: null,
				tools: null,
				instructions: null,
				developer_instructions: null,
				compact_prompt: null,
				model_reasoning_effort: null,
				model_reasoning_summary: null,
				model_verbosity: null,
				service_tier: null,
				analytics: null,
				apps: null,
				browser_use: null,
				computer_use: null,
				desktop: null,
				sqlite_home: fixture.storage.sqliteHome,
			},
			origins: {
				sqlite_home: {
					name: { type: "user", file: fixture.storage.configPath, profile: null },
					version: "fixture",
				},
			},
			layers: null,
		};
	if (method === "model/list") return { data: [], nextCursor: null };
	if (method === "thread/start" || method === "thread/fork")
		return {
			thread: threadFixture,
			model: "gpt-5.6-luna",
			modelProvider: "openai",
			serviceTier: null,
			cwd: "/tmp/archboard",
			runtimeWorkspaceRoots: ["/tmp/archboard"],
			instructionSources: [],
			approvalPolicy: "never",
			approvalsReviewer: "user",
			sandbox: { type: "dangerFullAccess" },
			activePermissionProfile: null,
			reasoningEffort: "medium",
			multiAgentMode: "explicitRequestOnly",
		};
	if (method === "thread/read") return { thread: threadFixture };
	if (method === "turn/start" || method === "thread/queue/start") return { turn: turnFixture };
	if (method === "turn/steer") return { turnId: "turn-2" };
	if (method === "thread/queue/add" || method === "thread/queue/update")
		return {
			queuedSubmission: {
				id: "queue-1",
				input: [{ type: "text", text: "queued", text_elements: [] }],
				clientUserMessageId: "client-queue-1",
			},
		};
	if (method === "thread/queue/delete") return { deleted: true };
	if (method === "thread/list") return { data: [], nextCursor: null, backwardsCursor: null };
	if (method === "thread/loaded/list") return { data: [], nextCursor: null };
	if (method === "thread/turns/list" || method === "thread/items/list")
		return { data: [], nextCursor: null, backwardsCursor: null };
	if (method === "thread/queue/list") return { data: [], nextCursor: null };
	if (method === "thread/timeline/list")
		return { data: [], nextCursor: null, activeRealtimeSessionAtPageStart: null };
	if (method === "account/login/start") return { type: "apiKey" };
	if (method === "account/login/cancel") return { status: "canceled" };
	return emptyResponse;
}

describe("typed Codex session", () => {
	test("exposes only the reviewed public method inventory", () => {
		const fixture = createSessionFixture();
		expect(Object.keys(fixture.session)).toEqual([...SESSION_METHODS]);
		fixture.close();
	});

	test("buffers decoded notifications until the initialized storage proof succeeds", async () => {
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
	test("dispatches every ordinary method through one decoded request", async () => {
		const fixture = await readyFixture();
		const expectedTurnId = fixture.identity.decoder.adoptTurnId("turn-server");
		const cases: ReadonlyArray<{
			readonly name: keyof Omit<typeof fixture.session, "initialize">;
			readonly wire: ResponseMethod;
			readonly params?: Record<string, unknown>;
			readonly mutation?: boolean;
		}> = [
			{ name: "configRead", wire: "config/read", params: { includeLayers: false } },
			{
				name: "accountLogin",
				wire: "account/login/start",
				params: { type: "apiKey", apiKey: "one" },
				mutation: true,
			},
			{
				name: "accountLoginCancel",
				wire: "account/login/cancel",
				params: { loginId: "login-1" },
				mutation: true,
			},
			{ name: "modelList", wire: "model/list", params: {} },
			{ name: "threadStart", wire: "thread/start", params: { request: "start" }, mutation: true },
			{ name: "threadFork", wire: "thread/fork", params: { request: "fork" }, mutation: true },
			{ name: "threadListPage", wire: "thread/list", params: { cursor: "c", limit: 1 } },
			{
				name: "threadLoadedListPage",
				wire: "thread/loaded/list",
				params: { cursor: null, limit: 1 },
			},
			{ name: "threadRead", wire: "thread/read", params: { threadId: "thread-1" } },
			{
				name: "threadTurnsListPage",
				wire: "thread/turns/list",
				params: { threadId: "thread-1", cursor: null, limit: 1 },
			},
			{
				name: "threadItemsListPage",
				wire: "thread/items/list",
				params: { threadId: "thread-1", cursor: null, limit: 1 },
			},
			{
				name: "threadDelete",
				wire: "thread/delete",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{
				name: "threadSettingsUpdate",
				wire: "thread/settings/update",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{ name: "turnStart", wire: "turn/start", params: { threadId: "thread-1" }, mutation: true },
			{
				name: "turnSteer",
				wire: "turn/steer",
				params: { threadId: "thread-1", expectedTurnId },
				mutation: true,
			},
			{
				name: "turnInterrupt",
				wire: "turn/interrupt",
				params: { threadId: "thread-1", turnId: "turn-server" },
				mutation: true,
			},
			{
				name: "queueAdd",
				wire: "thread/queue/add",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{
				name: "queueListPage",
				wire: "thread/queue/list",
				params: { threadId: "thread-1", cursor: null, limit: 1 },
			},
			{
				name: "queueUpdate",
				wire: "thread/queue/update",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{
				name: "queueDelete",
				wire: "thread/queue/delete",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{
				name: "queueReorder",
				wire: "thread/queue/reorder",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{
				name: "queueStart",
				wire: "thread/queue/start",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{
				name: "threadInjectItems",
				wire: "thread/inject_items",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{
				name: "realtimeStart",
				wire: "thread/realtime/start",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{
				name: "realtimeAppendText",
				wire: "thread/realtime/appendText",
				params: { threadId: "thread-1", text: "hi" },
				mutation: true,
			},
			{
				name: "realtimeAppendSpeech",
				wire: "thread/realtime/appendSpeech",
				params: { threadId: "thread-1", text: "hi" },
				mutation: true,
			},
			{
				name: "realtimeStop",
				wire: "thread/realtime/stop",
				params: { threadId: "thread-1" },
				mutation: true,
			},
			{
				name: "timelineListPage",
				wire: "thread/timeline/list",
				params: { threadId: "thread-1", cursor: null, limit: 1 },
			},
		];
		for (const entry of cases) {
			fixture.transport.enqueueResponse(entry.wire, responseFor(entry.wire, fixture) as never);
			await (fixture.session[entry.name] as (params?: unknown) => Promise<unknown>)(entry.params);
			const request = fixture.transport.requests.at(-1);
			expect(request?.method).toBe(entry.wire);
			expect(request?.params).toEqual(
				entry.name === "turnSteer"
					? { ...entry.params, expectedTurnId: "turn-server" }
					: entry.params,
			);
			if (entry.mutation) expect(request?.options?.idempotent).toBe(false);
		}
		fixture.transport.enqueueResponse("account/logout", emptyResponse);
		await fixture.session.accountLogout({});
		expect(fixture.transport.requests.at(-1)?.method).toBe("account/logout");
		fixture.close();
	});

	test("preserves mutation settlement classes and never retries", async () => {
		const fixture = await readyFixture();
		fixture.transport.enqueueResponse("thread/delete", emptyResponse);
		await fixture.session.threadDelete({ threadId: "thread-1" });
		expect(fixture.transport.requests.at(-1)?.options).toMatchObject({
			idempotent: false,
			retryEligible: false,
		});
		const remote = Object.assign(new Error("server refused"), {
			name: "CodexTransportRemoteError",
		});
		fixture.transport.enqueueResponse("thread/delete", remote);
		const refused = await rejected(fixture.session.threadDelete({ threadId: "thread-1" }));
		expect(refused).toBeInstanceOf(CodexSessionMutationError);
		expect(refused).toMatchObject({ outcome: "not_delivered", method: "thread/delete" });
		const unknown = Object.assign(new Error("accepted write lost"), {
			outcome: "outcome_unknown",
			accepted: true,
		});
		fixture.transport.enqueueResponse("thread/delete", unknown);
		const uncertain = await rejected(fixture.session.threadDelete({ threadId: "thread-1" }));
		expect(uncertain).toBe(unknown);
		expect(uncertain).toMatchObject({ outcome: "outcome_unknown" });
		expect(
			fixture.transport.requests.filter(({ method }) => method === "thread/delete"),
		).toHaveLength(3);
		fixture.close();
	});

	test("requires a current issued TurnId for steer and serializes it once", async () => {
		const fixture = await readyFixture();
		const expectedTurnId = fixture.identity.decoder.adoptTurnId("turn-server");
		fixture.transport.enqueueResponse("turn/steer", { turnId: "turn-2" });
		await fixture.session.turnSteer({ threadId: "thread-1", expectedTurnId });
		expect(fixture.transport.requests.at(-1)?.params).toEqual({
			threadId: "thread-1",
			expectedTurnId: "turn-server",
		});
		const requestCount = fixture.transport.requests.length;
		for (const invalid of [
			{ threadId: "thread-1" },
			{ threadId: "thread-1", expectedTurnId: null },
			{ threadId: "thread-1", expectedTurnId: "turn-server" },
			{
				threadId: "thread-1",
				expectedTurnId: fixture.identity.decoder.adoptThreadId("wrong-domain"),
			},
		]) {
			const error = await rejected(fixture.session.turnSteer(invalid));
			expect(error).toMatchObject({ outcome: "not_delivered" });
		}
		expect(fixture.transport.requests).toHaveLength(requestCount);
		fixture.close();
	});

	test("answers current time and unsupported reverse requests exactly once", async () => {
		const fixture = createSessionFixture({ now: () => 12_345 });
		await fixture.session.initialize();
		fixture.transport.emitServerRequest(
			reverseRequest(fixture, "currentTime/read", { threadId: "thread-1" }),
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
