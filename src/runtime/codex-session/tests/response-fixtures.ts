import type { ResponseMethod } from "../../codex-protocol/index.js";
import {
	configFixture,
	emptyResponse,
	modelFixture,
	requirementsFixture,
	threadFixture,
	threadItemFixture,
	turnFixture,
	type SessionFixture,
} from "./support.js";

export function responseFor(method: ResponseMethod, fixture: SessionFixture): unknown {
	if (method === "initialize")
		return {
			userAgent: "Codex Desktop/0.151.0",
			codexHome: fixture.storage.codexHome,
			platformFamily: "unix",
			platformOs: "linux",
		};
	if (method === "config/read")
		return configFixture(fixture.storage.sqliteHome, fixture.storage.configPath);
	if (method === "configRequirements/read") return requirementsFixture(null);
	if (method === "account/read")
		return {
			account: { type: "chatgpt", email: null, planType: "pro" },
			requiresOpenaiAuth: true,
		};
	if (method === "account/login/start") return { type: "apiKey" };
	if (method === "account/login/cancel") return { status: "canceled" };
	if (method === "model/list") return { data: [modelFixture], nextCursor: "model-next" };
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
	if (method === "thread/list")
		return { data: [threadFixture], nextCursor: "thread-next", backwardsCursor: "thread-back" };
	if (method === "thread/loaded/list") return { data: ["thread-1"], nextCursor: "loaded-next" };
	if (method === "thread/turns/list")
		return { data: [turnFixture], nextCursor: "turn-next", backwardsCursor: "turn-back" };
	if (method === "thread/items/list")
		return {
			data: [{ turnId: "turn-1", item: threadItemFixture }],
			nextCursor: "item-next",
			backwardsCursor: "item-back",
		};
	if (method === "thread/queue/list")
		return {
			data: [
				{
					id: "queue-1",
					input: [{ type: "text", text: "queued", text_elements: [] }],
					clientUserMessageId: "client-queue-1",
				},
			],
			nextCursor: "queue-next",
		};
	if (method === "thread/timeline/list")
		return {
			data: [{ type: "turnStarted", position: 1, turnId: "turn-1", startedAt: 1 }],
			nextCursor: "timeline-next",
			activeRealtimeSessionAtPageStart: null,
		};
	if (method === "currentTime/read") return { currentTimeAt: 12 };
	return emptyResponse;
}
