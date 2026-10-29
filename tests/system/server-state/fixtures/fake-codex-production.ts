#!/usr/bin/env bun
import { explanationQueue, completeExplanationTurn } from "./fake-codex-explanation-queue.ts";
import { appendFileSync, readFileSync } from "node:fs";
import {
	configFixture,
	dynamicItem,
	explainStep,
	narrating,
	speakAgain,
	startRealtime,
	coordinatorModelFixture,
	modelFixtures,
	promptItem,
	unixSeconds,
	unsetThreadFields,
	workhorsePlan,
	workhorseTokenUsage,
	interruptFixtureTurn,
	ordinaryApproval,
	type FixtureThread,
} from "./fake-codex-production-data.ts";
const logPath = "__ARCHBOARD_TEST_CODEX_LOG__";
const controlPath = "__ARCHBOARD_TEST_CODEX_CONTROL__";
const initialControl = JSON.parse(readFileSync(controlPath, "utf8")) as {
	signedOut?: boolean;
	ordinaryOnly?: boolean;
	explanationQueue?: boolean;
};
let signedIn = initialControl.signedOut !== true;
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
	process.stdout.write("codex-cli 0.160.0\n");
	process.exit(0);
}
if (
	JSON.stringify(process.argv.slice(2)) !==
	JSON.stringify(["app-server", "--stdio", "--strict-config"])
) {
	process.stderr.write("production fixture argv rejected\n");
	process.exit(9);
}
const archboardKeys = ["ARCHBOARD_URL", "ARCHBOARD_NO_AUTOSTART"];
const archboard = Object.fromEntries(archboardKeys.map((key) => [key, process.env[key] ?? null]));
record({ kind: "app_server_spawn", pid: process.pid, args: process.argv.slice(2), archboard });
record({ kind: "app_server_cwd", cwd: process.cwd() });
type WireFrame = {
	readonly id?: unknown;
	readonly method?: string;
	readonly params?: Record<string, unknown>;
	readonly result?: unknown;
	readonly error?: unknown;
};
const threads = new Map<string, FixtureThread>();
const queueControl = () => JSON.parse(readFileSync(controlPath, "utf8"));
const handleExplanationQueue = explanationQueue(threads, respond, notify, queueControl, reject);
let threadSequence = readFileSync(logPath, "utf8").split('"thread/start","result"').length - 1;
let turnSequence = 0;
// Every thread started on the coordinator's model. As in Codex, any number of them may run, one
// per browser tab, and each carries at most one realtime conversation at a time.
const coordinatorThreads = new Set<string>();
const realtimeSessions = new Map<string, string>();
// The first workhorse thread: its turn waits on the approvals this fixture raises, once.
let workhorseThreadId: string | null = null;
let reverseRequestsSent = false;
let speechSequence = 0;
const configResponse = () => ({
	config: { ...configFixture, sqlite_home: process.env["CODEX_SQLITE_HOME"] },
	origins: {
		sqlite_home: {
			name: {
				type: "user",
				file: `${process.env["CODEX_HOME"]}/config.toml`,
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
		cwd: String(params["cwd"]),
		cliVersion: "0.160.0",
		source: "vscode",
		canAcceptDirectInput: true,
		threadSource: params["threadSource"],
		...unsetThreadFields,
		turns: [],
	}) satisfies FixtureThread;

const createThread = (params: Record<string, unknown>): FixtureThread => {
	const id = `thread-${++threadSequence}`;
	const thread = buildThread(id, params, threadSequence);
	threads.set(id, thread);
	if (params["model"] === coordinatorModelFixture.model) {
		coordinatorThreads.add(id);
	} else if (workhorseThreadId === null) {
		workhorseThreadId = id;
	}
	return thread;
};

const threadStartResponse = (params: Record<string, unknown>, thread: FixtureThread) => ({
	thread,
	model: typeof params["model"] === "string" ? params["model"] : "gpt-6-luna",
	modelProvider: "openai",
	serviceTier: params["serviceTier"] ?? null,
	cwd: params["cwd"],
	runtimeWorkspaceRoots: params["runtimeWorkspaceRoots"],
	instructionSources: [],
	approvalPolicy: "never",
	approvalsReviewer: "user",
	sandbox: { type: "dangerFullAccess" },
	activePermissionProfile: null,
	// A thread starts at its model's default effort; a settings update moves it.
	reasoningEffort:
		modelFixtures.find(({ model }) => model === params["model"])?.defaultReasoningEffort ?? null,
	multiAgentMode: "explicitRequestOnly",
	disabledPluginIds: [],
});

const coordinatorSettings = (params: Record<string, unknown>) => ({
	cwd: threads.get(String(params["threadId"]))?.["cwd"],
	approvalPolicy: "never",
	approvalsReviewer: "user",
	sandboxPolicy: { type: "dangerFullAccess" },
	activePermissionProfile: null,
	model: params["model"],
	modelProvider: "openai",
	serviceTier: params["serviceTier"] ?? null,
	effort: params["effort"],
	summary: "auto",
	collaborationMode: {
		mode: "default",
		settings: {
			model: params["model"],
			reasoning_effort: params["effort"],
			developer_instructions: null,
		},
	},
	multiAgentMode: "explicitRequestOnly",
	disabledPluginIds: [],
	personality: null,
});

const emitReverseRequests = (): void => {
	if (reverseRequestsSent || workhorseThreadId === null) {
		return;
	}
	reverseRequestsSent = true;
	request(
		"ordinary-request-1",
		"item/commandExecution/requestApproval",
		ordinaryApproval(workhorseThreadId),
	);
	// An independent host exercises ordinary approvals without application-specific tools.
	if (initialControl.ordinaryOnly === true) return;
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
	if (
		frame.method === "account/read" &&
		(JSON.parse(readFileSync(controlPath, "utf8")) as { accountReadFails?: boolean })
			.accountReadFails === true
	) {
		record({ kind: "fixture_rejection", method: frame.method });
		send({ id: frame.id, error: { code: -32603, message: "workspace routing discovery failed" } });
		return;
	}
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
				userAgent: "Codex Desktop/0.160.0",
				codexHome: process.env["CODEX_HOME"],
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
				workspaceRouting: null,
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
			respond(frame as never, { data: modelFixtures, nextCursor: null });
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
					threadId: params["threadId"],
					threadSettings: coordinatorSettings(params),
				}),
			);
			return;
		case "thread/list":
			respond(frame as never, {
				// Newly started empty threads are loaded/readable before they enter persisted history.
				data: [...threads.values()].filter((thread) => thread.turns.length > 0),
				nextCursor: null,
				backwardsCursor: null,
			});
			return;
		case "thread/loaded/list":
			respond(frame as never, { data: [...threads.keys()], nextCursor: null });
			return;
		case "thread/read":
			if (params["includeTurns"] === true) {
				reject(frame as never, "list_turns is not supported yet");
				return;
			}
			respond(frame as never, { thread: threads.get(String(params["threadId"])) });
			return;
		case "thread/queue/add":
		case "thread/queue/start":
		case "thread/queue/delete":
		case "thread/queue/list":
			if (initialControl.explanationQueue && handleExplanationQueue(frame)) return;
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
			const turns = threads.get(String(params["threadId"]))?.turns ?? [];
			respond(frame as never, {
				data: params["sortDirection"] === "asc" ? turns : turns.toReversed(), // Codex's default order
				nextCursor: null,
				backwardsCursor: null,
			});
			return;
		}
		case "thread/items/list": {
			const thread = threads.get(String(params["threadId"]));
			respond(frame as never, {
				data: (thread?.turns ?? []).flatMap((turn) =>
					((turn["items"] as Record<string, unknown>[] | undefined) ?? []).map((item) => ({
						turnId: turn["id"],
						item,
						startedAtMs: null,
						completedAtMs: null,
					})),
				),
				nextCursor: null,
				backwardsCursor: null,
			});
			return;
		}
		case "turn/start": {
			const thread = threads.get(String(params["threadId"]));
			const isWorkhorse = thread?.id === workhorseThreadId;
			const id = `turn-${++turnSequence}`;
			const prompt = promptItem(`${id}-prompt`, params["input"]);
			const turn = {
				id,
				items:
					isWorkhorse && initialControl.ordinaryOnly !== true ? [prompt, dynamicItem] : [prompt],
				itemsView: "full",
				status: isWorkhorse ? "inProgress" : "completed",
				error: null,
				startedAt: unixSeconds(),
				completedAt: isWorkhorse ? null : unixSeconds(),
				durationMs: isWorkhorse ? null : 1,
			};
			if (thread !== undefined) {
				thread.turns = [turn];
				thread.status = isWorkhorse
					? { type: "active", activeFlags: ["waitingOnApproval"] }
					: { type: "idle" };
			}
			respond(frame as never, { turn });
			if (isWorkhorse) {
				notify("turn/started", { threadId: thread?.id, turn }); // as Codex announces a turn
				setTimeout(emitReverseRequests, 10);
			}
			return;
		}
		case "thread/inject_items":
			record({ kind: "context_injection", params });
			respond(frame as never, {});
			return;
		case "turn/interrupt": {
			respond(frame as never, {});
			interruptFixtureTurn(threads.get(String(params["threadId"])), params["turnId"], notify);
			return;
		}
		case "thread/realtime/start": {
			const threadId = String(params["threadId"]);
			if (!coordinatorThreads.has(threadId)) {
				reject(frame as never, "Realtime start must target a coordinator thread.");
				return;
			}
			if (realtimeSessions.has(threadId)) {
				reject(frame as never, "The thread already carries a realtime conversation.");
				return;
			}
			realtimeSessions.set(threadId, String(params["realtimeSessionId"]));
			respond(frame as never, {});
			setTimeout(() => startRealtime(notify, params, narrating(controlPath)), 10);
			return;
		}
		case "thread/realtime/appendSpeech": {
			respond(frame as never, {});
			const realtimeSessionId = realtimeSessions.get(String(params["threadId"])) ?? null;
			if (narrating(controlPath)) explainStep(notify, params, realtimeSessionId, ++speechSequence);
			return;
		}
		case "thread/realtime/stop": {
			const threadId = String(params["threadId"]);
			const realtimeSessionId = realtimeSessions.get(threadId);
			if (realtimeSessionId === undefined) {
				reject(frame as never, "Realtime stop must target a thread carrying a realtime session.");
				return;
			}
			record({ kind: "realtime_stop", realtimeSessionId, threadId });
			respond(frame as never, {});
			realtimeSessions.delete(threadId);
			return;
		}
		case "thread/delete":
			threads.delete(String(params["threadId"]));
			respond(frame as never, {});
			return;
		case "thread/unsubscribe":
			respond(frame as never, { status: "unsubscribed" });
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
		if (line.trim().length === 0) {
			continue;
		}
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
			explanationText?: string;
			speaks?: number;
		};
		if (control.exit === true) {
			process.exit(17);
		}
		speakAgain(notify, realtimeSessions, control.speaks);
		if (initialControl.explanationQueue) handleExplanationQueue.advance();
		const workhorse = threads.get(workhorseThreadId ?? "");
		const turn = workhorse?.turns[0];
		if (control.completeWorkhorseTurn === true && workhorse && turn?.["status"] === "inProgress") {
			notify("turn/plan/updated", { threadId: workhorse.id, turnId: turn["id"], ...workhorsePlan });
			notify("thread/tokenUsage/updated", {
				threadId: workhorse.id,
				turnId: turn["id"],
				tokenUsage: workhorseTokenUsage,
			});
			if (initialControl.explanationQueue)
				completeExplanationTurn(workhorse.id, turn, notify, control.explanationText);
			turn["status"] = "completed";
			turn["completedAt"] = unixSeconds();
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
		// Bounded test-only poll; the controller updates atomically enough.
	}
}, 20);
controlTimer.unref();
