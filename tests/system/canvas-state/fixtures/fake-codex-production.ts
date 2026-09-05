#!/usr/bin/env bun

import { appendFileSync, readFileSync } from "node:fs";

import { configFixture, modelFixture } from "./fake-codex-production-data.ts";

const logPath = "__ARCHBOARD_TEST_CODEX_LOG__";
const controlPath = "__ARCHBOARD_TEST_CODEX_CONTROL__";
let signedIn =
	(JSON.parse(readFileSync(controlPath, "utf8")) as { signedOut?: boolean }).signedOut !== true;
let pendingLogin = false;

const record = (value: unknown): void => appendFileSync(logPath, `${JSON.stringify(value)}\n`);
const send = (value: unknown): void => void process.stdout.write(`${JSON.stringify(value)}\n`);
const respond = (
	frame: { readonly id: unknown; readonly method: string },
	result: unknown,
): void => {
	record({ kind: "response", method: frame.method, result });
	send({ id: frame.id, result });
};
const reject = (
	frame: { readonly id: unknown; readonly method: string },
	message: string,
): void => {
	record({ kind: "fixture_rejection", method: frame.method, message });
	send({ id: frame.id, error: { code: -32602, message } });
};
const notify = (method: string, params: unknown): void => {
	record({ kind: "notification", method, params });
	send({ method, params });
};
const request = (id: string, method: string, params: unknown): void => {
	record({ kind: "server_request", id, method, params });
	send({ id, method, params });
};

if (process.argv[2] === "--version") {
	record({ kind: "version_probe", args: process.argv.slice(2) });
	process.stdout.write("codex-cli 0.151.0\n");
	process.exit(0);
}
if (
	JSON.stringify(process.argv.slice(2)) !==
	JSON.stringify(["app-server", "--stdio", "--strict-config"])
) {
	process.stderr.write("production fixture argv rejected\n");
	process.exit(9);
}

record({ kind: "app_server_spawn", pid: process.pid, args: process.argv.slice(2) });

type WireFrame = {
	readonly id?: unknown;
	readonly method?: string;
	readonly params?: Record<string, unknown>;
	readonly result?: unknown;
	readonly error?: unknown;
};
type FixtureThread = Record<string, unknown> & {
	id: string;
	status: { type: string; activeFlags?: string[] };
	turns: Record<string, unknown>[];
};

const threads = new Map<string, FixtureThread>();
let threadSequence = 0;
let turnSequence = 0;
let coordinatorThreadId: string | null = null;
let workhorseThreadId: string | null = null;
let reverseRequestsSent = false;
let realtimeSessionId: string | null = null;

const configResponse = () => ({
	config: { ...configFixture, sqlite_home: process.env.CODEX_SQLITE_HOME },
	origins: {
		sqlite_home: {
			name: {
				type: "user",
				file: `${process.env.CODEX_HOME}/config.toml`,
				profile: null,
			},
			version: "production-fixture",
		},
	},
	layers: null,
});

const buildThread = (
	id: string,
	params: Record<string, unknown>,
	sequence: number,
): FixtureThread =>
	({
		id,
		extra: {},
		sessionId: `session-${sequence}`,
		forkedFromId: null,
		parentThreadId: null,
		preview: "",
		ephemeral: false,
		section: null,
		sectionEnteredAt: null,
		projectId: null,
		historyMode: "paginated",
		modelProvider: "openai",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		recencyAt: null,
		status: { type: "idle" },
		path: null,
		cwd: String(params.cwd),
		cliVersion: "0.151.0",
		source: "vscode",
		canAcceptDirectInput: true,
		threadSource: "archboard",
		agentNickname: null,
		agentRole: null,
		gitInfo: null,
		name: null,
		turns: [],
	}) satisfies FixtureThread;

const createThread = (params: Record<string, unknown>): FixtureThread => {
	const id = `thread-${++threadSequence}`;
	const thread = buildThread(id, params, threadSequence);
	threads.set(id, thread);
	if (threadSequence === 1) coordinatorThreadId = id;
	else if (threadSequence === 2) workhorseThreadId = id;
	return thread;
};

/**
 * One persisted thread this workbench did not create. It exists before any
 * thread/start, so attaching it has to record ownership first — the path a
 * workbench-created thread never takes.
 */
const FOREIGN_FIXTURE_THREAD_ID = "thread-foreign";
threads.set(
	FOREIGN_FIXTURE_THREAD_ID,
	buildThread(FOREIGN_FIXTURE_THREAD_ID, { cwd: process.cwd() }, 0),
);

const threadStartResponse = (params: Record<string, unknown>, thread: FixtureThread) => ({
	thread,
	model: typeof params.model === "string" ? params.model : "gpt-5.6-luna",
	modelProvider: "openai",
	serviceTier: params.serviceTier ?? null,
	cwd: params.cwd,
	runtimeWorkspaceRoots: params.runtimeWorkspaceRoots,
	instructionSources: [],
	approvalPolicy: "never",
	approvalsReviewer: "user",
	sandbox: { type: "dangerFullAccess" },
	activePermissionProfile: null,
	reasoningEffort: params.model === "gpt-5.6-luna" ? "medium" : null,
	multiAgentMode: "explicitRequestOnly",
});

