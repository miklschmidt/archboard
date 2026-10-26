import { test, expect } from "bun:test";

import { BROWSER_TIMELINE_LIMITS } from "#shared/schemas/browser/vocabulary.ts";
import { createFixtureIds } from "#tests/shared/support/browser-model.ts";

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
			kind: "context_delivery",
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
	for (const state of states) {
		expect(model.BrowserDtoSchema.safeParse(state as unknown).success).toBeTrue();
	}
	const inspectState = states[4];
	if (inspectState?.kind !== "thread_link") {
		throw new Error("fixture is missing inspect-only state");
	}
	for (const sourcePresentation of ["cli", "review", "future"]) {
		expect(
			model.BrowserDtoSchema.safeParse({ ...inspectState, sourcePresentation }).success,
		).toBeFalse();
	}
});

const planStep = (status: string) => ({
	plan: { explanation: null, steps: [{ step: "Build", status }] },
});

test("the timeline carries its evidence only within its wire bounds and Codex's vocabulary", () => {
	const { model, snapshot, identity } = createFixtureIds();
	const timeline = snapshot.timeline;
	const turn = timeline?.turns[0];
	const command = turn?.items.find((item) => item.media === "command");
	if (timeline === null || turn === undefined || command === undefined) {
		throw new Error("fixture is missing its timeline evidence");
	}
	const parses = (next: unknown) => model.BrowserTimelineSchema.safeParse(next).success;
	const withTurn = (changes: Record<string, unknown>) => ({
		...timeline,
		turns: [{ ...turn, ...changes }],
	});
	const withItem = (item: unknown) => withTurn({ items: [item] });
	const itemId = identity.decoder.adoptItemId("bounds-item");
	const change = { path: "src/a.ts", kind: "add", movePath: null, added: 1, removed: 0 };
	const fileChange = (count: number) => ({
		media: "fileChange",
		itemId,
		status: "completed",
		changes: Array.from({ length: count }, () => change),
		changesTruncated: count === BROWSER_TIMELINE_LIMITS.fileChanges,
	});

	expect(parses(timeline)).toBeTrue();
	expect(parses(withItem({ media: "search", itemId, query: null }))).toBeTrue();
	expect(parses(withItem({ media: "compaction", itemId }))).toBeTrue();
	expect(parses(withItem(fileChange(BROWSER_TIMELINE_LIMITS.fileChanges)))).toBeTrue();
	expect(parses(withItem(fileChange(BROWSER_TIMELINE_LIMITS.fileChanges + 1)))).toBeFalse();
	const tail = "x".repeat(BROWSER_TIMELINE_LIMITS.outputTail);
	expect(parses(withItem({ ...command, output: tail }))).toBeTrue();
	expect(parses(withItem({ ...command, output: `${tail}x` }))).toBeFalse();
	expect(parses(withItem({ ...command, output: "" }))).toBeFalse();
	expect(parses(withTurn(planStep("inProgress")))).toBeTrue();
	expect(parses(withTurn(planStep("blocked")))).toBeFalse();
	expect(parses(withTurn({ error: { message: "stream disconnected", details: null } }))).toBeTrue();
	const usage = timeline.usage;
	if (usage === null) {
		throw new Error("fixture is missing its token usage");
	}
	expect(parses({ ...timeline, usage: null })).toBeTrue();
	expect(
		parses({ ...timeline, usage: { ...usage, total: { ...usage.total, extra: 1 } } }),
	).toBeFalse();
});

test("voice-context delivery attempts are a closed wire union with ordered timing", () => {
	const { model } = createFixtureIds();
	const shared = {
		id: "voice-entry",
		kind: "callback",
		topic: null,
		sourceOrder: 1,
		capturedAtMs: 100,
		freshUntilMs: 200,
		reason: null,
		withheld: null,
		body: "exact callback body",
	} as const;
	expect(
		model.BrowserVoiceContextSchema.safeParse({
			kind: "voice_context",
			sessionId: "browser-session",
			ledgerId: "ledger",
			canonicalBrief: '{"source":"host_context"}',
			ownerEntriesTruncated: 0,
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
	]) {
		expect(
			model.BrowserVoiceContextSchema.safeParse({
				kind: "voice_context",
				sessionId: "browser-session",
				ledgerId: "ledger",
				canonicalBrief: '{"source":"host_context"}',
				ownerEntriesTruncated: 0,
				entriesTruncated: 0,
				entries: [{ ...shared, ...incoherent }],
			}).success,
		).toBeFalse();
	}
	expect(
		model.BrowserVoiceContextSchema.safeParse({
			kind: "voice_context",
			sessionId: "browser-session",
			ledgerId: "ledger",
			canonicalBrief: '{"source":"host_context"}',
			ownerEntriesTruncated: 2,
			entriesTruncated: 1,
			entries: [],
		}).success,
	).toBeFalse();
});

test("the coordinator's turns belong to the coordinator's thread, and to a bound coordinator only", () => {
	const { model, snapshot, identity } = createFixtureIds();
	const timeline = snapshot.timeline;
	if (timeline === null || snapshot.coordinator.threadId === null) {
		throw new Error("fixture is missing its timeline or its bound coordinator");
	}
	const parses = (next: unknown) => model.BrowserSnapshotSchema.safeParse(next).success;
	const turns = timeline.turns.map((turn) => ({ ...turn, delegatedBy: null }));
	const own = { ...timeline, threadId: snapshot.coordinator.threadId, turns };

	expect(parses({ ...snapshot, coordinatorTimeline: own })).toBeTrue();
	expect(parses({ ...snapshot, coordinatorTimeline: null })).toBeTrue();
	expect(parses(snapshot)).toBeTrue();
	// The workhorse thread's timeline is not the coordinator's.
	expect(parses({ ...snapshot, coordinatorTimeline: timeline })).toBeFalse();
	expect(
		parses({
			...snapshot,
			coordinatorTimeline: { ...own, threadId: identity.decoder.adoptThreadId("another") },
		}),
	).toBeFalse();
	expect(
		parses({
			...snapshot,
			coordinator: { ...snapshot.coordinator, threadId: null, activeTurnId: null },
			coordinatorTimeline: own,
		}),
	).toBeFalse();
	const voiceTurn = identity.decoder.adoptTurnId("voice-turn");
	const delegated = turns.map((turn) => Object.assign({}, turn, { delegatedBy: voiceTurn }));
	expect(parses({ ...snapshot, timeline: { ...timeline, turns: delegated } })).toBeTrue();
});
