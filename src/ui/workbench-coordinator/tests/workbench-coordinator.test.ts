import { describe, expect, test } from "bun:test";

import { BROWSER_IDLE_SPOKEN_APPROVAL, type BrowserSnapshot } from "@/shared/codex-browser-model";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import type { BrowserWorkbenchState } from "@/ui/workbench-transport";
import { projectWorkbenchCoordinator } from "@/ui/workbench-coordinator";

const authorities = createIdentityAuthorities();
const { decoder, validator } = authorities.identity;
const WORKHORSE = decoder.adoptThreadId("workhorse-a");
const COORDINATOR = decoder.adoptThreadId("coordinator-a");

const SETTINGS: BrowserSnapshot["settings"][number] = {
	kind: "settings",
	owner: "coordinator",
	model: "gpt-5.6-sol",
	effort: "high",
	serviceTier: "priority",
	approvalPolicy: "on-request",
	approvalsReviewer: "guardian_subagent",
	sandbox: { mode: "workspace_write", network: "enabled" },
	activePermissionProfile: { id: "archboard", extends: "default" },
};

const WORKHORSE_SETTINGS: BrowserSnapshot["settings"][number] = {
	...SETTINGS,
	owner: "workhorse",
	model: "gpt-daybreak-blue-latest",
	effort: "xhigh",
};

/**
 * A thread-capable snapshot with a confirmed coordinator.
 * @param overrides The fields to replace.
 * @returns The snapshot.
 */
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
			childId: validator.childId,
			epoch: validator.epoch,
			threadId: WORKHORSE,
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
		timeline: { kind: "timeline", threadId: WORKHORSE, turns: [], nextCursor: null },
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [SETTINGS, WORKHORSE_SETTINGS],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: COORDINATOR,
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

/**
 * A connected state.
 * @param value The snapshot.
 * @returns The state.
 */
function connected(value = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 7,
	};
}

/**
 * The value of one projected field.
 * @param state The transport state.
 * @param label The field label.
 * @returns The value.
 */
function textByLabel(state: BrowserWorkbenchState, label: string): string {
	const projected = projectWorkbenchCoordinator(state);
	const fields = [
		...projected.coordinatorIdentity.fields,
		...projected.coordinatorSettings.fields,
		...projected.workhorse.fields,
	];
	const match = fields.find((candidate) => candidate.label === label);
	if (match === undefined) {
		throw new Error(`Missing field ${label}`);
	}
	return match.value;
}

describe("workbench coordinator projection", () => {
	test("projects host-confirmed coordinator and separate workhorse facts", () => {
		const state = connected();
		const projected = projectWorkbenchCoordinator(state);

		expect(projected.status).toEqual({
			state: "confirmed",
			label: "Coordinator confirmed",
			detail: "Coordinator details are up to date.",
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
		expect(textByLabel(state, "Conversation")).toBe(String(COORDINATOR));
		expect(textByLabel(state, "Workhorse identity")).toBe(String(WORKHORSE));
		expect(textByLabel(state, "Workhorse history")).toBe(
			`Current task activity for ${String(WORKHORSE)}`,
		);
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
		expect(loading.coordinatorSettings.fields.map((item) => item.value)).toEqual([
			"gpt-5.6-luna",
			"medium",
		]);
		expect(loading.status.recovery).toBe("Wait for its settings to be confirmed.");

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
		const missing = projectWorkbenchCoordinator(unavailable);
		expect(missing.status.state).toBe("unavailable");
		expect(missing.status.recovery).toBe("Reconnect Codex to load the details.");
		expect(missing.coordinatorIdentity.fields).toEqual([]);
		expect(missing.coordinatorSettings.fields).toEqual([]);
		expect(missing.workhorse.fields).toEqual([]);

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
			detail: "Coordinator details are unavailable.",
			recovery: "Wait for Codex to reconnect.",
		});

		const fallbackSnapshot = snapshot({
			settings: [{ ...SETTINGS, serviceTier: null }, WORKHORSE_SETTINGS],
			coordinator: { ...snapshot().coordinator, serviceTier: null },
		});
		const fallback = projectWorkbenchCoordinator(connected(fallbackSnapshot));
		expect(fallback.status.state).toBe("priority_fallback");
		expect(textByLabel(connected(fallbackSnapshot), "Effective service tier")).toContain(
			"priority was not advertised",
		);
	});

	test("retains configured facts and one recovery when confirmed settings are missing", () => {
		const missing = connected(snapshot({ settings: [WORKHORSE_SETTINGS] }));
		const projected = projectWorkbenchCoordinator(missing);
		expect(projected.status.state).toBe("unavailable");
		expect(projected.coordinatorSettings.fields.map((item) => item.state)).toEqual([
			"confirmed",
			"confirmed",
		]);
		expect(projected.status.detail).toBe("Some coordinator settings are unavailable.");
		expect(projected.status.recovery).toBe("Reconnect Codex to load the details.");
	});

	test("an unbound coordinator explains itself once and keeps the workhorse facts", () => {
		const state = connected(
			snapshot({
				settings: [WORKHORSE_SETTINGS],
				coordinator: {
					...snapshot().coordinator,
					state: "unbound",
					threadId: null,
					configuredModel: null,
					configuredEffort: null,
					model: null,
					effort: null,
					serviceTier: null,
				},
			}),
		);
		const projected = projectWorkbenchCoordinator(state);
		expect(projected.status).toMatchObject({
			state: "unavailable",
			detail: "The voice coordinator is not connected.",
			recovery: "Reconnect Codex to load the details.",
		});
		expect(projected.coordinatorIdentity.fields).toEqual([]);
		expect(projected.coordinatorSettings.fields).toEqual([]);
		expect(textByLabel(state, "Workhorse settings")).toContain("gpt-daybreak-blue-latest");
	});

	test("exports only the projector", async () => {
		const publicModule: object = await import("@/ui/workbench-coordinator");
		expect(Object.keys(publicModule).toSorted()).toEqual(["projectWorkbenchCoordinator"]);
	});
});
