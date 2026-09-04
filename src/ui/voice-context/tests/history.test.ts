import { describe, expect, test } from "bun:test";

import { createVoiceContextHistory } from "../index.js";
import { BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES } from "../../../shared/codex-browser-model/index.js";
import {
	BINDING_A,
	BINDING_B,
	canonicalBrief,
	capture,
	evidence,
	ledgerEntry,
	SESSION_A,
	SESSION_B,
	voiceSession,
} from "./support/fixtures.js";

describe("voice context history", () => {
	test("parses, copies, and freezes the exact canonical baseline", () => {
		const binding = {
			paneId: String(BINDING_A.paneId),
			childId: String(BINDING_A.childId),
			epoch: String(BINDING_A.epoch),
			workhorseThreadId: String(BINDING_A.workhorseThreadId),
			coordinatorThreadId: String(BINDING_A.coordinatorThreadId),
		};
		const session = voiceSession(binding);
		const exact = canonicalBrief(session, {
			selection: ["api", "worker"],
			ambiguity: ["Two paths meet here"],
		});
		const history = createVoiceContextHistory();
		expect(history.capture(capture(session, { canonicalBrief: exact })).outcome).toBe("applied");

		binding.paneId = "later-current-pane";
		const captured = history.snapshot().sessions[0]!;
		expect(captured.captured.canonicalBrief).toBe(exact);
		expect(captured.captured.brief.pane.paneId).toBe("primary");
		expect(captured.captured.brief.selection).toEqual(["api", "worker"]);
		expect(captured.captured.brief.ambiguity).toEqual(["Two paths meet here"]);
		expect(captured.captured.session.binding?.paneId).toBe("primary");
		expect(Object.isFrozen(captured.captured.brief.selection)).toBe(true);
		expect(Object.isFrozen(captured.captured.session.controls)).toBe(true);
		expect(Object.isFrozen(history.snapshot().sessions)).toBe(true);
	});

	test("retains externally observed replaced and stopped views without owning transitions", () => {
		const history = createVoiceContextHistory();
		history.capture(capture(SESSION_A));
		history.append({ session: SESSION_A, entry: ledgerEntry("1") });
		const replaced = voiceSession(BINDING_A, "realtime-a", {
			status: "failed",
			label: "Failed",
			detail: "The bound session was replaced.",
			failure: { code: "replaced", recoverable: false, message: "Binding changed." },
		});
		expect(history.observe(evidence(replaced, 1_800_000_002_000)).outcome).toBe("applied");
		expect(history.capture(capture(SESSION_B, { provenance: "recovered" })).outcome).toBe(
			"applied",
		);
		const stopped = voiceSession(BINDING_B, "realtime-b", {
			status: "stopped",
			label: "Stopped",
			detail: "Voice stopped.",
			controls: { ...SESSION_B.controls, canMute: false, canStop: false },
		});
		history.observe(evidence(stopped, 1_800_000_003_000, "recovered"));

		const [oldSession, newSession] = history.snapshot().sessions;
		expect(oldSession?.observations.at(-1)?.session.failure?.code).toBe("replaced");
		expect(oldSession?.entries.map((entry) => entry.id)).toEqual(["1"]);
		expect(newSession?.observations.at(-1)?.session.status).toBe("stopped");
		expect(newSession?.captured.canonicalBrief).toBe(canonicalBrief(SESSION_B));
	});

	test("inserts semantic, focus, selection, and callback evidence by authoritative order", () => {
		const history = createVoiceContextHistory();
		history.capture(capture());
		const inputs = [
			ledgerEntry("callback", {
				kind: "callback",
				sourceOrder: { kind: "adapter_ledger", ledgerId: "coordinator-a", position: 4 },
			}),
			ledgerEntry("semantic", {
				kind: "semantic",
				sourceOrder: { kind: "adapter_ledger", ledgerId: "coordinator-a", position: 1 },
			}),
			ledgerEntry("selection", {
				kind: "selection",
				sourceOrder: { kind: "adapter_ledger", ledgerId: "coordinator-a", position: 3 },
			}),
			ledgerEntry("focus", {
				kind: "focus",
				sourceOrder: { kind: "adapter_ledger", ledgerId: "coordinator-a", position: 2 },
			}),
		] as const;
		for (const entry of inputs)
			expect(history.append({ session: SESSION_A, entry }).outcome).toBe("applied");
		expect(history.snapshot().sessions[0]?.entries.map((entry) => entry.kind)).toEqual([
			"semantic",
			"focus",
			"selection",
			"callback",
		]);
		expect(
			history.append({
				session: SESSION_A,
				entry: ledgerEntry("conflict", {
					sourceOrder: { kind: "adapter_ledger", ledgerId: "coordinator-a", position: 2 },
				}),
			}),
		).toMatchObject({ outcome: "ignored", reason: "source_order_conflict" });
		expect(
			history.append({
				session: SESSION_A,
				entry: ledgerEntry("other", {
					sourceOrder: { kind: "adapter_ledger", ledgerId: "other-ledger", position: 5 },
				}),
			}),
		).toMatchObject({ outcome: "ignored", reason: "source_stream_mismatch" });
	});

	test("retains disconnected, uncertain, and recovered delivery evidence", () => {
		const history = createVoiceContextHistory();
		history.capture(capture(SESSION_A, { provenance: "recovered" }));
		const uncertain = ledgerEntry("8", {
			kind: "callback",
			outcome: "outcome_unknown",
			reason: "response_lost",
			body: "exact attempted callback",
			connection: "disconnected",
			provenance: "recovered",
		});
		expect(history.append({ session: SESSION_A, entry: uncertain }).outcome).toBe("applied");
		expect(history.append({ session: SESSION_A, entry: uncertain })).toMatchObject({
			outcome: "ignored",
			reason: "duplicate_entry",
		});
		const mismatched = voiceSession({ ...BINDING_A, paneId: "other-pane" });
		expect(history.append({ session: mismatched, entry: ledgerEntry("9") })).toMatchObject({
			outcome: "ignored",
			reason: "unknown_session",
		});
		expect(history.snapshot().sessions[0]?.entries).toEqual([uncertain]);
	});

	test("refuses malformed or contradictory canonical bytes", () => {
		const history = createVoiceContextHistory();
		expect(history.capture(capture(SESSION_A, { canonicalBrief: "not json" }))).toMatchObject({
			outcome: "ignored",
			reason: "invalid_brief",
		});
		const contradictory = canonicalBrief(SESSION_B);
		expect(history.capture(capture(SESSION_A, { canonicalBrief: contradictory }))).toMatchObject({
			outcome: "ignored",
			reason: "identity_mismatch",
		});
		expect(history.snapshot().sessions).toHaveLength(0);
	});

	test("accepts only identity values carrying the fitter's clipped-prefix evidence", () => {
		const clipped = JSON.parse(canonicalBrief(SESSION_A, { truncated: true })) as Record<
			string,
			unknown
		>;
		clipped.child = { id: "child-…", epoch: "epoch-…" };
		clipped.workhorse = { threadId: "workhorse-…", turnId: "turn-a" };
		clipped.coordinator = { threadId: "coordinator-…", realtimeSessionId: "wire-session" };
		clipped.pane = { paneId: "prim…", focused: true };
		const exact = JSON.stringify(clipped);
		const history = createVoiceContextHistory();

		expect(history.capture(capture(SESSION_A, { canonicalBrief: exact })).outcome).toBe("applied");
		expect(history.snapshot().sessions[0]?.captured.canonicalBrief).toBe(exact);

		const other = createVoiceContextHistory();
		expect(
			other.capture(
				capture(SESSION_A, { canonicalBrief: canonicalBrief(SESSION_B, { truncated: true }) }),
			),
		).toMatchObject({ outcome: "ignored", reason: "identity_mismatch" });
	});

	test("rejects incoherent timing, outcomes, and bodies before retention", () => {
		const history = createVoiceContextHistory();
		history.capture(capture());
		const invalid = [
			ledgerEntry("bad-capture", {
				freshness: { capturedAtMs: Number.NaN, freshUntilMs: 2 },
			}),
			ledgerEntry("bad-window", {
				freshness: { capturedAtMs: 10, freshUntilMs: 9 },
			}),
			ledgerEntry("bad-attempt-order", {
				freshness: { capturedAtMs: 10, freshUntilMs: 20 },
				attemptedAtMs: 9,
			}),
			{
				...ledgerEntry("bad-unattempted-outcome"),
				attempted: false,
				attemptedAtMs: null,
				outcome: "outcome_unknown",
			} as never,
			{
				...ledgerEntry("bad-unattempted-time"),
				attempted: false,
				attemptedAtMs: 12,
				outcome: "not_delivered",
			} as never,
			ledgerEntry("bad-body", {
				body: "x".repeat(BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES + 1),
			}),
		];
		for (const entry of invalid)
			expect(history.append({ session: SESSION_A, entry })).toMatchObject({
				outcome: "ignored",
				reason: "invalid_delivery_evidence",
			});
		expect(history.snapshot().sessions[0]?.entries).toHaveLength(0);

		const notAttempted = ledgerEntry("valid-no-attempt", {
			attempted: false,
			outcome: "not_delivered",
		});
		expect(history.append({ session: SESSION_A, entry: notAttempted }).outcome).toBe("applied");
	});
});
