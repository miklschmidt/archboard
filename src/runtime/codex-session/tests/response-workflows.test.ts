import { describe, expect, test } from "bun:test";

import type { ResponseMethod, ResponsePayloads } from "../../codex-protocol/index.js";
import { configFixture, requirementsFixture, threadFixture } from "./support.js";
import {
	createTransportSessionFixture,
	type TransportSessionFixture,
} from "./transport-chain-support.js";

function threadStartResponse(
	thread: ResponsePayloads["thread/read"]["thread"],
): ResponsePayloads["thread/start"] {
	return {
		thread,
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
}

async function answerPending<Method extends ResponseMethod>(
	fixture: TransportSessionFixture,
	method: Method,
	result: ResponsePayloads[Method],
	from: number,
): Promise<number> {
	await fixture.settle();
	const frames = fixture.frames();
	const index = frames.findIndex(
		(frame, candidate) => candidate >= from && frame["method"] === method && frame["id"] !== undefined,
	);
	if (index < 0) throw new Error(`transport did not write ${method}`);
	const request = frames[index];
	fixture.send({ id: request?.["id"], result });
	await fixture.settle();
	return index + 1;
}

async function initializeTransportSession(fixture: TransportSessionFixture): Promise<void> {
	const pending = fixture.session.initialize();
	let cursor = 0;
	cursor = await answerPending(
		fixture,
		"initialize",
		{
			userAgent: "Codex Desktop/0.151.0",
			codexHome: fixture.storage.codexHome,
			platformFamily: "unix",
			platformOs: "linux",
		},
		cursor,
	);
	cursor = await answerPending(
		fixture,
		"configRequirements/read",
		requirementsFixture(null),
		cursor,
	);
	await answerPending(
		fixture,
		"config/read",
		configFixture(fixture.storage.sqliteHome, fixture.storage.configPath),
		cursor,
	);
	await pending;
}

async function roundTrip<Method extends ResponseMethod, Result>(
	fixture: TransportSessionFixture,
	method: Method,
	start: () => Promise<Result>,
	result: ResponsePayloads[Method],
): Promise<Result> {
	const from = fixture.frames().length;
	const pending = start();
	await answerPending(fixture, method, result, from);
	return pending;
}

async function expectCurrentTime(
	fixture: TransportSessionFixture,
	id: string,
	threadId: string,
	currentTimeAt: number,
): Promise<void> {
	const from = fixture.frames().length;
	fixture.send({ id, method: "currentTime/read", params: { threadId } });
	await fixture.settle();
	expect(fixture.frames().slice(from)).toContainEqual({ id, result: { currentTimeAt } });
}

describe("Codex session response workflows", () => {
	test("composes hosted login into cancel through the real transport and session chain", async () => {
		const fixture = createTransportSessionFixture(() => 12_345);
		try {
			await initializeTransportSession(fixture);
			const login = await roundTrip(
				fixture,
				"account/login/start",
				() =>
					fixture.session.accountLogin({
						type: "chatgpt",
						useHostedLoginSuccessPage: true,
					}),
				{
					type: "chatgpt",
					loginId: "hosted-login",
					authUrl: "https://example.test/login",
				},
			);
			if (login.type !== "chatgpt") throw new Error("hosted login result was not returned");
			expect(fixture.identity.decoder.serializeCodexIdentity(login.loginId)).toBe("hosted-login");
			await roundTrip(
				fixture,
				"account/login/cancel",
				() => fixture.session.accountLoginCancel({ loginId: login.loginId }),
				{ status: "canceled" },
			);
			const cancel = fixture.frames().find((frame) => frame["method"] === "account/login/cancel");
			expect(cancel?.["params"]).toEqual({ loginId: "hosted-login" });
		} finally {
			await fixture.close();
		}
	});

	test("composes thread start, list, and read into currentTime through the real chain", async () => {
		const fixture = createTransportSessionFixture(() => 12_345);
		try {
			await initializeTransportSession(fixture);
			await roundTrip(fixture, "account/read", () => fixture.session.accountRead(), {
				account: { type: "chatgpt", email: null, planType: "pro" },
				requiresOpenaiAuth: true,
			});
			const started = await roundTrip(
				fixture,
				"thread/start",
				() => fixture.session.threadStart({}),
				threadStartResponse({ ...threadFixture, id: "started-thread", turns: [] }),
			);
			expect(fixture.identity.decoder.serializeCodexIdentity(started.thread.id)).toBe(
				"started-thread",
			);
			await expectCurrentTime(fixture, "time-started", "started-thread", 12);

			const listed = await roundTrip(
				fixture,
				"thread/list",
				() => fixture.session.threadListPage({}),
				{
					data: [{ ...threadFixture, id: "listed-thread", turns: [] }],
					nextCursor: "listed-next",
					backwardsCursor: null,
				},
			);
			const listedThread = listed.data[0];
			if (!listedThread) throw new Error("thread/list returned no thread");
			const read = await roundTrip(
				fixture,
				"thread/read",
				() => fixture.session.threadRead({ threadId: listedThread.id }),
				{ thread: { ...threadFixture, id: "listed-thread", turns: [] } },
			);
			expect(read.thread.id).toBe(listedThread.id);
			const readRequest = fixture.frames().find((frame) => frame["method"] === "thread/read");
			expect(readRequest?.["params"]).toEqual({ threadId: "listed-thread" });
			await expectCurrentTime(fixture, "time-listed", "listed-thread", 12);
			expect(fixture.transport.inspectIssues()).toEqual([]);
		} finally {
			await fixture.close();
		}
	});
});
