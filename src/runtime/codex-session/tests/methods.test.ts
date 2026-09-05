import { describe, expect, test } from "bun:test";

import { SESSION_METHODS, type CodexSession, type SessionMethod } from "../index.js";
import type { ResponseMethod } from "../../codex-protocol/index.js";
import { createSessionFixture, emptyResponse, threadFixture, turnFixture } from "./support.js";
import { responseFor } from "./response-fixtures.js";

const AUTHORED_SESSION_METHODS = [
	"initialize",
	"configRead",
	"accountRead",
	"accountLogin",
	"accountLoginCancel",
	"accountLogout",
	"modelList",
	"threadStart",
	"threadFork",
	"threadListPage",
	"threadLoadedListPage",
	"threadRead",
	"threadTurnsListPage",
	"threadItemsListPage",
	"threadDelete",
	"threadSettingsUpdate",
	"turnStart",
	"turnSteer",
	"turnInterrupt",
	"queueAdd",
	"queueListPage",
	"queueUpdate",
	"queueDelete",
	"queueReorder",
	"queueStart",
	"threadInjectItems",
	"realtimeStart",
	"realtimeAppendText",
	"realtimeAppendSpeech",
	"realtimeStop",
	"timelineListPage",
	"respondCurrentTime",
	"respondUnsupportedTokenRefresh",
	"respondUnsupportedAttestation",
] as const satisfies readonly SessionMethod[];

type RequestCase = {
	readonly kind: "request";
	readonly wire: ResponseMethod;
	readonly params?: Record<string, unknown>;
	readonly mutation?: boolean;
};
type ReverseCase = { readonly kind: "reverse" };
type OperationCase = RequestCase | ReverseCase;

const request = (
	wire: ResponseMethod,
	params?: Record<string, unknown>,
	mutation = false,
): RequestCase => ({
	kind: "request",
	wire,
	...(params === undefined ? {} : { params }),
	mutation,
});
const reverse = (): ReverseCase => ({ kind: "reverse" });

const OPERATION_CASES = {
	initialize: request("initialize"),
	configRead: request("config/read", { includeLayers: false }),
	accountRead: request("account/read"),
	accountLogin: request("account/login/start", { type: "apiKey", apiKey: "fixture-secret" }, true),
	accountLoginCancel: request("account/login/cancel", { loginId: "login-1" }, true),
	accountLogout: request("account/logout", undefined, true),
	modelList: request("model/list"),
	threadStart: request("thread/start", {}, true),
	threadFork: request("thread/fork", { threadId: "thread-1" }, true),
	threadListPage: request("thread/list", { cursor: "cursor", limit: 1 }),
	threadLoadedListPage: request("thread/loaded/list", { cursor: "cursor", limit: 1 }),
	threadRead: request("thread/read", { threadId: "thread-1" }),
	threadTurnsListPage: request("thread/turns/list", {
		threadId: "thread-1",
		cursor: "cursor",
		limit: 1,
	}),
	threadItemsListPage: request("thread/items/list", {
		threadId: "thread-1",
		cursor: "cursor",
		limit: 1,
	}),
	threadDelete: request("thread/delete", { threadId: "thread-1" }, true),
	threadSettingsUpdate: request("thread/settings/update", { threadId: "thread-1" }, true),
	turnStart: request(
		"turn/start",
		{ threadId: "thread-1", input: [{ type: "text", text: "continue", text_elements: [] }] },
		true,
	),
	turnSteer: request(
		"turn/steer",
		{
			threadId: "thread-1",
			clientUserMessageId: "message-1",
			input: [{ type: "text", text: "continue", text_elements: [] }],
			additionalContext: {},
			expectedTurnId: "issued",
		},
		true,
	),
	turnInterrupt: request("turn/interrupt", { threadId: "thread-1", turnId: "turn-1" }, true),
	queueAdd: request(
		"thread/queue/add",
		{
			threadId: "thread-1",
			input: [{ type: "text", text: "queued", text_elements: [] }],
			clientUserMessageId: "message-2",
		},
		true,
	),
	queueListPage: request("thread/queue/list", { threadId: "thread-1", cursor: "cursor", limit: 1 }),
	queueUpdate: request(
		"thread/queue/update",
		{
			threadId: "thread-1",
			queuedSubmissionId: "queue-1",
			input: [{ type: "text", text: "queued", text_elements: [] }],
		},
		true,
	),
	queueDelete: request(
		"thread/queue/delete",
		{ threadId: "thread-1", queuedSubmissionId: "queue-1" },
		true,
	),
	queueReorder: request(
		"thread/queue/reorder",
		{ threadId: "thread-1", queuedSubmissionIds: ["queue-1"] },
		true,
	),
	queueStart: request("thread/queue/start", { threadId: "thread-1" }, true),
	threadInjectItems: request(
		"thread/inject_items",
		{ threadId: "thread-1", items: [{ type: "message" }] },
		true,
	),
	realtimeStart: request(
		"thread/realtime/start",
		{ threadId: "thread-1", outputModality: "audio" },
		true,
	),
	realtimeAppendText: request(
		"thread/realtime/appendText",
		{ threadId: "thread-1", text: "hi", role: "user" },
		true,
	),
	realtimeAppendSpeech: request(
		"thread/realtime/appendSpeech",
		{ threadId: "thread-1", text: "hi" },
		true,
	),
	realtimeStop: request("thread/realtime/stop", { threadId: "thread-1" }, true),
	timelineListPage: request("thread/timeline/list", {
		threadId: "thread-1",
		cursor: "cursor",
		limit: 1,
	}),
	respondCurrentTime: reverse(),
	respondUnsupportedTokenRefresh: reverse(),
	respondUnsupportedAttestation: reverse(),
} satisfies Record<SessionMethod, OperationCase>;

