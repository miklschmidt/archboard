import { describe, expect, test } from "bun:test";

import type {
	BrowserCoordinator,
	BrowserReadiness,
	BrowserThreadLink,
} from "@/shared/codex-browser-model";
import { coordinatorLine, readinessLine, threadLinkLine } from "@/ui/workbench/session-projection";
import { identities } from "@/ui/workbench/tests/identities";

describe("session lines", () => {
	test("readiness maps to live, warning and sign-in states", () => {
		const ready: BrowserReadiness = { kind: "readiness", state: "thread_capable" };
		expect(readinessLine(ready)).toEqual({ tone: "live", text: "Session ready", recovery: null });
		const backoff: BrowserReadiness = {
			kind: "readiness",
			state: "backoff",
			retryAtMs: 3_600_000,
			reason: "child exited",
		};
		const line = readinessLine(backoff);
		expect(line.tone).toBe("warning");
		expect(line.text).toBe("Session retrying: child exited; retry at 01:00:00");
		const signedOut: BrowserReadiness = { kind: "readiness", state: "signed_out" };
		expect(readinessLine(signedOut).recovery).toBe("Sign in from agent settings.");
	});

	test("the thread link names the workhorse or says why it cannot take input", () => {
		const unbound: BrowserThreadLink = {
			kind: "thread_link",
			state: "unbound",
			childId: null,
			epoch: null,
			threadId: null,
			sourcePresentation: null,
			status: "notLoaded",
			loaded: false,
			canAcceptDirectInput: false,
			reason: null,
		};
		expect(threadLinkLine(unbound)).toEqual({
			tone: "idle",
			text: "No workhorse linked",
			recovery: "Link a new thread or choose one.",
		});
		const inspect: BrowserThreadLink = {
			kind: "thread_link",
			state: "inspect_only",
			childId: null,
			epoch: null,
			threadId: identities.threadId,
			sourcePresentation: "subagent",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: false,
			reason: "prior epoch",
		};
		const line = threadLinkLine(inspect);
		expect(line.tone).toBe("idle");
		expect(line.recovery).toBe("prior epoch");
		expect(line.text.startsWith("Inspect-only ")).toBe(true);
		expect(line.text.endsWith(" (subagent, idle)")).toBe(true);
	});

	test("the coordinator line keeps its own model authority", () => {
		const coordinator: BrowserCoordinator = {
			kind: "coordinator",
			state: "ready",
			threadId: null,
			activeTurnId: null,
			configuredModel: "gpt-realtime",
			configuredEffort: null,
			model: null,
			effort: null,
			serviceTier: null,
			reason: null,
		};
		expect(coordinatorLine(coordinator)).toEqual({
			tone: "live",
			text: "Coordinator ready · gpt-realtime",
			recovery: null,
		});
		expect(coordinatorLine({ ...coordinator, state: "failed", reason: "no realtime" }).tone).toBe(
			"warning",
		);
	});
});
