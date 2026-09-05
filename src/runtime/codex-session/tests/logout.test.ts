import { describe, expect, test } from "bun:test";

import { CodexSessionMutationError } from "../index.js";
import {
	createSessionFixture,
	emptyResponse,
	threadFixture,
	type SessionFixture,
} from "./support.js";

const THREAD_METHODS = [
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
] as const;

async function rejected(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected the session operation to reject");
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

async function expectThreadMethodsGated(fixture: SessionFixture): Promise<void> {
	const requestCount = fixture.transport.requests.length;
	for (const name of THREAD_METHODS) {
		const call = fixture.session[name] as (params?: unknown) => Promise<unknown>;
		const error = await rejected(call({}));
		const cause = error instanceof CodexSessionMutationError ? error.cause : error;
		expect(cause).toMatchObject({ code: "not_account_ready" });
	}
	expect(fixture.transport.requests).toHaveLength(requestCount);
}

describe("Codex session logout readiness", () => {
	test("gates every thread method before an accepted logout settles", async () => {
		const fixture = await readyFixture();
		try {
			let inFlightGate: Promise<unknown> | undefined;
			fixture.transport.beforeRequest = (method) => {
				if (method === "account/logout") {
					inFlightGate = rejected(fixture.session.threadStart({}));
				}
			};
			const lowerError = Object.assign(new Error("logout response was lost"), {
				accepted: true,
				outcome: "outcome_unknown",
			});
			fixture.transport.enqueueResponse("account/logout", lowerError);
			const error = await rejected(fixture.session.accountLogout());
			expect(error).toBeInstanceOf(CodexSessionMutationError);
			expect(error).toMatchObject({
				method: "account/logout",
				outcome: "outcome_unknown",
				retryEligible: false,
				cause: lowerError,
			});
			if (!inFlightGate) {
				throw new Error("logout did not reach the transport boundary");
			}
			expect(await inFlightGate).toMatchObject({
				outcome: "not_delivered",
				cause: { code: "not_account_ready" },
			});
			await expectThreadMethodsGated(fixture);
		} finally {
			fixture.close();
		}
	});

	test("restores thread readiness only for a proven not-delivered logout", async () => {
		const fixture = await readyFixture();
		try {
			const lowerError = Object.assign(new Error("logout was rejected before write"), {
				accepted: false,
				outcome: "not_delivered",
			});
			fixture.transport.enqueueResponse("account/logout", lowerError);
			const error = await rejected(fixture.session.accountLogout());
			expect(error).toBeInstanceOf(CodexSessionMutationError);
			expect(error).toMatchObject({
				method: "account/logout",
				outcome: "not_delivered",
				retryEligible: false,
				cause: lowerError,
			});
			fixture.transport.enqueueResponse("thread/list", {
				data: [threadFixture],
				nextCursor: null,
				backwardsCursor: null,
			});
			const page = await fixture.session.threadListPage({});
			expect(page.data).toHaveLength(1);
			const listed = page.data[0];
			if (!listed) {
				throw new Error("thread/list returned no fixture thread");
			}
			expect(fixture.identity.decoder.serializeCodexIdentity(listed.id)).toBe("thread-1");
		} finally {
			fixture.close();
		}
	});

	test("keeps login cancel and logout available before account readiness", async () => {
		const fixture = createSessionFixture();
		try {
			await fixture.session.initialize();
			fixture.transport.enqueueResponse("account/login/cancel", { status: "canceled" });
			await fixture.session.accountLoginCancel({
				loginId: fixture.identity.decoder.adoptLoginId("login-1"),
			});
			fixture.transport.enqueueResponse("account/logout", emptyResponse);
			await fixture.session.accountLogout();
			expect(fixture.transport.requests.map(({ method }) => method)).toEqual([
				"initialize",
				"configRequirements/read",
				"config/read",
				"account/login/cancel",
				"account/logout",
			]);
		} finally {
			fixture.close();
		}
	});
});
