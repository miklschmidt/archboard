import { test, expect } from "bun:test";

import { BROWSER_THREAD_CANDIDATE_LIMIT } from "../index.js";
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

test("the thread-candidate inventory is a bounded, deduplicated, browser-safe list", () => {
	const { model, identity } = createFixtureIds();
	const candidate = (selectionId: string, threadIdText: string) => ({
		kind: "thread_candidate",
		selectionId,
		threadId: identity.decoder.adoptThreadId(threadIdText),
		state: "inspect_only",
		reason: "prior_epoch",
		sourcePresentation: "subagent",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: null,
	});
	const listed = model.BrowserThreadCandidatesSchema.parse({
		kind: "thread_candidates",
		state: "listed",
		records: [candidate("selection-a", "thread-a"), candidate("selection-b", "thread-b")],
		truncated: true,
		reason: null,
	});
	expect(listed.state === "listed" && listed.records).toHaveLength(2);
	expect(listed.state === "listed" && listed.truncated).toBeTrue();

	for (const arm of [
		{ kind: "thread_candidates", state: "unknown", records: [], truncated: false, reason: null },
		{
			kind: "thread_candidates",
			state: "unavailable",
			records: [],
			truncated: false,
			reason: "the thread list could not be exhausted",
		},
	])
		expect(model.BrowserThreadCandidatesSchema.safeParse(arm).success).toBeTrue();

	// One selection cannot appear twice, an undiscovered arm cannot smuggle rows,
	// and the list cannot outgrow the bound the snapshot fitter does not trim.
	expect(
		model.BrowserThreadCandidatesSchema.safeParse({
			kind: "thread_candidates",
			state: "listed",
			records: [candidate("selection-a", "thread-a"), candidate("selection-a", "thread-b")],
			truncated: false,
			reason: null,
		}).success,
	).toBeFalse();
	expect(
		model.BrowserThreadCandidatesSchema.safeParse({
			kind: "thread_candidates",
			state: "unknown",
			records: [candidate("selection-a", "thread-a")],
			truncated: false,
			reason: null,
		}).success,
	).toBeFalse();
	expect(
		model.BrowserThreadCandidatesSchema.safeParse({
			kind: "thread_candidates",
			state: "listed",
			records: Array.from({ length: BROWSER_THREAD_CANDIDATE_LIMIT + 1 }, (_value, index) =>
				candidate(`selection-${index}`, `thread-${index}`),
			),
			truncated: false,
			reason: null,
		}).success,
	).toBeFalse();
});

test("a bind command names both the one-shot selection and the thread it believes it is", () => {
	const { model, identity, target } = createFixtureIds();
	const threadId = identity.decoder.adoptThreadId("thread-bind");
	for (const command of ["threadLinkAttach", "threadLinkRelink"] as const) {
		expect(
			model.BrowserCommandSchema.parse({
				...target,
				kind: "browser_command",
				command,
				selectionId: "selection-a",
				threadId,
			}),
		).toMatchObject({ command, selectionId: "selection-a", threadId });
		// A thread id on its own can never adopt a row the pane did not offer.
		expect(
			model.BrowserCommandSchema.safeParse({
				...target,
				kind: "browser_command",
				command,
				threadId,
			}).success,
		).toBeFalse();
	}
	expect(
		model.BrowserCommandSchema.parse({
			...target,
			kind: "browser_command",
			command: "threadLinkRefresh",
		}),
	).toMatchObject({ command: "threadLinkRefresh" });
});

test("voice-context delivery attempts are a closed wire union with ordered timing", () => {
	const { model } = createFixtureIds();
	const shared = {
		id: "voice-entry",
		kind: "callback",
		sourceOrder: 1,
		capturedAtMs: 100,
		freshUntilMs: 200,
		reason: null,
		body: "exact callback body",
	} as const;
	expect(
		model.BrowserVoiceContextSchema.safeParse({
			kind: "voice_context",
			sessionId: "browser-session",
			ledgerId: "ledger",
			canonicalBrief: '{"source":"semantic_context"}',
			entriesTruncated: 0,
			entries: [
				{ ...shared, attempted: false, attemptedAtMs: null, outcome: "not_delivered" },
				{ ...shared, id: "attempted", attempted: true, attemptedAtMs: 150, outcome: "delivered" },
			],
		}).success,
	).toBeTrue();
	for (const incoherent of [
		{ attempted: false, attemptedAtMs: null, outcome: "outcome_unknown" },
		{ attempted: false, attemptedAtMs: 150, outcome: "not_delivered" },
		{ attempted: true, attemptedAtMs: null, outcome: "delivered" },
		{ attempted: true, attemptedAtMs: 99, outcome: "delivered" },
	])
		expect(
			model.BrowserVoiceContextSchema.safeParse({
				kind: "voice_context",
				sessionId: "browser-session",
				ledgerId: "ledger",
				canonicalBrief: '{"source":"semantic_context"}',
				entriesTruncated: 0,
				entries: [{ ...shared, ...incoherent }],
			}).success,
		).toBeFalse();
});
