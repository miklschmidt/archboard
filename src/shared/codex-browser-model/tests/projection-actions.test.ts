import { expect, test } from "bun:test";

import {
	BROWSER_ACTION_OWNERS,
	projectCodexBrowserState,
	resolveBrowserAction,
	type BrowserProjectionInput,
	type CodexSettingsProjectionInput,
} from "../index.js";
import { createFixtureIds } from "./support.js";

function projectionInput(): {
	readonly model: ReturnType<typeof createFixtureIds>["model"];
	readonly input: BrowserProjectionInput;
} {
	const { model, snapshot } = createFixtureIds();
	const { kind: _kind, version: _version, ...input } = snapshot;
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
	if (settings === undefined || settings.kind !== "settings")
		throw new Error("fixture settings are missing");
	const notification: CodexSettingsProjectionInput["notification"] = {
		threadId: input.threadLink.threadId ?? "unbound",
		threadSettings: {
			cwd: "/private/vendor/checkout",
			approvalPolicy: settings.approvalPolicy,
			approvalsReviewer: settings.approvalsReviewer,
			sandboxPolicy: settings.sandboxPolicy,
			activePermissionProfile: settings.activePermissionProfile,
			model: settings.model,
			modelProvider: "private-provider",
			serviceTier: settings.serviceTier,
			effort: settings.effort,
			summary: "detailed",
			collaborationMode: {
				mode: "default",
				settings: {
					model: settings.model,
					reasoning_effort: settings.effort,
					developer_instructions: "private instructions",
				},
			},
			multiAgentMode: "explicitRequestOnly",
			personality: "pragmatic",
		},
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
		settings: [{ kind: "codex_thread_settings", owner: "workhorse", notification }],
	});
	expect(result.tag).toBe("projected");
	if (result.tag !== "projected") throw new Error("generated projection was refused");
	expect(result.snapshot.account).toEqual({
		kind: "account",
		state: "ready",
		accountType: "chatgpt",
	});
	const wire = JSON.stringify(result.snapshot);
	expect(wire).not.toContain("private@example.test");
	expect(wire).not.toContain("/private/vendor/checkout");
	expect(wire).not.toContain("private-provider");
	expect(wire).not.toContain("private instructions");
});

test("every browser intent has one host owner and unsupported actions are explicit", () => {
	const actions = Object.keys(BROWSER_ACTION_OWNERS);
	expect(actions).toHaveLength(19);
	for (const action of actions) {
		const resolution = resolveBrowserAction(action);
		expect(resolution.tag).toBe("owned");
		if (resolution.tag !== "owned") throw new Error(`${action} was refused`);
		expect(resolution.owner).toBe(BROWSER_ACTION_OWNERS[resolution.action]);
	}
	expect(resolveBrowserAction("thread/delete")).toEqual({
		tag: "refused",
		action: "thread/delete",
		reason: "unsupported_action",
		message: "The browser action is not supported by this workbench.",
	});
});
