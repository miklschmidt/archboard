import { test, expect } from "bun:test";

import { createFixtureIds } from "./support.js";

test("browser DTOs cover reachable progress, partial, failure, and recovery states", () => {
	const ids = createFixtureIds();
	const { model, identity } = ids;
	const states = [
		{ kind: "readiness", state: "reconnecting", reason: "retrying" },
		{ kind: "account", state: "failed", reason: "login failed" },
		{ kind: "login", state: "failed", loginId: null, reason: "cancelled" },
		{
			kind: "thread_link",
			state: "inspect_only",
			childId: null,
			epoch: null,
			threadId: identity.decoder.adoptThreadId("inspect"),
			sourcePresentation: "standard",
			status: "notLoaded",
			loaded: false,
			canAcceptDirectInput: false,
			reason: "read only",
		},
		{
			kind: "thread_link",
			state: "inspect_only",
			childId: null,
			epoch: null,
			threadId: identity.decoder.adoptThreadId("inspect-custom"),
			sourcePresentation: "custom",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: false,
			reason: null,
		},
		{
			kind: "thread_link",
			state: "inspect_only",
			childId: null,
			epoch: null,
			threadId: identity.decoder.adoptThreadId("inspect-subagent"),
			sourcePresentation: "subagent",
			status: "active",
			loaded: true,
			canAcceptDirectInput: false,
			reason: null,
		},
		{
			kind: "thread_link",
			state: "inspect_only",
			childId: null,
			epoch: null,
			threadId: identity.decoder.adoptThreadId("inspect-unknown"),
			sourcePresentation: "unknown",
			status: "systemError",
			loaded: false,
			canAcceptDirectInput: false,
			reason: "source is not classified",
		},
		{ kind: "queue", status: "reconnecting", entries: [] },
		{
			kind: "semantic_delivery",
			threadId: ids.snapshot.threadLink.threadId,
			delivery: "not_delivered",
			capturedAtMs: 1,
			freshUntilMs: 2,
			reason: "disconnected",
		},
		{
			kind: "coordinator",
			state: "reconnecting",
			threadId: null,
			activeTurnId: null,
			configuredModel: null,
			configuredEffort: null,
			model: null,
			effort: null,
			serviceTier: null,
			reason: "retrying",
		},
		{
			kind: "voice",
			state: "recovering",
			realtimeSessionId: null,
			transcript: [],
			delivery: "outcome_unknown",
			reason: "reconnecting",
		},
		{
			kind: "operation_outcome",
			operationId: ids.snapshot.operation!.operationId,
			outcome: "not_delivered",
			message: "unknown",
		},
	] as const;
	for (const state of states)
		expect(model.BrowserDtoSchema.safeParse(state as unknown).success).toBeTrue();
	const inspectState = states[4];
	if (inspectState?.kind !== "thread_link")
		throw new Error("fixture is missing inspect-only state");
	for (const sourcePresentation of ["cli", "review", "future"])
		expect(
			model.BrowserDtoSchema.safeParse({ ...inspectState, sourcePresentation } as unknown).success,
		).toBeFalse();
});
