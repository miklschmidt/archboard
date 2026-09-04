import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BROWSER_IDLE_SPOKEN_APPROVAL } from "../../../shared/codex-browser-model/index.js";
import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import { projectWorkbenchCoordinator, WorkbenchCoordinatorDisclosure } from "../index.js";

const SETTINGS = {
	kind: "settings",
	owner: "coordinator",
	model: "gpt-5.6-sol",
	effort: "high",
	serviceTier: "priority",
	approvalPolicy: "on-request",
	approvalsReviewer: "guardian_subagent",
	sandbox: { mode: "workspace_write", network: "enabled" },
	activePermissionProfile: { id: "archboard", extends: "default" },
} as const satisfies BrowserSnapshot["settings"][number];

const WORKHORSE_SETTINGS = {
	...SETTINGS,
	owner: "workhorse",
	model: "gpt-daybreak-blue-latest",
	effort: "xhigh",
} as const satisfies BrowserSnapshot["settings"][number];

type ExecutableThreadLink = Extract<
	BrowserSnapshot["threadLink"],
	{ readonly state: "executable" }
>;

function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: "child-a" as ExecutableThreadLink["childId"],
			epoch: "epoch-a" as ExecutableThreadLink["epoch"],
			threadId: "workhorse-a" as ExecutableThreadLink["threadId"],
			sourcePresentation: "standard",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		threadCandidates: {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
			reason: null,
		},
		timeline: {
			kind: "timeline",
			threadId: "workhorse-a" as NonNullable<BrowserSnapshot["timeline"]>["threadId"],
			turns: [],
			nextCursor: null,
		},
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [SETTINGS, WORKHORSE_SETTINGS],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: "coordinator-a" as BrowserSnapshot["coordinator"]["threadId"],
			activeTurnId: null,
			configuredModel: "gpt-5.6-luna",
			configuredEffort: "medium",
			model: "gpt-5.6-sol",
			effort: "high",
			serviceTier: "priority",
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "ready",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: null,
		operation: null,
		...overrides,
	};
}

function connected(value = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 7,
	};
}

function textByLabel(state: BrowserWorkbenchState, label: string): string {
	const projected = projectWorkbenchCoordinator(state);
	const fields = [
		...projected.coordinatorIdentity.fields,
		...projected.coordinatorSettings.fields,
		...projected.workhorse.fields,
	];
	const match = fields.find((candidate) => candidate.label === label);
	if (match === undefined) throw new Error(`Missing field ${label}`);
	return [match.value, match.recovery].filter(Boolean).join(" ");
}