const coordinatorSettings = (params: Record<string, unknown>) => ({
	cwd: threads.get(String(params.threadId))?.cwd,
	approvalPolicy: "never",
	approvalsReviewer: "user",
	sandboxPolicy: { type: "dangerFullAccess" },
	activePermissionProfile: null,
	model: params.model,
	modelProvider: "openai",
	serviceTier: params.serviceTier ?? null,
	effort: params.effort,
	summary: "auto",
	collaborationMode: {
		mode: "default",
		settings: {
			model: params.model,
			reasoning_effort: params.effort,
			developer_instructions: null,
		},
	},
	multiAgentMode: "explicitRequestOnly",
	personality: null,
});

const dynamicItem = {
	type: "dynamicToolCall",
	id: "dynamic-call-1",
	namespace: "archboard_app",
	tool: "create_thread",
	arguments: { prompt: "Create the production proof thread." },
	status: "inProgress",
	contentItems: null,
	success: null,
	durationMs: null,
};

const emitReverseRequests = (): void => {
	if (reverseRequestsSent || workhorseThreadId === null) return;
	reverseRequestsSent = true;
	request("ordinary-request-1", "item/commandExecution/requestApproval", {
		threadId: workhorseThreadId,
		turnId: "turn-1",
		itemId: "approval-item-1",
		kind: "command",
		startedAtMs: Date.now(),
		approvalId: "ordinary-approval-1",
		environmentId: null,
		reason: "Prove the production approval route.",
		networkApprovalContext: null,
		command: "bun test",
		cwd: process.cwd(),
		commandActions: null,
		additionalPermissions: null,
		proposedExecpolicyAmendment: null,
		proposedNetworkPolicyAmendments: null,
		availableDecisions: ["accept", "decline", "cancel"],
	});
	request("dynamic-request-1", "item/tool/call", {
		threadId: workhorseThreadId,
		turnId: "turn-1",
		callId: "dynamic-call-1",
		namespace: "archboard_app",
		tool: "create_thread",
		arguments: { prompt: "Create the production proof thread." },
	});
};

