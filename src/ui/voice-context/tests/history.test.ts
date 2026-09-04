import { describe, expect, test } from "bun:test";

import { createVoiceContextHistory } from "../index.js";
import { ledgerEntry, SESSION_A, SESSION_B, sessionStart, startBrief } from "./support/fixtures.js";

describe("voice context history", () => {
	test("copies and freezes the exact baseline instead of retaining publisher-owned values", () => {
		const selection = ["api", "worker"];
		const ambiguity = ["Two panes named primary"];
		const reasons = ["Focus was older than the freshness window"];
		const canonicalBrief = '{"exact":"captured bytes stay unchanged"}';
		const brief = startBrief({
			canonicalBrief,
			focusFreshness: "stale",
			selection: {
				elementIds: selection,
				capturedAtMs: 1_799_999_999_800,
				freshUntilMs: 1_800_000_001_800,
				freshness: "fresh",
			},
			ambiguity,
			staleness: { state: "stale", reasons },
		});
		const history = createVoiceContextHistory();
		expect(history.start(sessionStart(SESSION_A, { brief })).outcome).toBe("applied");

		selection.push("late-current-selection");
		ambiguity.push("late-current-ambiguity");
		reasons.push("late-current-reason");
		const captured = history.snapshot().sessions[0]!;

		expect(captured.brief.selection.elementIds).toEqual(["api", "worker"]);
		expect(captured.brief.ambiguity).toEqual(["Two panes named primary"]);
		expect(captured.brief.staleness.reasons).toEqual(["Focus was older than the freshness window"]);
		expect(captured.brief.focusFreshness).toBe("stale");
		expect(captured.brief.selection.freshness).toBe("fresh");
		expect(captured.brief.canonicalBrief).toBe(canonicalBrief);
		expect(Object.isFrozen(captured.brief.selection.elementIds)).toBe(true);
		expect(Object.isFrozen(captured.brief)).toBe(true);
		expect(Object.isFrozen(history.snapshot().sessions)).toBe(true);
	});

	test("marks a prior exact session replaced and later stops only the active identity", () => {
		const history = createVoiceContextHistory();
		history.start(sessionStart(SESSION_A));
		history.append({ identity: SESSION_A, entry: ledgerEntry("entry-1") });
		history.start(
			sessionStart(SESSION_B, {
				startedAtMs: 1_800_000_002_000,
				provenance: "recovered",
			}),
		);

		const replaced = history.snapshot().sessions[0]!;
		expect(replaced.status).toMatchObject({
			state: "replaced",
			replacedAtMs: 1_800_000_002_000,
			replacedBy: SESSION_B,
		});
		expect(replaced.entries.map((entry) => entry.id)).toEqual(["entry-1"]);
		expect(history.stop({ identity: SESSION_A, stoppedAtMs: 1_800_000_003_000 })).toMatchObject({
			outcome: "ignored",
			reason: "session_not_active",
		});
		expect(history.stop({ identity: SESSION_B, stoppedAtMs: 1_800_000_003_100 }).outcome).toBe(
			"applied",
		);
		expect(history.snapshot().sessions[1]!.status).toEqual({
			state: "stopped",
			startedAtMs: 1_800_000_002_000,
			stoppedAtMs: 1_800_000_003_100,
		});
		expect(history.snapshot().sessions[1]!.brief.canonicalBrief).toContain("archboard");
	});

	test("retains disconnected, uncertain, and recovered entries under their exact identity", () => {
		const history = createVoiceContextHistory();
		history.start(sessionStart(SESSION_A, { provenance: "recovered" }));
		const uncertain = ledgerEntry("uncertain", {
			kind: "callback",
			outcome: "outcome_unknown",
			reason: "response_lost",
			body: "exact attempted callback",
			connection: "disconnected",
			provenance: "recovered",
		});
		expect(history.append({ identity: SESSION_A, entry: uncertain }).outcome).toBe("applied");

		const mismatched = { ...SESSION_A, paneId: "other-pane" };
		expect(history.append({ identity: mismatched, entry: ledgerEntry("wrong") })).toMatchObject({
			outcome: "ignored",
			reason: "unknown_session",
		});
		expect(history.append({ identity: SESSION_A, entry: uncertain })).toMatchObject({
			outcome: "ignored",
			reason: "duplicate_entry",
		});
		expect(history.snapshot().sessions[0]!.entries).toEqual([uncertain]);
	});

	test("marks stale against one exact session and publishes only accepted mutations", () => {
		const history = createVoiceContextHistory();
		const revisions: number[] = [];
		const unsubscribe = history.subscribe(() => revisions.push(history.snapshot().revision));
		history.start(sessionStart(SESSION_A));
		expect(
			history.markBriefStale({
				identity: SESSION_A,
				markedAtMs: 1_800_000_004_000,
				reasons: ["The pane focus changed after capture."],
			}),
		).toMatchObject({ outcome: "applied", revision: 2 });
		expect(
			history.markBriefStale({
				identity: SESSION_A,
				markedAtMs: 1_800_000_004_100,
				reasons: ["A later reason must not replace the captured one."],
			}),
		).toMatchObject({ outcome: "ignored", reason: "already_stale", revision: 2 });
		expect(history.snapshot().sessions[0]!.briefCondition).toMatchObject({
			state: "stale",
			reasons: ["The pane focus changed after capture."],
		});
		expect(revisions).toEqual([1, 2]);
		unsubscribe();
	});
});
