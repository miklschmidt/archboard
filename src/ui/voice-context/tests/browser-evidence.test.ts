import { describe, expect, test } from "bun:test";

import type {
	BrowserSnapshot,
	BrowserVoiceContext,
} from "../../../shared/codex-browser-model/index.js";
import { createVoiceContextHistory, ingestVoiceContextBrowserEvidence } from "../index.js";
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
		const context = browserContext(SESSION_A, [
			delivery(2, "selection"),
			delivery(0, "semantic"),
			delivery(3, "callback"),
			delivery(1, "focus"),
		]);
		const input = {
			snapshot: snapshot({ ...context, canonicalBrief: exact }),
			session: SESSION_A,
			observedAtMs: 1_800_000_001_000,
			provenance: "recovered" as const,
			connection: "disconnected" as const,
		};

		const first = ingestVoiceContextBrowserEvidence(history, input);
		expect(first.entries.every((result) => result.outcome === "applied")).toBe(true);
		expect(history.snapshot().sessions[0]?.captured.canonicalBrief).toBe(exact);
		expect(history.snapshot().sessions[0]?.entries.map((entry) => entry.kind)).toEqual([
			"semantic",
			"focus",
			"selection",
			"callback",
		]);
		expect(history.snapshot().sessions[0]?.entries[3]).toMatchObject({
			body: "exact-callback-3",
			provenance: "recovered",
			connection: "disconnected",
		});

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
});
