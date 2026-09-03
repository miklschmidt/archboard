import { expect, test } from "bun:test";

import {
	projectCodexBrowserState,
	type BrowserProjectionInput,
	type CodexSettingsProjectionInput,
} from "../index.js";
import { createFixtureIds } from "./support.js";

function projectionInput(): {
	readonly model: ReturnType<typeof createFixtureIds>["model"];
	readonly input: BrowserProjectionInput;
} {
	const { model, snapshot } = createFixtureIds();
	const setting = snapshot.settings[0];
	const queued = snapshot.queue.entries[0];
	if (setting === undefined || queued === undefined) throw new Error("fixture owners are missing");
	const input: BrowserProjectionInput = {
		readiness: snapshot.readiness,
		account: {
			kind: "codex_account_response",
			response: {
				account: { type: "chatgpt", email: "fixture@example.test", planType: "plus" },
				requiresOpenaiAuth: true,
			},
		},
		login: snapshot.login,
		threadLink: snapshot.threadLink,
		timeline: snapshot.timeline,
		queue: {
			kind: "codex_queue",
			submissions: [{ id: queued.submissionId, input: [{ type: "text", text: queued.prompt }] }],
		},
		settings: [
			{
				kind: "codex_thread_settings",
				owner: setting.owner,
				settings: {
					model: setting.model,
					effort: setting.effort,
					serviceTier: setting.serviceTier,
					approvalPolicy: setting.approvalPolicy,
					approvalsReviewer: setting.approvalsReviewer,
					sandboxPolicy: { type: "dangerFullAccess" },
					activePermissionProfile: setting.activePermissionProfile,
				},
			},
		],
		approvals: snapshot.approvals,
		dynamicApprovals: snapshot.dynamicApprovals,
		semantic: {
			kind: "codex_semantic",
			outcome:
				snapshot.semantic === null
					? null
					: {
							targetThreadId: snapshot.semantic.threadId,
							outcome: snapshot.semantic.delivery,
							reason: snapshot.semantic.reason ?? null,
						},
			freshness:
				snapshot.semantic === null
					? null
					: {
							capturedAtMs: snapshot.semantic.capturedAtMs,
							freshUntilMs: snapshot.semantic.freshUntilMs,
						},
		},
		coordinator: {
			kind: "codex_coordinator",
			state: snapshot.coordinator.state,
			threadId: snapshot.coordinator.threadId,
			effective:
				snapshot.coordinator.model === null
					? null
					: {
							model: snapshot.coordinator.model,
							effort: snapshot.coordinator.effort,
							serviceTier: snapshot.coordinator.serviceTier,
						},
			reason: snapshot.coordinator.reason ?? null,
		},
		voice: {
			kind: "codex_voice",
			mediaReady: snapshot.voice.state !== "unavailable",
			generation:
				snapshot.voice.realtimeSessionId === null
					? null
					: { browserSessionId: snapshot.voice.realtimeSessionId },
			coordinatorState: snapshot.coordinator.state,
			transcript: snapshot.voice.transcript.map((record) => ({
				itemId: record.itemId,
				sequence: record.sequence,
				role: record.speaker,
				text: record.text,
				status: record.final ? "final" : "inProgress",
			})),
		},
		lease: snapshot.lease,
		operation: snapshot.operation,
	};
	return { model, input };
}

test("the projection adapter emits the closed browser state and rejects contradictions", () => {
	const { model, input } = projectionInput();
	const projected = projectCodexBrowserState(model, input);
	expect(projected.tag).toBe("projected");
	if (projected.tag !== "projected") throw new Error("fixture projection was refused");
	expect(projected.snapshot.kind).toBe("snapshot");
	expect(projected.snapshot.version).toBe(1);
	expect(Object.isFrozen(projected.snapshot)).toBeTrue();
	expect(projected.snapshot.queue).toMatchObject({
		status: "queued",
		entries: [{ prompt: "Queue me", status: "queued" }],
	});
	expect(projected.snapshot.semantic?.delivery).toBe("outcome_unknown");
	expect(projected.snapshot.coordinator.state).toBe("active");
	expect(projected.snapshot.voice.state).toBe("active");

	const contradictory = projectCodexBrowserState(model, {
		...input,
		threadLink: {
			kind: "thread_link",
			state: "unbound",
			childId: null,
			epoch: null,
			threadId: null,
			source: null,
			status: "notLoaded",
			loaded: false,
			canAcceptDirectInput: false,
			reason: null,
		},
	});
	expect(contradictory).toEqual({
		tag: "refused",
		reason: "invalid_projection",
		message: "The normalized owner state cannot be represented by the browser contract.",
	});
});

test("secret-bearing producer state never enters a browser snapshot", () => {
	const { model, input } = projectionInput();
	const secretAccount = { ...input.account, apiKey: "sk-browser-leak" };
	const result = projectCodexBrowserState(model, {
		...input,
		account: secretAccount,
	} as BrowserProjectionInput);
	expect(result).toEqual({
		tag: "refused",
		reason: "secret_input",
		message: "The browser projection contains a secret-bearing field.",
	});
	expect(JSON.stringify(result)).not.toContain("sk-browser-leak");
});

test("generated account and settings views lose private producer fields at projection", () => {
	const { model, input } = projectionInput();
	const settings = input.settings[0];
	if (settings === undefined) throw new Error("fixture settings are missing");
	const producerSettings = {
		cwd: "/private/vendor/checkout",
		approvalPolicy: settings.settings.approvalPolicy,
		approvalsReviewer: settings.settings.approvalsReviewer,
		sandboxPolicy: {
			type: "workspaceWrite" as const,
			writableRoots: ["/private/vendor/root"],
			networkAccess: true,
			excludeTmpdirEnvVar: false,
			excludeSlashTmp: false,
		},
		activePermissionProfile: settings.settings.activePermissionProfile,
		model: settings.settings.model,
		modelProvider: "private-provider",
		serviceTier: settings.settings.serviceTier,
		effort: settings.settings.effort,
		summary: "detailed",
		collaborationMode: {
			mode: "default",
			settings: {
				model: settings.settings.model,
				reasoning_effort: settings.settings.effort,
				developer_instructions: "private instructions",
			},
		},
		multiAgentMode: "explicitRequestOnly",
		personality: "pragmatic",
	};
	const result = projectCodexBrowserState(model, {
		...input,
		account: {
			kind: "codex_account_response",
			response: {
				account: { type: "chatgpt", email: "private@example.test", planType: "plus" },
				requiresOpenaiAuth: true,
			},
		},
		settings: [
			{
				kind: "codex_thread_settings",
				owner: "workhorse",
				settings: producerSettings satisfies CodexSettingsProjectionInput["settings"],
			},
		],
	});
	expect(result.tag).toBe("projected");
	if (result.tag !== "projected") throw new Error("generated projection was refused");
	expect(result.snapshot.account).toEqual({
		kind: "account",
		state: "ready",
		accountType: "chatgpt",
	});
	expect(result.snapshot.settings[0]?.sandbox).toEqual({
		mode: "workspace_write",
		network: "enabled",
	});
	const wire = JSON.stringify(result.snapshot);
	expect(wire).not.toContain("private@example.test");
	expect(wire).not.toContain("/private/vendor/checkout");
	expect(wire).not.toContain("/private/vendor/root");
	expect(wire).not.toContain("private-provider");
	expect(wire).not.toContain("private instructions");
});
