import { createDynamicFixture } from "#tests/shared/support/dynamic-approval.ts";
import { expect, test } from "bun:test";

import { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "#runtime/state/spoken-approval/state.ts";
import { createCodexBrowserModel } from "#shared/schemas/browser/model.ts";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "@archboard/codex-app-server/identity";
import { projectCodexBrowserState } from "#server/projections/browser-state/projection.ts";
import {
	type BrowserProjectionInput,
	type CodexSettingsProjectionInput,
	type CodexTimelineProjectionInput,
} from "#server/protocol/projection/projection-contract.ts";

function projectionInput(authorities: IdentityAuthorities): BrowserProjectionInput {
	const threadId = authorities.identity.decoder.adoptThreadId("closure-thread");
	return {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: {
			kind: "codex_account_response",
			response: {
				account: { type: "chatgpt", email: "private@example.test", planType: "plus" },
				requiresOpenaiAuth: true,
				workspaceRouting: null,
			},
		},
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			threadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		timeline: null,
		queue: { kind: "codex_queue", submissions: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		contextDelivery: { kind: "codex_context_delivery", outcome: null, freshness: null },
		coordinator: {
			kind: "codex_coordinator",
			state: "unbound",
			threadId: null,
			configured: null,
			effective: null,
			reason: null,
		},
		voice: {
			kind: "codex_voice",
			unattended: false,
			mediaReady: false,
			generation: null,
			coordinatorState: "unbound",
			transcript: [],
		},
		spokenApproval: EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
		lease: null,
		operation: null,
	};
}

function compileReadonlyTimeline(view: CodexTimelineProjectionInput): void {
	// @ts-expect-error Timeline owner turns are readonly.
	view.turns[0]!.presentation.summary = "mutated";
	const first = view.turns[0]!.items[0]!;
	if (first.kind === "agent_message") {
		// @ts-expect-error Timeline owner source items are deeply readonly.
		first.item.text = "mutated";
	}
}

void compileReadonlyTimeline;

test("timeline projection maps every owner arm with its evidence and omits private extensions", () => {
	const authorities = createIdentityAuthorities();
	const model = createCodexBrowserModel(authorities);
	const input = projectionInput(authorities);
	const decoder = authorities.identity.decoder;
	const threadId = decoder.adoptThreadId("closure-thread");
	const turnId = decoder.adoptTurnId("timeline-turn");
	const promptItemId = decoder.adoptItemId("timeline-prompt");
	const messageItemId = decoder.adoptItemId("timeline-message");
	const toolItemId = decoder.adoptItemId("timeline-tool");
	const commandItemId = decoder.adoptItemId("timeline-command");
	const fileItemId = decoder.adoptItemId("timeline-file");
	const reasoningItemId = decoder.adoptItemId("timeline-reasoning");
	const planItemId = decoder.adoptItemId("timeline-plan");
	const searchItemId = decoder.adoptItemId("timeline-search");
	const compactionItemId = decoder.adoptItemId("timeline-compaction");
	const approvalItemId = decoder.adoptItemId("timeline-approval-item");
	const approvalId = decoder.adoptApprovalId("timeline-approval");
	const breakdown = {
		totalTokens: 120,
		inputTokens: 100,
		cachedInputTokens: 40,
		cacheWriteInputTokens: 0,
		outputTokens: 20,
		reasoningOutputTokens: 5,
	};
	const timeline = {
		kind: "codex_timeline",
		threadId,
		turns: [
			{
				turn: {
					id: turnId,
					status: "failed",
					startedAt: 1_700_000_000,
					completedAt: 1_700_000_003,
					durationMs: 3_250,
					privateTurnPath: "/private/timeline/turn",
				},
				items: [
					{
						kind: "user_message",
						item: {
							type: "userMessage",
							id: promptItemId,
							privatePromptPath: "/private/timeline/prompt",
						},
						text: "Explain the renderer",
					},
					{
						kind: "agent_message",
						item: {
							type: "agentMessage",
							id: messageItemId,
							text: "assistant text",
							privateMessagePath: "/private/timeline/message",
						},
					},
					{
						kind: "tool_call",
						item: {
							type: "mcpToolCall",
							id: toolItemId,
							tool: "fetch_architecture",
							status: "failed",
							durationMs: 12,
							privateToolPath: "/private/timeline/tool",
						},
						server: "example",
						arguments: '{"item":"payments"}',
						error: "item not found",
					},
					{
						kind: "command_execution",
						item: {
							type: "commandExecution",
							id: commandItemId,
							command: "bun test focused",
							status: "completed",
							exitCode: 1,
							durationMs: 900,
							privateCommandPath: "/private/timeline/command",
						},
						cwd: "/repo",
						output: { tail: "1 fail", truncated: true },
					},
					{
						kind: "file_change",
						item: {
							type: "fileChange",
							id: fileItemId,
							status: "declined",
							privateFilePath: "/private/timeline/file",
						},
						changes: [
							{
								path: "src/a.ts",
								kind: "update",
								movePath: "src/b.ts",
								added: 2,
								removed: 1,
								privateDiff: "/private/timeline/diff",
							},
						],
						changesTruncated: false,
					},
					{
						kind: "reasoning_summary",
						item: {
							type: "reasoning",
							id: reasoningItemId,
							privateReasoningPath: "/private/timeline/reasoning",
						},
						text: "reasoning summary",
					},
					{
						kind: "plan",
						item: {
							type: "plan",
							id: planItemId,
							text: "implementation plan",
							privatePlanPath: "/private/timeline/plan",
						},
					},
					{
						kind: "web_search",
						item: {
							type: "webSearch",
							id: searchItemId,
							privateSearchPath: "/private/timeline/search",
						},
						query: "elk layout options",
					},
					{
						kind: "context_compaction",
						item: {
							type: "contextCompaction",
							id: compactionItemId,
							privateCompactionPath: "/private/timeline/compaction",
						},
					},
					{
						kind: "approval_request",
						identity: {
							kind: "item",
							threadId,
							turnId,
							itemId: approvalItemId,
							approvalId,
							privateApprovalPath: "/private/timeline/approval",
						},
						state: "settled",
						privateResolutionPath: "/private/timeline/resolution",
					},
				],
				presentation: {
					summary: "failed turn",
					outputs: { included: true, truncated: false },
					privatePresentationPath: "/private/timeline/presentation",
				},
				error: { message: "stream disconnected", details: "retry later" },
				plan: {
					explanation: "two steps",
					plan: [
						{ step: "read", status: "completed" },
						{ step: "write", status: "inProgress" },
					],
					privatePlanUpdatePath: "/private/timeline/step",
				},
			},
		],
		cursor: "timeline-next",
		usage: {
			total: breakdown,
			last: breakdown,
			modelContextWindow: 258_000,
			privateUsagePath: "/private/timeline/usage",
		},
		activeRealtimeSessionAtPageStart: "private-realtime-session",
	} as const satisfies CodexTimelineProjectionInput & {
		readonly activeRealtimeSessionAtPageStart: string;
	};
	const result = projectCodexBrowserState(model, { ...input, timeline });
	expect(result.tag).toBe("projected");
	if (result.tag !== "projected") {
		throw new Error("timeline projection was refused");
	}
	expect(result.snapshot.timeline).toEqual({
		kind: "timeline",
		threadId: timeline.threadId,
		turns: [
			{
				turnId,
				status: "failed",
				items: [
					{ media: "prompt", itemId: promptItemId, text: "Explain the renderer" },
					{ media: "text", itemId: messageItemId, text: "assistant text" },
					{
						media: "tool",
						itemId: toolItemId,
						name: "fetch_architecture",
						status: "failed",
						server: "example",
						arguments: '{"item":"payments"}',
						durationMs: 12,
						error: "item not found",
					},
					{
						media: "command",
						itemId: commandItemId,
						command: "bun test focused",
						status: "completed",
						cwd: "/repo",
						exitCode: 1,
						durationMs: 900,
						output: "1 fail",
						outputTruncated: true,
					},
					{
						media: "fileChange",
						itemId: fileItemId,
						status: "declined",
						changes: [
							{ path: "src/a.ts", kind: "update", movePath: "src/b.ts", added: 2, removed: 1 },
						],
						changesTruncated: false,
					},
					{ media: "reasoning", itemId: reasoningItemId, text: "reasoning summary" },
					{ media: "plan", itemId: planItemId, text: "implementation plan" },
					{ media: "search", itemId: searchItemId, query: "elk layout options" },
					{ media: "compaction", itemId: compactionItemId },
					{
						media: "approval",
						itemId: approvalItemId,
						approvalId,
						status: "resolved",
					},
				],
				summary: "failed turn",
				outputsIncluded: true,
				outputsTruncated: false,
				startedAtMs: 1_700_000_000_000,
				completedAtMs: 1_700_000_003_000,
				durationMs: 3_250,
				error: { message: "stream disconnected", details: "retry later" },
				plan: {
					explanation: "two steps",
					steps: [
						{ step: "read", status: "completed" },
						{ step: "write", status: "inProgress" },
					],
				},
			},
		],
		nextCursor: "timeline-next",
		usage: { total: breakdown, last: breakdown, modelContextWindow: 258_000 },
	});
	const wire = JSON.stringify(result.snapshot.timeline);
	for (const privateValue of [
		"/private/timeline/turn",
		"/private/timeline/prompt",
		"/private/timeline/message",
		"/private/timeline/tool",
		"/private/timeline/command",
		"/private/timeline/file",
		"/private/timeline/diff",
		"/private/timeline/reasoning",
		"/private/timeline/plan",
		"/private/timeline/search",
		"/private/timeline/compaction",
		"/private/timeline/approval",
		"/private/timeline/resolution",
		"/private/timeline/presentation",
		"/private/timeline/step",
		"/private/timeline/usage",
		"private-realtime-session",
	]) {
		expect(wire).not.toContain(privateValue);
	}
	expect(Object.isFrozen(result.snapshot.timeline)).toBe(true);
	expect(Object.isFrozen(result.snapshot.timeline?.turns)).toBe(true);
	expect(Object.isFrozen(result.snapshot.timeline?.turns[0])).toBe(true);
	expect(Object.isFrozen(result.snapshot.timeline?.turns[0]?.items)).toBe(true);
	expect(result.snapshot.timeline?.turns[0]?.items.every((item) => Object.isFrozen(item))).toBe(
		true,
	);
});

test("settings projection closes loose nested records and refuses secrets", () => {
	const authorities = createIdentityAuthorities();
	const model = createCodexBrowserModel(authorities);
	const input = projectionInput(authorities);
	const settings = {
		cwd: "/private/vendor/checkout",
		model: "gpt-6-sol",
		effort: "xhigh",
		serviceTier: "priority",
		approvalPolicy: {
			granular: {
				sandbox_approval: true,
				rules: false,
				skill_approval: true,
				request_permissions: false,
				mcp_elicitations: true,
				privateGranularPath: "/private/settings/granular",
			},
			privatePolicyPath: "/private/settings/policy",
		},
		approvalsReviewer: "user" as const,
		sandboxPolicy: {
			type: "workspaceWrite" as const,
			writableRoots: ["/private/vendor/root"],
			networkAccess: true,
			excludeTmpdirEnvVar: false,
			excludeSlashTmp: false,
		},
		activePermissionProfile: {
			id: "reviewed-profile",
			extends: "base-profile",
			privateProfilePath: "/private/settings/profile",
		},
		modelProvider: "private-provider",
	};
	const result = projectCodexBrowserState(model, {
		...input,
		settings: [
			{
				kind: "codex_thread_settings",
				owner: "workhorse",
				settings: settings satisfies CodexSettingsProjectionInput["settings"],
			},
		],
	});
	expect(result.tag).toBe("projected");
	if (result.tag !== "projected") {
		throw new Error("settings projection was refused");
	}
	expect(result.snapshot.account).toEqual({
		kind: "account",
		state: "ready",
		accountType: "chatgpt",
	});
	expect(result.snapshot.settings[0]?.sandbox).toEqual({
		mode: "workspace_write",
		network: "enabled",
	});
	expect(result.snapshot.settings[0]?.approvalPolicy).toEqual({
		granular: {
			sandbox_approval: true,
			rules: false,
			skill_approval: true,
			request_permissions: false,
			mcp_elicitations: true,
		},
	});
	expect(result.snapshot.settings[0]?.activePermissionProfile).toEqual({
		id: "reviewed-profile",
		extends: "base-profile",
	});
	const projectedPolicy = result.snapshot.settings[0]?.approvalPolicy;
	if (projectedPolicy === undefined || typeof projectedPolicy === "string") {
		throw new Error("granular approval policy was not projected");
	}
	expect(Object.isFrozen(projectedPolicy)).toBe(true);
	expect(Object.isFrozen(projectedPolicy.granular)).toBe(true);
	expect(Object.isFrozen(result.snapshot.settings[0]?.activePermissionProfile)).toBe(true);
	const wire = JSON.stringify(result.snapshot);
	for (const privateValue of [
		"private@example.test",
		"/private/vendor/checkout",
		"/private/vendor/root",
		"private-provider",
		"/private/settings/granular",
		"/private/settings/policy",
		"/private/settings/profile",
	]) {
		expect(wire).not.toContain(privateValue);
	}

	const secretAccount = { ...input.account, apiKey: "sk-browser-leak" };
	const secret = projectCodexBrowserState(model, {
		...input,
		account: secretAccount,
	} as BrowserProjectionInput);
	expect(secret).toEqual({
		tag: "refused",
		reason: "secret_input",
		message: "The browser projection contains a secret-bearing field.",
	});
	expect(JSON.stringify(secret)).not.toContain("sk-browser-leak");
});

test("browser projection parses and freezes final host approvals without retaining host objects", () => {
	const fixture = createDynamicFixture();
	const hostApproval = structuredClone(fixture.pending);
	const result = projectCodexBrowserState(fixture.model, {
		...projectionInput(fixture.authorities),
		dynamicApprovals: [hostApproval],
	});
	expect(result.tag).toBe("projected");
	if (result.tag !== "projected") throw new Error("host approval projection was refused");
	expect(result.snapshot.dynamicApprovals).toEqual([hostApproval]);
	expect(result.snapshot.dynamicApprovals[0]).not.toBe(hostApproval);
	hostApproval.effect.visualSummary = "changed after projection";
	expect(result.snapshot.dynamicApprovals[0]?.effect.visualSummary).toBe(
		fixture.pending.effect.visualSummary,
	);
	expect(Object.isFrozen(result.snapshot.dynamicApprovals[0]?.effect)).toBe(true);
});
