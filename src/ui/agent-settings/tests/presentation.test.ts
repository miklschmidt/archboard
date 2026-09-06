import { describe, expect, test } from "bun:test";

import type { BrowserCoordinator, BrowserThreadLink } from "@/shared/codex-browser-model";
import {
	LOGIN_VARIANTS,
	approvalPolicyText,
	coordinatorFacts,
	describeAccount,
	describeCoordinator,
	describeLoginOutcome,
	describeThreadLink,
	pendingLogin,
	threadLinkFacts,
} from "@/ui/agent-settings";

const UNBOUND: BrowserThreadLink = {
	kind: "thread_link",
	state: "unbound",
	childId: null,
	epoch: null,
	threadId: null,
	sourcePresentation: null,
	status: "notLoaded",
	loaded: false,
	canAcceptDirectInput: false,
	reason: "no thread is linked",
};

describe("agent settings presentation", () => {
	test("offers every sign-in variant once", () => {
		expect(new Set(LOGIN_VARIANTS).size).toBe(4);
	});

	test("account states keep their own reason and tone", () => {
		expect(describeAccount({ kind: "account", state: "signed_out" })).toEqual({
			label: "Signed out",
			detail: null,
			tone: "outline",
		});
		expect(
			describeAccount({ kind: "account", state: "failed", reason: "token expired" }),
		).toMatchObject({ detail: "token expired", tone: "destructive" });
		expect(
			describeAccount({ kind: "account", state: "ready", accountType: "chatgpt" }),
		).toMatchObject({ label: "Signed in", detail: "chatgpt" });
	});

	test("only a pending login can be cancelled, and outcomes read as one line", () => {
		expect(pendingLogin({ kind: "login", state: "idle" })).toBeNull();
		expect(describeLoginOutcome({ kind: "login", state: "idle" })).toBeNull();
		expect(
			describeLoginOutcome({ kind: "login", state: "failed", loginId: null, reason: "closed" }),
		).toContain("closed");
	});

	test("an unbound link shows no thread row and reads as unbound", () => {
		expect(describeThreadLink(UNBOUND)).toEqual({
			label: "Unbound",
			detail: "no thread is linked",
			tone: "outline",
		});
		expect(threadLinkFacts(UNBOUND).map((row) => [row.label, row.value])).toEqual([
			["Status", "Not loaded"],
			["Inventory", "Thread inventory not loaded yet"],
			["Direct input", "Direct input is not accepted"],
		]);
	});

	test("coordinator facts show configured beside effective settings", () => {
		const coordinator: BrowserCoordinator = {
			kind: "coordinator",
			state: "ready",
			threadId: null,
			activeTurnId: null,
			configuredModel: "gpt-5",
			configuredEffort: "high",
			model: "gpt-5-mini",
			effort: null,
			serviceTier: null,
			reason: null,
		};
		expect(describeCoordinator(coordinator)).toEqual({
			label: "Ready",
			detail: null,
			tone: "default",
		});
		expect(coordinatorFacts(coordinator).map((row) => [row.label, row.value])).toEqual([
			["Configured model", "gpt-5"],
			["Configured effort", "high"],
			["Effective model", "gpt-5-mini"],
		]);
	});

	test("approval policies read as the name or the granular flags that are on", () => {
		expect(approvalPolicyText("on-request")).toBe("on-request");
		expect(
			approvalPolicyText({
				granular: {
					sandbox_approval: true,
					rules: false,
					skill_approval: false,
					request_permissions: true,
					mcp_elicitations: false,
				},
			}),
		).toBe("granular: sandbox_approval, request_permissions");
	});
});