describe("workbench coordinator projection", () => {
	test("projects host-confirmed coordinator and separate workhorse facts", () => {
		const state = connected();
		const projected = projectWorkbenchCoordinator(state);

		expect(projected.status).toEqual({
			state: "confirmed",
			label: "Coordinator confirmed",
			detail: "The host confirmed this coordinator identity and its effective settings.",
			recovery: null,
		});
		expect(textByLabel(state, "Configured model")).toBe("gpt-5.6-luna");
		expect(textByLabel(state, "Configured reasoning effort")).toBe("medium");
		expect(textByLabel(state, "Effective model")).toBe("gpt-5.6-sol");
		expect(textByLabel(state, "Effective reasoning effort")).toBe("high");
		expect(textByLabel(state, "Effective service tier")).toBe("priority");
		expect(textByLabel(state, "Approval policy")).toBe("on request");
		expect(textByLabel(state, "Approvals reviewer")).toBe("guardian subagent");
		expect(textByLabel(state, "Sandbox policy")).toBe("Workspace write, network enabled");
		expect(textByLabel(state, "Active permission profile")).toBe("archboard, extends default");
		expect(textByLabel(state, "Coordinator identity")).toBe("coordinator-a");
		expect(textByLabel(state, "Coordinator history")).toContain(
			"host did not publish the read-only coordinator history",
		);
		expect(textByLabel(state, "Workhorse identity")).toBe("workhorse-a");
		expect(textByLabel(state, "Workhorse history")).toBe("Current task activity for workhorse-a");
		expect(textByLabel(state, "Workhorse settings")).toContain("gpt-daybreak-blue-latest");
		expect(Object.isFrozen(projected)).toBe(true);
		expect(Object.isFrozen(projected.coordinatorSettings.fields)).toBe(true);
	});

	test("distinguishes loading, stale, unavailable, and non-advertised priority fallback", () => {
		const loadingSnapshot = snapshot({
			settings: [WORKHORSE_SETTINGS],
			coordinator: {
				...snapshot().coordinator,
				state: "starting",
				model: null,
				effort: null,
				serviceTier: null,
			},
		});
		const loading = projectWorkbenchCoordinator(connected(loadingSnapshot));
		expect(loading.status.state).toBe("loading");
		expect(loading.coordinatorSettings.fields.slice(0, 2).map((item) => item.value)).toEqual([
			"gpt-5.6-luna",
			"medium",
		]);
		for (const item of loading.coordinatorSettings.fields.filter(
			(candidate) => candidate.state === "unavailable",
		))
			expect(item.recovery).toBe("Wait for the coordinator settings handshake to finish.");

		const stale: BrowserWorkbenchState = {
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: snapshot(),
			sequence: 7,
			expectedSequence: 8,
			receivedSequence: 9,
			reason: "A workbench event was missed.",
		};
		expect(projectWorkbenchCoordinator(stale).status).toMatchObject({
			state: "stale",
			detail: "A workbench event was missed.",
		});

		const unavailable: BrowserWorkbenchState = {
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "The Codex workbench stopped.",
		};
		expect(projectWorkbenchCoordinator(unavailable).status.state).toBe("unavailable");
		expect(textByLabel(unavailable, "Configured model")).toContain(
			"host did not publish the coordinator's configured model",
		);
		expect(textByLabel(unavailable, "Configured model")).toContain("Reconnect");

		const reconnecting: BrowserWorkbenchState = {
			kind: "connection",
			state: "reconnecting",
			connection: "reconnecting",
			snapshot: null,
			sequence: null,
			reason: "The host connection is recovering.",
		};
		expect(projectWorkbenchCoordinator(reconnecting).status).toMatchObject({
			state: "unavailable",
			detail: "The coordinator identity and settings are not available from the host.",
			recovery: "Wait for the Codex workbench to reconnect and publish a fresh snapshot.",
		});

		const fallbackSettings = { ...SETTINGS, serviceTier: null } as const;
		const fallbackSnapshot = snapshot({
			settings: [fallbackSettings, WORKHORSE_SETTINGS],
			coordinator: { ...snapshot().coordinator, serviceTier: null },
		});
		const fallback = projectWorkbenchCoordinator(connected(fallbackSnapshot));
		expect(fallback.status.state).toBe("priority_fallback");
		expect(textByLabel(connected(fallbackSnapshot), "Effective service tier")).toContain(
			"priority was not advertised",
		);
	});

	test("names each missing host fact and gives a recovery without inventing settings", () => {
		const missing = connected(snapshot({ settings: [WORKHORSE_SETTINGS] }));
		const projected = projectWorkbenchCoordinator(missing);
		expect(projected.status.state).toBe("unavailable");
		expect(projected.coordinatorSettings.fields.slice(0, 2).map((item) => item.state)).toEqual([
			"confirmed",
			"confirmed",
		]);
		for (const item of projected.coordinatorSettings.fields.slice(2)) {
			expect(item.state).toBe("unavailable");
			expect(item.value).toStartWith("Unavailable: the host did not publish");
			expect(item.recovery).toContain("Reconnect the Codex workbench");
		}
	});
});

describe("workbench coordinator disclosure", () => {
	test("labels coordinator and workhorse identity, history, and settings as separate regions", () => {
		const markup = renderToStaticMarkup(
			createElement(WorkbenchCoordinatorDisclosure, { state: connected() }),
		);
		expect(markup).toContain('data-coordinator-disclosure="read-only"');
		expect(markup).toContain('data-coordinator-state="confirmed"');
		expect(markup).toContain("Voice coordinator");
		expect(markup).toContain("Coordinator identity and history");
		expect(markup).toContain("Coordinator settings");
		expect(markup).toContain('aria-label="Linked workhorse identity, history, and settings"');
		expect(markup).toContain("Separate task activity and settings");
		expect(markup).toContain("<output");
		expect(markup).toContain('aria-label="Coordinator status: Coordinator confirmed"');
		expect(markup).not.toMatch(/<form|<button|<input|<select|<textarea|<a\b/);
	});

	test("exports only the read-only disclosure and its projector", async () => {
		const publicModule = (await import("../index.js")) as Record<string, unknown>;
		expect(Object.keys(publicModule).toSorted()).toEqual([
			"WorkbenchCoordinatorDisclosure",
			"projectWorkbenchCoordinator",
		]);
	});
});