const handle = (frame: WireFrame): void => {
	record({ kind: "frame", method: frame.method, params: frame.params, frame });
	if (frame.method === undefined) {
		record({ kind: "reverse_response", frame });
		return;
	}
	const params = frame.params ?? {};
	switch (frame.method) {
		case "initialize": {
			const control = JSON.parse(readFileSync(controlPath, "utf8")) as {
				holdInitialize?: unknown;
			};
			if (control.holdInitialize === true) {
				record({ kind: "initialize_held" });
				return;
			}
			respond(frame as never, {
				userAgent: "Codex Desktop/0.151.0",
				codexHome: process.env.CODEX_HOME,
				platformFamily: "unix",
				platformOs: "linux",
			});
			return;
		}
		case "initialized":
			return;
		case "configRequirements/read":
			respond(frame as never, { requirements: null });
			return;
		case "config/read":
			respond(frame as never, configResponse());
			return;
		case "account/read":
			respond(frame as never, {
				account: signedIn ? { type: "chatgpt", email: null, planType: "pro" } : null,
				requiresOpenaiAuth: true,
			});
			return;
		case "account/login/start":
			pendingLogin = true;
			respond(frame as never, {
				type: "chatgpt",
				loginId: "browser-login",
				authUrl: "https://example.test/login",
			});
			return;
		case "account/login/cancel":
			pendingLogin = false;
			respond(frame as never, { status: "canceled" });
			return;
		case "model/list":
			respond(frame as never, { data: [modelFixture], nextCursor: null });
			return;
		case "thread/start": {
			const thread = createThread(params);
			respond(frame as never, threadStartResponse(params, thread));
			return;
		}
		case "thread/settings/update":
			respond(frame as never, {});
			queueMicrotask(() =>
				notify("thread/settings/updated", {
					threadId: params.threadId,
					threadSettings: coordinatorSettings(params),
				}),
			);
			return;
		case "thread/list":
			respond(frame as never, {
				// Newly started empty threads are loaded/readable before they enter persisted history.
				data: [...threads.values()].filter(
					(thread) => thread.id === FOREIGN_FIXTURE_THREAD_ID || thread.turns.length > 0,
				),
				nextCursor: null,
				backwardsCursor: null,
			});
			return;
		case "thread/loaded/list":
			respond(frame as never, { data: [...threads.keys()], nextCursor: null });
			return;
		case "thread/read":
			respond(frame as never, { thread: threads.get(String(params.threadId)) });
			return;
		case "thread/queue/list":
			respond(frame as never, { data: [], nextCursor: null });
			return;
		case "thread/timeline/list":
			respond(frame as never, {
				data: [],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: null,
			});
			return;
		case "thread/turns/list": {
			const thread = threads.get(String(params.threadId));
			respond(frame as never, {
				data: thread?.turns ?? [],
				nextCursor: null,
				backwardsCursor: null,
			});
			return;
		}
		case "thread/items/list": {
			const thread = threads.get(String(params.threadId));
			respond(frame as never, {
				data: (thread?.turns ?? []).flatMap((turn) =>
					((turn.items as Record<string, unknown>[] | undefined) ?? []).map((item) => ({
						turnId: turn.id,
						item,
					})),
				),
				nextCursor: null,
				backwardsCursor: null,
			});
			return;
		}
		case "turn/start": {
			const thread = threads.get(String(params.threadId));
			const isWorkhorse = thread?.id === workhorseThreadId;
			const turn = {
				id: `turn-${++turnSequence}`,
				items: isWorkhorse ? [dynamicItem] : [],
				itemsView: "full",
				status: isWorkhorse ? "inProgress" : "completed",
				error: null,
				startedAt: Date.now(),
				completedAt: isWorkhorse ? null : Date.now(),
				durationMs: isWorkhorse ? null : 1,
			};
			if (thread !== undefined) {
				thread.turns = [turn];
				thread.status = isWorkhorse
					? { type: "active", activeFlags: ["waitingOnApproval"] }
					: { type: "idle" };
			}
			respond(frame as never, { turn });
			if (isWorkhorse) setTimeout(emitReverseRequests, 10);
			return;
		}
		case "thread/inject_items":
			record({ kind: "semantic_injection", params });
			respond(frame as never, {});
			return;
		case "thread/realtime/start": {
			if (coordinatorThreadId === null || params.threadId !== coordinatorThreadId) {
				reject(frame as never, "Realtime start must target the retained coordinator thread.");
				return;
			}
			realtimeSessionId = String(params.realtimeSessionId);
			respond(frame as never, {});
			setTimeout(() => {
				const userTranscript = {
					id: "controlled-user-transcript",
					realtimeSessionId,
					type: "transcriptSegment",
					role: "user",
					text: "Show the controlled voice context.",
				};
				const assistantTranscript = {
					id: "controlled-assistant-transcript",
					realtimeSessionId,
					type: "transcriptSegment",
					role: "assistant",
					text: "The controlled voice context is visible.",
				};
				notify("thread/realtime/sdp", {
					threadId: params.threadId,
					sdp: "controlled-answer-sdp",
				});
				notify("thread/realtime/started", {
					threadId: params.threadId,
					realtimeSessionId,
					version: "v3",
				});
				notify("thread/realtime/item/started", {
					threadId: params.threadId,
					item: userTranscript,
				});
				notify("thread/realtime/item/completed", {
					threadId: params.threadId,
					item: userTranscript,
				});
				notify("thread/realtime/item/started", {
					threadId: params.threadId,
					item: assistantTranscript,
				});
				notify("thread/realtime/item/completed", {
					threadId: params.threadId,
					item: assistantTranscript,
				});
			}, 10);
			return;
		}
		case "thread/realtime/stop":
			if (coordinatorThreadId === null || params.threadId !== coordinatorThreadId) {
				reject(frame as never, "Realtime stop must target the retained coordinator thread.");
				return;
			}
			record({ kind: "realtime_stop", realtimeSessionId, threadId: params.threadId });
			respond(frame as never, {});
			realtimeSessionId = null;
			return;
		case "thread/delete":
			threads.delete(String(params.threadId));
			respond(frame as never, {});
			return;
		default:
			respond(frame as never, {});
	}
};

let input = "";
process.stdin.on("data", (chunk) => {
	input += chunk.toString();
	let newline: number;
	while ((newline = input.indexOf("\n")) >= 0) {
		const line = input.slice(0, newline);
		input = input.slice(newline + 1);
		if (line.trim().length === 0) continue;
		try {
			handle(JSON.parse(line) as WireFrame);
		} catch (error) {
			record({ kind: "fixture_error", message: String(error), stack: (error as Error).stack });
			process.stderr.write(`${String(error)}\n`);
			process.exit(19);
		}
	}
});
process.stdin.resume();

const controlTimer = setInterval(() => {
	try {
		const control = JSON.parse(readFileSync(controlPath, "utf8")) as {
			exit?: unknown;
			completeLogin?: boolean;
			completeWorkhorseTurn?: boolean;
		};
		if (control.exit === true) process.exit(17);
		const workhorse = threads.get(workhorseThreadId ?? "");
		const turn = workhorse?.turns[0];
		if (control.completeWorkhorseTurn === true && workhorse && turn?.status === "inProgress") {
			turn.status = "completed";
			turn.completedAt = Date.now();
			workhorse.status = { type: "idle" };
			notify("turn/completed", { threadId: workhorse.id, turn });
			notify("thread/status/changed", { threadId: workhorse.id, status: workhorse.status });
		}
		if (control.completeLogin === true && pendingLogin) {
			pendingLogin = false;
			signedIn = true;
			notify("account/login/completed", {
				loginId: "browser-login",
				success: true,
				error: null,
				onboardingEntrypoint: null,
			});
			notify("account/updated", { authMode: "chatgpt", planType: "pro" });
		}
	} catch {
		// The controller updates atomically enough for this bounded test-only poll.
	}
}, 20);
controlTimer.unref();
