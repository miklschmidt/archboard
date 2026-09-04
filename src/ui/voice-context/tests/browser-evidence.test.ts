import { describe, expect, test } from "bun:test";

import type {
	BrowserSnapshot,
	BrowserVoiceContext,
} from "../../../shared/codex-browser-model/index.js";
import {
	createVoiceContextHistory,
	ingestVoiceContextBrowserEvidence,
	projectVoiceContext,
} from "../index.js";
import {
	BINDING_A,
	canonicalBrief,
	SESSION_A,
	SESSION_B,
	voiceSession,
} from "./support/fixtures.js";

function snapshot(voiceContext: BrowserVoiceContext | null): BrowserSnapshot {
	return { voiceContext } as BrowserSnapshot;
}

function browserContext(
	session = SESSION_A,
	entries: BrowserVoiceContext["entries"] = [],
): BrowserVoiceContext {
	return {
		kind: "voice_context",
		sessionId: session.sessionId as BrowserVoiceContext["sessionId"],
		ledgerId: `ledger-${session.sessionId}`,
		canonicalBrief: canonicalBrief(session),
		ownerEntriesTruncated: 0,
		entriesTruncated: 0,
		entries,
	};
}

function delivery(
	sourceOrder: number,
	kind: BrowserVoiceContext["entries"][number]["kind"],
): BrowserVoiceContext["entries"][number] {
	return {
		id: `${kind}-${sourceOrder}`,
		kind,
		sourceOrder,
		capturedAtMs: 1_800_000_000_000 + sourceOrder,
		freshUntilMs: 1_800_000_000_500 + sourceOrder,
		attempted: true,
		attemptedAtMs: 1_800_000_000_100 + sourceOrder,
		outcome: sourceOrder === 2 ? "outcome_unknown" : "delivered",
		reason: sourceOrder === 2 ? "response_lost" : null,
		body: `exact-${kind}-${sourceOrder}`,
	};
}

