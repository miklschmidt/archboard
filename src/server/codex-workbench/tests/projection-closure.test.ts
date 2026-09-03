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
	view.turns[0]!.summary = "mutated";
	// @ts-expect-error Timeline owner items are deeply readonly.
	view.turns[0]!.items[0]!.media = "text";
}

void compileReadonlyTimeline;

test("timeline projection selects one non-null owner view and omits private extensions", () => {
	const authorities = createIdentityAuthorities();
	const model = createCodexBrowserModel(authorities);
	const input = projectionInput(authorities);
	const threadId = authorities.identity.decoder.adoptThreadId("closure-thread");
	const turnId = authorities.identity.decoder.adoptTurnId("timeline-turn");
	const itemId = authorities.identity.decoder.adoptItemId("timeline-command");
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
						media: "command",
						itemId,
						command: "bun test focused",
						status: "completed",
						privateItemPath: "/private/timeline/item",
					},
				],
				summary: "completed command",
				outputsIncluded: true,
				outputsTruncated: false,
				privatePresentationPath: "/private/timeline/presentation",
			},
		],
		nextCursor: "timeline-next",
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
				items: [{ media: "command", itemId, command: "bun test focused", status: "completed" }],
				summary: "completed command",
				outputsIncluded: true,
				outputsTruncated: false,
			},
		],
		nextCursor: "timeline-next",
	});
	const wire = JSON.stringify(result.snapshot.timeline);
	for (const privateValue of [
		"/private/timeline/turn",
		"/private/timeline/item",
		"/private/timeline/presentation",
		"private-realtime-session",
	])
		expect(wire).not.toContain(privateValue);
	expect(Object.isFrozen(result.snapshot.timeline)).toBe(true);
	expect(Object.isFrozen(result.snapshot.timeline?.turns)).toBe(true);
	expect(Object.isFrozen(result.snapshot.timeline?.turns[0])).toBe(true);
	expect(Object.isFrozen(result.snapshot.timeline?.turns[0]?.items)).toBe(true);
	expect(Object.isFrozen(result.snapshot.timeline?.turns[0]?.items[0])).toBe(true);
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