function issueParams(
	name: SessionMethod,
	params: Record<string, unknown> | undefined,
	fixture: ReturnType<typeof createSessionFixture>,
): Record<string, unknown> | undefined {
	if (!params) return undefined;
	const issued = { ...params };
	for (const [key, value] of Object.entries(issued)) {
		if (value === undefined || value === null) continue;
		switch (key) {
			case "threadId":
			case "parentThreadId":
			case "ancestorThreadId":
				issued[key] = fixture.identity.decoder.adoptThreadId(value);
				break;
			case "turnId":
			case "lastTurnId":
			case "beforeTurnId":
			case "expectedTurnId":
				issued[key] = fixture.identity.decoder.adoptTurnId(value);
				break;
			case "queuedSubmissionId":
				issued[key] = fixture.identity.decoder.adoptQueuedSubmissionId(value);
				break;
			case "queuedSubmissionIds":
				if (!Array.isArray(value)) throw new Error(`${name} queued IDs must be an array`);
				issued[key] = value.map((candidate) =>
					fixture.identity.decoder.adoptQueuedSubmissionId(candidate),
				);
				break;
			case "loginId":
				issued[key] = fixture.identity.decoder.adoptLoginId(value);
				break;
		}
	}
	return issued;
}

const PAGE_METHODS = new Set<ResponseMethod>([
	"model/list",
	"thread/list",
	"thread/loaded/list",
	"thread/turns/list",
	"thread/items/list",
	"thread/queue/list",
	"thread/timeline/list",
]);
const EMPTY_RESULT_METHODS = new Set<ResponseMethod>([
	"account/logout",
	"thread/delete",
	"thread/settings/update",
	"turn/interrupt",
	"thread/queue/reorder",
	"thread/inject_items",
	"thread/realtime/start",
	"thread/realtime/appendText",
	"thread/realtime/appendSpeech",
	"thread/realtime/stop",
]);

function assertDecodedResult(method: ResponseMethod, result: unknown): void {
	expect(result).toBeDefined();
	if (EMPTY_RESULT_METHODS.has(method)) {
		expect(result).toEqual(emptyResponse);
		return;
	}
	if (!result || typeof result !== "object" || Array.isArray(result))
		throw new Error(`expected an object result for ${method}`);
	expect(Object.keys(result)).not.toHaveLength(0);
	if (!PAGE_METHODS.has(method)) return;
	const page = result as {
		readonly data?: readonly unknown[];
		readonly nextCursor?: unknown;
		readonly backwardsCursor?: unknown;
	};
	expect(page.data?.length).toBeGreaterThan(0);
	expect(typeof page.nextCursor).toBe("string");
	if (Object.hasOwn(page, "backwardsCursor")) expect(typeof page.backwardsCursor).toBe("string");
}

describe("typed Codex session public port", () => {
	test("matches the independent authored method oracle and exact compile-time keys", () => {
		const exactPort: [
			Exclude<keyof CodexSession, SessionMethod>,
			Exclude<SessionMethod, keyof CodexSession>,
		] extends [never, never]
			? true
			: never = true;
		const exactLogoutParams: Parameters<CodexSession["accountLogout"]> extends []
			? [] extends Parameters<CodexSession["accountLogout"]>
				? true
				: never
			: never = true;
		const fixture = createSessionFixture();
		expect(Object.keys(fixture.session)).toEqual([...AUTHORED_SESSION_METHODS]);
		expect(SESSION_METHODS).toEqual([...AUTHORED_SESSION_METHODS]);
		expect(exactPort).toBe(true);
		expect(exactLogoutParams).toBe(true);
		fixture.close();
	});

	test("dispatches every request case and returns complete pages/results", async () => {
		const fixture = createSessionFixture();
		try {
			await fixture.session.initialize();
			fixture.transport.enqueueResponse(
				"account/read",
				responseFor("account/read", fixture) as never,
			);
			await fixture.session.accountRead();
			const expectedTurnId = fixture.identity.decoder.adoptTurnId("turn-server");
			for (const name of AUTHORED_SESSION_METHODS) {
				const entry = OPERATION_CASES[name];
				if (entry.kind === "reverse" || name === "initialize" || name === "accountLogout") continue;
				const params = issueParams(name, entry.params, fixture);
				if (name === "turnSteer" && params) params["expectedTurnId"] = expectedTurnId;
				fixture.transport.enqueueResponse(entry.wire, responseFor(entry.wire, fixture) as never);
				const call = fixture.session[name] as (params?: unknown) => Promise<unknown>;
				const result = await call(params);
				assertDecodedResult(entry.wire, result);
				const requestRecord = fixture.transport.requests.at(-1);
				expect(requestRecord?.method).toBe(entry.wire);
				expect(requestRecord?.params).toEqual(
					name === "turnSteer"
						? { ...entry.params, expectedTurnId: "turn-server" }
						: (entry.params ?? {}),
				);
				expect(requestRecord?.options).toMatchObject({
					idempotent: entry.mutation !== true,
					retryEligible: false,
				});
			}
			const logout = OPERATION_CASES.accountLogout;
			if (logout.kind !== "request") throw new Error("logout case is not a request");
			fixture.transport.enqueueResponse("account/logout", emptyResponse);
			const logoutResult = await fixture.session.accountLogout();
			assertDecodedResult(logout.wire, logoutResult);
			expect(fixture.transport.requests.at(-1)?.params).toBeUndefined();
		} finally {
			fixture.close();
		}
	});

	test("uses non-empty generated page fixtures", () => {
		expect(threadFixture.turns).toEqual([turnFixture]);
		expect(turnFixture.items).toHaveLength(1);
	});
});