describe("voice context browser evidence", () => {
	test("retains exact start bytes and inserts callback-owner records by source order", () => {
		const history = createVoiceContextHistory();
		const exact = canonicalBrief(SESSION_A);
		const context = {
			...browserContext(SESSION_A, [
				delivery(4, "selection"),
				delivery(2, "semantic"),
				delivery(5, "callback"),
				delivery(3, "focus"),
			]),
			ownerEntriesTruncated: 1,
			entriesTruncated: 3,
		};
		const input = {
			snapshot: snapshot({ ...context, canonicalBrief: exact }),
			session: SESSION_A,
			observedAtMs: 1_800_000_001_000,
			provenance: "recovered" as const,
			connection: "disconnected" as const,
		};

		const first = ingestVoiceContextBrowserEvidence(history, input);
		expect(first.entries.every((result) => result.outcome === "applied")).toBe(true);
		expect(first.sourceHistory?.outcome).toBe("applied");
		expect(history.snapshot().sessions[0]?.captured.canonicalBrief).toBe(exact);
		expect(history.snapshot().sessions[0]?.entries.map((entry) => entry.kind)).toEqual([
			"semantic",
			"focus",
			"selection",
			"callback",
		]);
		expect(history.snapshot().sessions[0]?.entries[3]).toMatchObject({
			body: "exact-callback-5",
			provenance: "recovered",
			connection: "disconnected",
		});
		expect(history.snapshot().sessions[0]).toMatchObject({
			ownerOmittedPrefixCount: 1,
			sourceEntryCount: 7,
		});
		const beforeRecovery = projectVoiceContext({
			snapshot: history.snapshot(),
			sessionPage: 1,
			entryPages: new Map(),
			briefPages: new Map(),
			entryBodyPages: new Map(),
		}).sessions[0];
		expect(beforeRecovery?.omittedPrefixCount).toBe(3);

		ingestVoiceContextBrowserEvidence(history, {
			...input,
			observedAtMs: input.observedAtMs + 1,
			snapshot: snapshot({
				...context,
				entriesTruncated: 1,
				entries: [delivery(0, "semantic"), delivery(1, "focus"), ...context.entries],
			}),
		});
		const afterRecovery = projectVoiceContext({
			snapshot: history.snapshot(),
			sessionPage: 1,
			entryPages: new Map(),
			briefPages: new Map(),
			entryBodyPages: new Map(),
		}).sessions[0];
		expect(afterRecovery?.omittedPrefixCount).toBe(1);
		expect(history.snapshot().sessions[0]?.entries).toHaveLength(6);

		const revision = history.snapshot().revision;
		ingestVoiceContextBrowserEvidence(history, input);
		expect(history.snapshot().revision).toBe(revision);
	});

	test("retains replaced and stopped observations after browser generation evidence vanishes", () => {
		const history = createVoiceContextHistory();
		ingestVoiceContextBrowserEvidence(history, {
			snapshot: snapshot(browserContext()),
			session: SESSION_A,
			observedAtMs: 1,
			provenance: "live",
			connection: "connected",
		});
		const replaced = voiceSession(BINDING_A, "realtime-a", {
			status: "failed",
			label: "Failed",
			detail: "The browser owner replaced this session.",
			failure: { code: "replaced", recoverable: false, message: "Binding changed." },
		});
		ingestVoiceContextBrowserEvidence(history, {
			snapshot: snapshot(null),
			session: replaced,
			observedAtMs: 2,
			provenance: "live",
			connection: "connected",
		});
		ingestVoiceContextBrowserEvidence(history, {
			snapshot: snapshot(browserContext(SESSION_B)),
			session: SESSION_B,
			observedAtMs: 3,
			provenance: "live",
			connection: "connected",
		});
		const stopped = voiceSession(SESSION_B.binding!, "realtime-b", {
			status: "stopped",
			label: "Stopped",
			detail: "Voice stopped.",
		});
		ingestVoiceContextBrowserEvidence(history, {
			snapshot: snapshot(null),
			session: stopped,
			observedAtMs: 4,
			provenance: "live",
			connection: "connected",
		});

		expect(history.snapshot().sessions).toHaveLength(2);
		expect(history.snapshot().sessions[0]?.observations.at(-1)?.session.failure?.code).toBe(
			"replaced",
		);
		expect(history.snapshot().sessions[1]?.observations.at(-1)?.session.status).toBe("stopped");
		expect(
			history.snapshot().sessions.every((record) => record.captured.canonicalBrief.length > 0),
		).toBe(true);
	});

	test("keeps owner-evicted evidence complete when the UI retained it earlier", () => {
		const history = createVoiceContextHistory();
		const full = browserContext(SESSION_A, [
			delivery(0, "semantic"),
			delivery(1, "focus"),
			delivery(2, "selection"),
		]);
		ingestVoiceContextBrowserEvidence(history, {
			snapshot: snapshot(full),
			session: SESSION_A,
			observedAtMs: 1,
			provenance: "live",
			connection: "connected",
		});
		ingestVoiceContextBrowserEvidence(history, {
			snapshot: snapshot({
				...full,
				ownerEntriesTruncated: 1,
				entriesTruncated: 1,
				entries: full.entries.slice(1),
			}),
			session: SESSION_A,
			observedAtMs: 2,
			provenance: "live",
			connection: "connected",
		});
		const projected = projectVoiceContext({
			snapshot: history.snapshot(),
			sessionPage: 1,
			entryPages: new Map(),
			briefPages: new Map(),
			entryBodyPages: new Map(),
		}).sessions[0];

		expect(history.snapshot().sessions[0]).toMatchObject({
			ownerOmittedPrefixCount: 1,
			sourceEntryCount: 3,
		});
		expect(projected?.entryCount).toBe(3);
		expect(projected?.omittedPrefixCount).toBe(0);
	});
});
