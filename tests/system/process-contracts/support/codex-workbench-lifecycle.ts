import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

import {
	type ApplicationSocket,
	type WorkbenchResult,
} from "../../canvas-state/support/codex-production.ts";
import { waitFor } from "../../canvas-state/support/http.ts";
import { buildOwnedCanvasEnvironment } from "../../support/owned-canvas.ts";
const repoRoot = resolve(import.meta.dir, "../../../..");
const fixtureSource = join(repoRoot, "tests/system/canvas-state/fixtures/fake-codex-production.ts");
const serverEntry = join(repoRoot, "src/server.ts");

export interface FixtureRecord {
	readonly kind?: string;
	readonly id?: string;
	readonly method?: string;
	readonly pid?: number;
	readonly scenario?: string;
	readonly params?: Record<string, unknown>;
	readonly frame?: {
		readonly id?: unknown;
		readonly result?: unknown;
		readonly error?: { readonly code?: unknown; readonly message?: unknown };
	};
}

export interface CanvasProcess {
	readonly base: string;
	readonly pid: number;
	output(): string;
	normalClose(): Promise<void>;
	dispose(signal?: NodeJS.Signals): Promise<void>;
}

export type StorageMode =
	| "env-only"
	| "null"
	| "redirected"
	| "symlink"
	| "conflicting"
	| "requirements-match"
	| "requirements-conflict";
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
export const records = (path: string): FixtureRecord[] => {
	const contents = readFileSync(path, "utf8");
	const lines = contents.split("\n");
	if (!contents.endsWith("\n")) lines.pop();
	return lines.filter(Boolean).map((line) => JSON.parse(line) as FixtureRecord);
};

export const reverseResponses = (path: string, id: string): FixtureRecord[] =>
	records(path).filter((entry) => entry.kind === "reverse_response" && entry.frame?.id === id);
export const snapshot = (result: WorkbenchResult): Record<string, unknown> => {
	if (!result.ok) throw new Error(result.error ?? "The workbench snapshot failed.");
	const value = result.value as { readonly snapshot?: Record<string, unknown> } | undefined;
	if (value?.snapshot === undefined) throw new Error("The workbench returned no snapshot.");
	return value.snapshot;
};

