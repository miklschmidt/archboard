import {
	ApprovalIdSchema,
	BrowserCommandIdSchema,
	BrowserCommandSchema,
	BrowserSnapshotSchema,
	BrowserTextCommandSchema,
	ChildEpochSchema,
	ChildIdSchema,
	DynamicToolCallIdSchema,
	ItemIdSchema,
	JsonRpcRequestIdSchema,
	LoginIdSchema,
	QueuedSubmissionIdSchema,
	RealtimeSessionIdSchema,
	ThreadIdSchema,
	TurnIdSchema,
} from "../index.js";
import type {
	ApprovalId,
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	ItemId,
	JsonRpcRequestId,
	LoginId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "../../codex-workbench-identity/index.js";
import { createIdentityAuthority } from "../../codex-workbench-identity/index.js";
import type { BrowserCommand, BrowserSnapshot, ServerRequest } from "../index.js";

const authority = createIdentityAuthority();
const { decoder, issuer, validator } = authority;
const childId = ChildIdSchema.parse(validator.childId) as ChildId;
const epoch = ChildEpochSchema.parse(validator.epoch) as ChildEpoch;
const requestId = JsonRpcRequestIdSchema.parse(issuer.mintJsonRpcRequestId()) as JsonRpcRequestId;
const commandId = BrowserCommandIdSchema.parse(issuer.mintBrowserCommandId()) as BrowserCommandId;
const threadId = ThreadIdSchema.parse(decoder.adoptThreadId("thread-fixture")) as ThreadId;
const turnId = TurnIdSchema.parse(decoder.adoptTurnId("turn-fixture")) as TurnId;
const itemId = ItemIdSchema.parse(decoder.adoptItemId("item-fixture")) as ItemId;
const approvalId = ApprovalIdSchema.parse(
	decoder.adoptApprovalId("approval-fixture"),
) as ApprovalId;
const toolCallId = DynamicToolCallIdSchema.parse(
	decoder.adoptDynamicToolCallId("call-fixture"),
) as DynamicToolCallId;
const queueId = QueuedSubmissionIdSchema.parse(
	decoder.adoptQueuedSubmissionId("queue-fixture"),
) as QueuedSubmissionId;
const loginId = LoginIdSchema.parse(decoder.adoptLoginId("login-fixture")) as LoginId;
const realtimeSessionId = RealtimeSessionIdSchema.parse(
	issuer.mintRealtimeSessionId(),
) as RealtimeSessionId;

const target = { commandId, paneId: "pane-fixture", childId, epoch };
const readiness = { kind: "readiness" as const, state: "account_ready" as const };
const account = {
	kind: "account" as const,
	state: "ready" as const,
	accountType: "chatgpt" as const,
};
const login = { kind: "login" as const, state: "completed" as const, loginId };
const threadLink = {
	kind: "thread_link" as const,
	state: "executable" as const,
	childId,
	epoch,
	threadId,
	source: "appServer" as const,
	status: "idle" as const,
	loaded: true,
	canAcceptDirectInput: true,
	reason: null,
};
const timeline = {
	kind: "timeline" as const,
	threadId,
	turns: [
		{
			turnId,
			status: "completed" as const,
			items: [{ media: "text" as const, itemId, text: "Hello" }],
			summary: "completed · user: Hello · assistant: Hi",
			outputsIncluded: true,
			outputsTruncated: false,
		},
	],
	nextCursor: null,
};
const queue = {
	kind: "queue" as const,
	status: "outcome_unknown" as const,
	entries: [
		{
			submissionId: queueId,
			prompt: "Queue me",
			status: "queued" as const,
			operationId: toolCallId,
		},
	],
};
const settings = {
	kind: "settings" as const,
	owner: "coordinator" as const,
	model: "gpt-5.6-luna",
	effort: "medium",
	serviceTier: "priority",
	approvalPolicy: "on-request" as const,
	approvalsReviewer: "user" as const,
	sandboxPolicy: { type: "dangerFullAccess" as const },
	activePermissionProfile: null,
};
const approval = {
	kind: "approval" as const,
	approvalKind: "command_execution" as const,
	requestId,
	threadId,
	turnId,
	itemId,
	approvalId,
	expiresAtMs: 1_787_682_840_000,
	reason: null,
	command: "bun test",
	cwd: "/repo",
	availableDecisions: ["accept", "decline"] as const,
};
const semantic = {
	kind: "semantic_delivery" as const,
	threadId,
	delivery: "outcome_unknown" as const,
	capturedAtMs: 1_787_682_840_000,
	freshUntilMs: 1_787_682_870_000,
	reason: null,
};
const coordinator = {
	kind: "coordinator" as const,
	state: "ready" as const,
	threadId,
	activeTurnId: null,
	model: "gpt-5.6-luna",
	effort: "medium",
	serviceTier: "priority",
	reason: null,
};
const voice = {
	kind: "voice" as const,
	state: "active" as const,
	realtimeSessionId,
	transcript: [{ itemId, sequence: 1, speaker: "user" as const, text: "Hello", final: true }],
	delivery: "delivered" as const,
	reason: null,
};
const lease = {
	kind: "command_lease" as const,
	commandId,
	paneId: "pane-fixture",
	childId,
	epoch,
	state: "active" as const,
	expiresAtMs: 1_787_682_990_000,
};
const operation = {
	kind: "operation_outcome" as const,
	operationId: commandId,
	outcome: "outcome_unknown" as const,
	message: "Inspect state.",
};

export function createFixtureIds(): {
	snapshot: BrowserSnapshot;
	textCommand: ReturnType<typeof BrowserTextCommandSchema.parse>;
	browserCommand: BrowserCommand;
	serverRequests: ServerRequest[];
} {
	const snapshot: BrowserSnapshot = BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness,
		account,
		login,
		threadLink,
		timeline,
		queue,
		settings: [settings],
		approvals: [approval],
		semantic,
		coordinator,
		voice,
		lease,
		operation,
	});
	const browserCommand = BrowserCommandSchema.parse({
		...target,
		kind: "browser_command",
		command: "accountLogout",
	});
	const textCommand = BrowserTextCommandSchema.parse({
		...target,
		kind: "text_command",
		command: "start",
		threadId,
		prompt: "Start",
	});
	const base = { id: requestId };
	const serverRequests: ServerRequest[] = [
		{
			...base,
			method: "item/commandExecution/requestApproval",
			params: { kind: "command", threadId, turnId, itemId, startedAtMs: 1, environmentId: null },
		},
		{
			...base,
			method: "item/fileChange/requestApproval",
			params: { threadId, turnId, itemId, startedAtMs: 1 },
		},
		{
			...base,
			method: "item/tool/requestUserInput",
			params: { threadId, turnId, itemId, questions: [], isBlocking: true, autoResolutionMs: null },
		},
		{
			...base,
			method: "mcpServer/elicitation/request",
			params: {
				threadId,
				turnId: null,
				serverName: "server",
				mode: "openai/form",
				_meta: null,
				message: "Input",
				requestedSchema: {},
			},
		},
		{
			...base,
			method: "item/permissions/requestApproval",
			params: {
				threadId,
				turnId,
				itemId,
				environmentId: null,
				startedAtMs: 1,
				cwd: "/repo",
				reason: null,
				permissions: { network: null, fileSystem: null },
			},
		},
		{
			...base,
			method: "item/tool/call",
			params: {
				threadId,
				turnId,
				callId: toolCallId,
				namespace: "archboard",
				tool: "inspect",
				arguments: {},
			},
		},
		{ ...base, method: "account/chatgptAuthTokens/refresh", params: { reason: "unauthorized" } },
		{ ...base, method: "attestation/generate", params: {} },
		{ ...base, method: "currentTime/read", params: { threadId } },
		{
			...base,
			method: "applyPatchApproval",
			params: {
				conversationId: threadId,
				callId: "patch",
				fileChanges: {},
				reason: null,
				grantRoot: null,
			},
		},
		{
			...base,
			method: "execCommandApproval",
			params: {
				conversationId: threadId,
				callId: "exec",
				approvalId: null,
				command: ["bun", "test"],
				cwd: "/repo",
				reason: null,
				parsedCmd: [],
			},
		},
	];
	return { snapshot, textCommand, browserCommand, serverRequests };
}
