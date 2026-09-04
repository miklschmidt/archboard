import { expect, test } from "bun:test";

import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	projectCodexBrowserState,
	type BrowserProjectionInput,
	type CodexSettingsProjectionInput,
	type CodexTimelineProjectionInput,
} from "../index.js";

function projectionInput(authorities: IdentityAuthorities): BrowserProjectionInput {
	const threadId = authorities.identity.decoder.adoptThreadId("closure-thread");
	return {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: {
			kind: "codex_account_response",
			response: {
				account: { type: "chatgpt", email: "private@example.test", planType: "plus" },
				requiresOpenaiAuth: true,
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
		threadCandidates: { kind: "codex_thread_candidates", state: "unknown" },
		timeline: null,
		queue: { kind: "codex_queue", submissions: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: { kind: "codex_semantic", outcome: null, freshness: null },
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
			mediaReady: false,
			generation: null,
			coordinatorState: "unbound",
			transcript: [],
		},
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

test("timeline projection maps all seven owner arms and omits private extensions", () => {
	const authorities = createIdentityAuthorities();
	const model = createCodexBrowserModel(authorities);
	const input = projectionInput(authorities);
	const threadId = authorities.identity.decoder.adoptThreadId("closure-thread");
	const turnId = authorities.identity.decoder.adoptTurnId("timeline-turn");
	const messageItemId = authorities.identity.decoder.adoptItemId("timeline-message");
	const toolItemId = authorities.identity.decoder.adoptItemId("timeline-tool");
	const commandItemId = authorities.identity.decoder.adoptItemId("timeline-command");
	const fileItemId = authorities.identity.decoder.adoptItemId("timeline-file");
	const reasoningItemId = authorities.identity.decoder.adoptItemId("timeline-reasoning");
	const planItemId = authorities.identity.decoder.adoptItemId("timeline-plan");
	const approvalItemId = authorities.identity.decoder.adoptItemId("timeline-approval-item");
	const approvalId = authorities.identity.decoder.adoptApprovalId("timeline-approval");
	const timeline = {
		kind: "codex_timeline",
		threadId,
		turns: [
			{
				turn: {
					id: turnId,
					status: "completed",
					privateTurnPath: "/private/timeline/turn",
				},
				items: [
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
							status: "completed",
							privateToolPath: "/private/timeline/tool",
						},
					},
					{
						kind: "command_execution",
						item: {
							type: "commandExecution",
							id: commandItemId,
							command: "bun test focused",
							status: "completed",
							privateCommandPath: "/private/timeline/command",
						},
					},
					{
						kind: "file_change",
						item: {
							type: "fileChange",
							id: fileItemId,
							status: "declined",
							privateFilePath: "/private/timeline/file",
						},
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
					summary: "completed turn",
					outputs: { included: true, truncated: false },
					privatePresentationPath: "/private/timeline/presentation",
				},
			},
		],
		cursor: "timeline-next",
		activeRealtimeSessionAtPageStart: "private-realtime-session",
	} as const satisfies CodexTimelineProjectionInput & {
		readonly activeRealtimeSessionAtPageStart: string;
	};
	const result = projectCodexBrowserState(model, authorities.identity.decoder, {
		...input,
		timeline,
	});
	expect(result.tag).toBe("projected");
	if (result.tag !== "projected") throw new Error("timeline projection was refused");
	expect(result.snapshot.timeline).toEqual({
		kind: "timeline",
		threadId: timeline.threadId,
		turns: [
			{
				turnId,
				status: "completed",
				items: [
					{ media: "text", itemId: messageItemId, text: "assistant text" },
					{ media: "tool", itemId: toolItemId, name: "fetch_architecture", status: "completed" },
					{
						media: "command",
						itemId: commandItemId,
						command: "bun test focused",
						status: "completed",
					},
					{ media: "fileChange", itemId: fileItemId, status: "declined" },
					{ media: "reasoning", itemId: reasoningItemId, text: "reasoning summary" },
					{ media: "plan", itemId: planItemId, text: "implementation plan" },
					{
						media: "approval",
						itemId: approvalItemId,
						approvalId,
						status: "resolved",
					},
				],
				summary: "completed turn",
				outputsIncluded: true,
				outputsTruncated: false,
			},
		],
		nextCursor: "timeline-next",
	});
	const wire = JSON.stringify(result.snapshot.timeline);
	for (const privateValue of [
		"/private/timeline/turn",
		"/private/timeline/message",
		"/private/timeline/tool",
		"/private/timeline/command",
		"/private/timeline/file",
		"/private/timeline/reasoning",
		"/private/timeline/plan",
		"/private/timeline/approval",
		"/private/timeline/resolution",
		"/private/timeline/presentation",
		"private-realtime-session",
	])
		expect(wire).not.toContain(privateValue);
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
		model: "gpt-5.6-sol",
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
	const result = projectCodexBrowserState(model, authorities.identity.decoder, {
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
	if (result.tag !== "projected") throw new Error("settings projection was refused");
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
	if (projectedPolicy === undefined || typeof projectedPolicy === "string")
		throw new Error("granular approval policy was not projected");
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
	])
		expect(wire).not.toContain(privateValue);

	const secretAccount = { ...input.account, apiKey: "sk-browser-leak" };
	const secret = projectCodexBrowserState(model, authorities.identity.decoder, {
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