export const target = (result: WorkbenchResult): Record<string, unknown> => {
	if (!result.ok || result.value === undefined)
		throw new Error(result.error ?? "The workbench lease failed.");
	return {
		commandId: result.value.commandId,
		paneId: result.value.paneId,
		childId: result.value.childId,
		epoch: result.value.epoch,
	};
};
export const pane = (clientId: string) => ({
	clientId,
	paneId: "lifecycle-pane",
	primary: true,
	focused: true,
	elementCount: 0,
	board: "scratch",
	rect: { x: 0, y: 0, width: 1280, height: 800 },
	viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 },
});
async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((done, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, done);
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("No loopback port.");
	await new Promise<void>((done, reject) =>
		server.close((error) => (error === undefined ? done() : reject(error))),
	);
	return address.port;
}
export async function startCanvas(options: {
	readonly root: string;
	readonly vault: string;
	readonly executablePath: string;
	readonly logPath: string;
	readonly controlPath: string;
	readonly readinessTimeoutMs?: number;
}): Promise<CanvasProcess> {
	const port = await freePort();
	const base = `http://127.0.0.1:${port}`;
	const wrapper = join(options.root, "production-server.ts");
	const executableModule = join(repoRoot, "src/runtime/codex-process/executable.ts");
	const paths = {
		home: join(options.root, "home"),
		xdgConfig: join(options.root, "xdg-config"),
		xdgState: join(options.root, "state"),
		temporary: join(options.root, "tmp"),
	};
	for (const directory of Object.values(paths))
		mkdirSync(directory, { recursive: true, mode: 0o700 });
	writeFileSync(
		wrapper,
		`import { mock } from "bun:test";\n` +
			`mock.module(${JSON.stringify(executableModule)}, () => ({ resolveProjectCodexExecutable: () => process.env.ARCHBOARD_TEST_CODEX_EXECUTABLE }));\n` +
			`const { startServer } = await import(${JSON.stringify(serverEntry)});\n` +
			`await startServer();\n`,
	);
	const child = spawn(process.execPath, [wrapper], {
		cwd: repoRoot,
		detached: true,
		env: buildOwnedCanvasEnvironment({
			paths,
			port,
			vault: options.vault,
			env: {
				ARCHBOARD_TEST_CODEX_EXECUTABLE: options.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: options.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: options.controlPath,
				ARCHBOARD_SETTLE_MS: "20",
			},
		}),
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (child.pid === undefined) throw new Error("The canvas has no pid.");
	let output = "";
	child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
	child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
	let exited = false;
	const exit = new Promise<void>((done) =>
		child.once("exit", () => {
			exited = true;
			done();
		}),
	);
	const canvas: CanvasProcess = {
		base,
		pid: child.pid,
		output: () => output,
		async normalClose() {
			if (exited) return;
			child.kill("SIGTERM");
			if (!(await Promise.race([exit.then(() => true), sleep(5_000).then(() => false)])))
				throw new Error(`Canvas ${child.pid} did not close normally.\n${output}`);
		},
		async dispose(signal = "SIGTERM") {
			if (!exited) {
				try {
					process.kill(-child.pid!, signal);
				} catch {
					child.kill(signal);
				}
				if (!(await Promise.race([exit.then(() => true), sleep(5_000).then(() => false)]))) {
					try {
						process.kill(-child.pid!, "SIGKILL");
					} catch {
						child.kill("SIGKILL");
					}
					await Promise.race([exit, sleep(5_000)]);
				}
			}
			if (!exited) throw new Error(`Canvas ${child.pid} did not exit.\n${output}`);
		},
	};
	try {
		await waitFor(
			async () => {
				try {
					const response = await fetch(`${base}/health`);
					if (!response.ok) return undefined;
					const health = (await response.json()) as { readonly pid?: unknown };
					return health.pid === child.pid ? health : undefined;
				} catch {
					if (exited) throw new Error(`Canvas startup failed.\n${output}`);
					return undefined;
				}
			},
			"production canvas readiness",
			{ timeoutMs: options.readinessTimeoutMs },
		);
	} catch (error) {
		await canvas.dispose();
		throw new Error(`Canvas did not become ready.\n${output}`, { cause: error });
	}
	return canvas;
}

export function extendFixture(root: string, storageMode?: StorageMode): string {
	const source = readFileSync(fixtureSource, "utf8")
		.replace(
			'import { appendFileSync, readFileSync } from "node:fs";',
			'import { appendFileSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";',
		)
		.replace(
			"const configResponse = () => ({",
			String.raw`const storageMode = process.env.ARCHBOARD_TEST_STORAGE_MODE;
const redirectedSqliteHome = storageMode === "conflicting" || storageMode === "requirements-conflict"
	? String(process.env.CODEX_SQLITE_HOME) + "/../conflicting-sqlite"
	: storageMode === "symlink"
		? String(process.env.CODEX_SQLITE_HOME) + "/../sqlite-alias"
		: process.env.CODEX_SQLITE_HOME;
if ((storageMode === "conflicting" || storageMode === "requirements-conflict") && redirectedSqliteHome !== undefined)
	mkdirSync(redirectedSqliteHome, { recursive: true, mode: 0o700 });
if (storageMode === "symlink" && redirectedSqliteHome !== undefined && process.env.CODEX_SQLITE_HOME !== undefined) {
	try { symlinkSync(process.env.CODEX_SQLITE_HOME, redirectedSqliteHome, "dir"); } catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
}

const managedRequirementKeys = [
	"cliAuthCredentialsStore", "chatgptBaseUrl", "additionalDeveloperInstructions",
	"allowedApprovalPolicies", "allowedApprovalsReviewers", "allowedSandboxModes",
	"allowedWindowsSandboxImplementations", "allowedPermissionProfiles", "defaultPermissions",
	"allowedWebSearchModes", "allowManagedHooksOnly", "allowBrowserAndComputerUse", "allowAppshots",
	"allowRemoteControl", "computerUse", "browserUse", "inAppBrowser", "featureRequirements", "hooks",
	"enforceResidency", "network", "autoReview", "models", "logDir", "modelCatalogJson",
	"checkForUpdateOnStartup", "allowLoginShell", "feedback", "windowsSandboxPrivateDesktop",
] as const;
const managedRequirements = (sqliteHome: string) => ({
	...Object.fromEntries(managedRequirementKeys.map((key) => [key, null])),
	sqliteHome,
});

const configResponse = () => ({`,
		)
		.replace(
			"config: { ...configFixture, sqlite_home: process.env.CODEX_SQLITE_HOME },",
			'config: { ...configFixture, ...(storageMode === "env-only" ? {} : { sqlite_home: storageMode === "null" ? null : redirectedSqliteHome }) },',
		)
		.replace(
			"codexHome: process.env.CODEX_HOME,",
			'codexHome: storageMode === "redirected" ? process.env.CODEX_SQLITE_HOME : process.env.CODEX_HOME,',
		)
		.replace(
			"respond(frame as never, { requirements: null });",
			'respond(frame as never, { requirements: storageMode === "requirements-match" ? managedRequirements(String(process.env.CODEX_SQLITE_HOME)) : storageMode === "requirements-conflict" ? managedRequirements(String(process.env.CODEX_SQLITE_HOME) + "/../conflicting-sqlite") : null });',
		)
		.replace(
			"const storageMode = process.env.ARCHBOARD_TEST_STORAGE_MODE;",
			`const storageMode = ${JSON.stringify(storageMode)};`,
		);
	const extraRequests = String.raw`
const registerDynamicCall = (callId: string, tool: string, argumentsValue: Record<string, unknown>): void => {
	if (workhorseThreadId === null) return;
	const turn = threads.get(workhorseThreadId)?.turns[0];
	if (turn === undefined) return;
	const items = (turn.items as Record<string, unknown>[] | undefined) ?? [];
	turn.items = [...items, { type: "dynamicToolCall", id: callId, namespace: "archboard_app", tool, arguments: argumentsValue, status: "inProgress", contentItems: null, success: null, durationMs: null }];
};

const emitLifecycleRequests = (): void => {
	if (workhorseThreadId === null) return;
	const threadId = workhorseThreadId;
	const turnId = "turn-1";
	request("approval-file", "item/fileChange/requestApproval", { threadId, turnId, itemId: "item-file", startedAtMs: 1000, reason: "file", grantRoot: process.cwd() });
	request("approval-input", "item/tool/requestUserInput", { threadId, turnId, itemId: "item-input", questions: [{ id: "q", header: "Question", question: "Continue?", isOther: false, isSecret: false, options: null }], isBlocking: false, autoResolutionMs: null });
	request("approval-elicitation", "mcpServer/elicitation/request", { threadId, turnId: null, serverName: "fixture", mode: "form", _meta: null, message: "Provide a value", requestedSchema: { type: "object", properties: { answer: { type: "string" } } } });
	request("approval-permissions", "item/permissions/requestApproval", { threadId, turnId, itemId: "item-permissions", environmentId: null, startedAtMs: 1000, cwd: process.cwd(), reason: "permissions", permissions: { network: null, fileSystem: null } });
	request("approval-patch", "applyPatchApproval", { conversationId: threadId, callId: "call-patch", fileChanges: { "/tmp/fixture": { type: "add", content: "fixture" } }, reason: "patch", grantRoot: "/tmp" });
	request("approval-exec", "execCommandApproval", { conversationId: threadId, callId: "call-exec", approvalId: null, command: ["true"], cwd: process.cwd(), reason: "exec", parsedCmd: [] });
	request("session-time", "currentTime/read", { threadId });
	request("session-token", "account/chatgptAuthTokens/refresh", { reason: "unauthorized", previousAccountId: null });
	request("session-attestation", "attestation/generate", {});
};
const generalQueryItems = [
	{ type: "dynamicToolCall", id: "general-list", namespace: "archboard_app", tool: "list_threads", arguments: { limit: 10 }, status: "inProgress", contentItems: null, success: null, durationMs: null },
	{ type: "dynamicToolCall", id: "general-read", namespace: "archboard_app", tool: "read_thread", arguments: { threadId: "thread-3", turnLimit: 2, includeOutputs: true }, status: "inProgress", contentItems: null, success: null, durationMs: null },
	{ type: "dynamicToolCall", id: "general-wait", namespace: "archboard_app", tool: "wait_threads", arguments: { threadIds: ["thread-3"], timeoutMs: 0 }, status: "inProgress", contentItems: null, success: null, durationMs: null },
];
const emitGeneralQuery = (tool: "list_threads" | "read_thread" | "wait_threads"): void => {
	if (workhorseThreadId === null) return;
	const id = "general-" + tool.split("_")[0];
	const argumentsValue = tool === "list_threads" ? { limit: 10 } : tool === "read_thread" ? { threadId: "thread-3", turnLimit: 2, includeOutputs: true } : { threadIds: ["thread-3"], timeoutMs: 0 };
	const item = ((threads.get(workhorseThreadId)?.turns[0]?.items as Record<string, unknown>[] | undefined) ?? []).find((candidate) => candidate.id === id);
	if (item !== undefined) notify("item/started", { threadId: workhorseThreadId, turnId: "turn-1", item, startedAtMs: Date.now() });
	request(id, "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: id, namespace: "archboard_app", tool, arguments: argumentsValue });
};

let shutdownBatchSent = false;
const emitShutdownBatch = (): void => {
	if (shutdownBatchSent || workhorseThreadId === null) return;
	shutdownBatchSent = true;
	const waitTarget = threads.get("thread-3");
	if (waitTarget !== undefined) {
		waitTarget.status = { type: "active", activeFlags: [] };
		waitTarget.turns = [{ id: "shutdown-target-turn", items: [], itemsView: "full", status: "inProgress", error: null, startedAt: Date.now(), completedAt: null, durationMs: null }];
	}
	registerDynamicCall("shutdown-dynamic", "create_thread", { prompt: "This authority must end at shutdown." });
	registerDynamicCall("shutdown-wait", "wait_threads", { threadIds: ["thread-3"], timeoutMs: 120000 });
	request("shutdown-ordinary", "item/commandExecution/requestApproval", { threadId: workhorseThreadId, turnId: "turn-1", itemId: "shutdown-item", kind: "command", startedAtMs: Date.now(), approvalId: "shutdown-approval", environmentId: null, reason: "shutdown ordinary", networkApprovalContext: null, command: "true", cwd: process.cwd(), commandActions: null, additionalPermissions: null, proposedExecpolicyAmendment: null, proposedNetworkPolicyAmendments: null, availableDecisions: ["accept", "decline", "cancel"] });
	request("shutdown-dynamic", "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: "shutdown-dynamic", namespace: "archboard_app", tool: "create_thread", arguments: { prompt: "This authority must end at shutdown." } });
	request("shutdown-wait", "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: "shutdown-wait", namespace: "archboard_app", tool: "wait_threads", arguments: { threadIds: ["thread-3"], timeoutMs: 120000 } });
};

let disconnectBatchSent = false;
const emitDisconnectBatch = (): void => {
	if (disconnectBatchSent || workhorseThreadId === null) return;
	disconnectBatchSent = true;
	registerDynamicCall("disconnect-dynamic", "create_thread", { prompt: "This authority must end with the browser." });
	request("disconnect-ordinary", "item/fileChange/requestApproval", { threadId: workhorseThreadId, turnId: "turn-1", itemId: "disconnect-file", startedAtMs: Date.now(), reason: "disconnect ordinary", grantRoot: process.cwd() });
	request("disconnect-dynamic", "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: "disconnect-dynamic", namespace: "archboard_app", tool: "create_thread", arguments: { prompt: "This authority must end with the browser." } });
};

let forkSent = false;
const emitFork = (): void => {
	if (forkSent || workhorseThreadId === null) return;
	forkSent = true;
	const argumentsValue = { threadId: workhorseThreadId, prompt: "Fork the current controlled process thread." };
	registerDynamicCall("general-fork", "fork_thread", argumentsValue);
	request("general-fork", "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: "general-fork", namespace: "archboard_app", tool: "fork_thread", arguments: argumentsValue });
};

let sendSent = false;
const emitSend = (): void => {
	if (sendSent || workhorseThreadId === null) return;
	sendSent = true;
	const argumentsValue = { threadId: "thread-3", prompt: "Send through the controlled process." };
	registerDynamicCall("general-send", "send_message_to_thread", argumentsValue);
	request("general-send", "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: "general-send", namespace: "archboard_app", tool: "send_message_to_thread", arguments: argumentsValue });
};

let coordinatorCallSent = false;
const emitCoordinatorCall = (): void => {
	if (coordinatorCallSent) return;
	coordinatorCallSent = true;
	const coordinator = threads.get("thread-1");
	if (coordinator === undefined) return;
	coordinator.status = { type: "active", activeFlags: [] };
	coordinator.turns = [{ id: "coordinator-call-turn", items: [{ type: "dynamicToolCall", id: "coordinator-inspect", namespace: "archboard_workhorse", tool: "inspect_workhorse", arguments: {}, status: "inProgress", contentItems: null, success: null, durationMs: null }], itemsView: "full", status: "inProgress", error: null, startedAt: Date.now(), completedAt: null, durationMs: null }];
	request("coordinator-inspect", "item/tool/call", { threadId: "thread-1", turnId: "coordinator-call-turn", callId: "coordinator-inspect", namespace: "archboard_workhorse", tool: "inspect_workhorse", arguments: {} });
};

let declineSent = false;
const emitDecline = (): void => {
	if (declineSent || workhorseThreadId === null) return;
	declineSent = true;
	const argumentsValue = { prompt: "Decline this controlled process effect." };
	registerDynamicCall("general-decline", "create_thread", argumentsValue);
	request("general-decline", "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: "general-decline", namespace: "archboard_app", tool: "create_thread", arguments: argumentsValue });
};

let staleSent = false;
const emitStale = (): void => {
	if (staleSent || workhorseThreadId === null) return;
	staleSent = true;
	const argumentsValue = { prompt: "Become stale before this controlled effect." };
	registerDynamicCall("general-stale", "create_thread", argumentsValue);
	request("general-stale", "item/tool/call", { threadId: workhorseThreadId, turnId: "turn-1", callId: "general-stale", namespace: "archboard_app", tool: "create_thread", arguments: argumentsValue });
};

const invalidateStale = (): void => {
	if (workhorseThreadId === null) return;
	const turn = threads.get(workhorseThreadId)?.turns[0];
	const items = (turn?.items as Record<string, unknown>[] | undefined) ?? [];
	const call = items.find((item) => item.id === "general-stale");
	if (call !== undefined) {
		Object.assign(call, { status: "completed", contentItems: [], success: false, durationMs: 1 });
		record({ kind: "stale_invalidated" });
	}
};
`;
	const withRequests = source.replace(
		"const handle = (frame: WireFrame): void => {",
		`${extraRequests}\nconst handle = (frame: WireFrame): void => {`,
	);
	const withGeneralList = withRequests.replace(
		"data: [...threads.values()],",
		'data: params.limit === 10 ? [threads.get("thread-3")].filter(Boolean) : [...threads.values()],',
	);
	const withGeneralItems = withGeneralList.replace(
		"items: isWorkhorse ? [dynamicItem] : [],",
		"items: isWorkhorse ? [dynamicItem, ...generalQueryItems] : [],",
	);
	const withEmission = withGeneralItems.replace(
		"if (isWorkhorse) setTimeout(emitReverseRequests, 10);",
		"if (isWorkhorse) { setTimeout(emitReverseRequests, 10); setTimeout(emitLifecycleRequests, 10); }",
	);
	const withFork = withEmission.replace(
		'\t\tcase "thread/start": {',
		'\t\tcase "thread/fork": {\n\t\t\tconst thread = createThread(params);\n\t\t\tthread.forkedFromId = String(params.threadId);\n\t\t\trespond(frame as never, threadStartResponse(params, thread));\n\t\t\treturn;\n\t\t}\n\t\tcase "thread/start": {',
	);
	const withCoordinatorRetirement = withFork.replace(
		'\t\trecord({ kind: "reverse_response", frame });\n\t\treturn;',
		'\t\trecord({ kind: "reverse_response", frame });\n\t\tfor (const thread of threads.values()) for (const turn of thread.turns) for (const item of (turn.items as Record<string, unknown>[] | undefined) ?? []) if (item.id === frame.id) { const returned = frame.result as { contentItems?: unknown; success?: unknown } | undefined; Object.assign(item, { status: "completed", contentItems: returned?.contentItems ?? [], success: returned?.success ?? false, durationMs: 1 }); }\n\t\tif (frame.id === "coordinator-inspect") { const coordinator = threads.get("thread-1"); if (coordinator !== undefined) { coordinator.status = { type: "idle" }; coordinator.turns = []; } }\n\t\treturn;',
	);
	const withShutdown = withCoordinatorRetirement.replace(
		"if (control.exit === true) process.exit(17);",
		'if ((control as { emit?: unknown }).emit === "list") emitGeneralQuery("list_threads");\n\t\tif ((control as { emit?: unknown }).emit === "read") emitGeneralQuery("read_thread");\n\t\tif ((control as { emit?: unknown }).emit === "wait") emitGeneralQuery("wait_threads");\n\t\tif ((control as { emit?: unknown }).emit === "fork") emitFork();\n\t\tif ((control as { emit?: unknown }).emit === "send") emitSend();\n\t\tif ((control as { emit?: unknown }).emit === "coordinator") emitCoordinatorCall();\n\t\tif ((control as { emit?: unknown }).emit === "decline") emitDecline();\n\t\tif ((control as { emit?: unknown }).emit === "stale") emitStale();\n\t\tif ((control as { emit?: unknown }).emit === "invalidate_stale") invalidateStale();\n\t\tif ((control as { emit?: unknown }).emit === "shutdown") emitShutdownBatch();\n\t\tif ((control as { emit?: unknown }).emit === "disconnect") emitDisconnectBatch();\n\t\tif (control.exit === true) process.exit(17);',
	);
	if (
		withRequests === source ||
		withGeneralList === withRequests ||
		withGeneralItems === withGeneralList ||
		withEmission === withGeneralItems ||
		withFork === withEmission ||
		withCoordinatorRetirement === withFork ||
		withShutdown === withCoordinatorRetirement
	)
		throw new Error("The controlled production fixture injection point drifted.");
	const path = join(root, "fake-codex-lifecycle.ts");
	writeFileSync(path, withShutdown);
	chmodSync(path, 0o700);
	return path;
}

export async function approveOrdinary(
	socket: ApplicationSocket,
	approval: Record<string, unknown>,
) {
	const lease = await socket.request("claimLease");
	const kind = String(approval.approvalKind);
	const responses: Record<string, Record<string, unknown>> = {
		command_execution: { approvalKind: kind, decision: "accept" },
		file_change: { approvalKind: kind, decision: "accept" },
		user_input: { approvalKind: kind, answers: { q: { answers: ["yes"] } } },
		elicitation: { approvalKind: kind, action: "accept", content: { answer: "yes" }, _meta: null },
		permissions: {
			approvalKind: kind,
			permissions: {
				network: { enabled: false },
				fileSystem: { read: [], write: [], entries: [] },
			},
			scope: "turn",
		},
		apply_patch: { approvalKind: kind, decision: "approved" },
		exec_command: { approvalKind: kind, decision: "approved" },
	};
	const response = responses[kind];
	if (response === undefined) throw new Error(`Unknown ordinary approval family ${kind}.`);
	return socket.request("command", {
		command: {
			kind: "browser_command",
			command: "approvalRespond",
			...target(lease),
			requestId: approval.requestId,
			approvalId: approval.approvalId,
			response,
		},
	});
}

export async function resolveDynamic(
	socket: ApplicationSocket,
	approval: Record<string, unknown>,
	decision: "approve" | "decline" = "approve",
) {
	const lease = await socket.request("claimLease");
	const binding = approval.binding as Record<string, unknown>;
	return socket.request("command", {
		command: {
			kind: "browser_command",
			command: "dynamicApprovalRespond",
			...target(lease),
			capturedLink: binding.capturedLink,
			identity: approval.identity,
			effectHash: approval.effectHash,
			decision,
		},
	});
}
