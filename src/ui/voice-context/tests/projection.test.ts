import { describe, expect, test } from "bun:test";

import {
	createVoiceContextHistory,
	projectVoiceContext,
	voiceContextEntryExpansionKey,
	voiceContextSessionKey,
} from "../index.js";
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

function projected(
	history: ReturnType<typeof createVoiceContextHistory>,
	overrides: Partial<Parameters<typeof projectVoiceContext>[0]> = {},
) {
	return projectVoiceContext({
		snapshot: history.snapshot(),
		sessionPage: 1,
		entryPages: new Map(),
		briefPages: new Map(),
		entryBodyPages: new Map(),
		limits: { sessionPageSize: 1, entryPageSize: 2, bodyWindowCharacters: 12 },
		...overrides,
	});
}

describe("voice context projection", () => {
	test("derives every baseline field from the exact canonical copy bytes", () => {
		const exact = canonicalBrief(SESSION_A, {
			ambiguity: ["Selection spans two architectural paths"],
			truncated: true,
			description: "API calls worker through queue.",
			coordinatorRealtimeSessionId: "wire-realtime-a",
		});
		const history = createVoiceContextHistory();
		history.capture(capture(SESSION_A, { canonicalBrief: exact }));
		const session = projected(history).sessions[0]!;
		const fields = Object.fromEntries(session.fields.map((field) => [field.label, field.value]));

		expect(fields).toMatchObject({
			Feed: "feed-a",
			Repository: "archboard",
			Child: "child-a",
			Epoch: "epoch-a",
			"Thread link": "executable",
			Workhorse: "workhorse-a",
			"Workhorse turn": "turn-a",
			Coordinator: "coordinator-a",
			"Coordinator realtime": "wire-realtime-a",
			Board: "checkout",
			"Board note": "Architecture/checkout.excalidraw.md",
			Pane: "primary",
			"Focused at capture": "Focused",
			Version: "42",
			Selection: "api, worker",
			Claim: "agent",
			"Claim doing": "Inspecting the delivery seam",
			Doing: "Explaining the selected path",
			Cursor: "feed-a:17",
			Description: "API calls worker through queue.",
			Freshness: "Fresh at capture",
			Ambiguity: "Selection spans two architectural paths",
			Truncation: "Truncated",
			Staleness: "current",
		});
		expect(fields["Focus freshness"]).toBeUndefined();
		expect(fields["Selection freshness"]).toBeUndefined();
		expect(session.canonicalBrief).toBe(exact);
		expect(session.canonicalBriefPreview).toBe(`${[...exact].slice(0, 12).join("")}…`);
	});

	test("retains byte-capped identity fields while session identity stays external", () => {
		const exact = canonicalBrief(SESSION_A, { clippedIdentity: "…", truncated: true });
		const history = createVoiceContextHistory();
		expect(history.capture(capture(SESSION_A, { canonicalBrief: exact })).outcome).toBe("applied");
		const session = projected(history).sessions[0]!;
		const fields = Object.fromEntries(session.fields.map((field) => [field.label, field.value]));

		expect(history.snapshot().sessions[0]?.captured.canonicalBrief).toBe(exact);
		expect(fields).toMatchObject({
			Child: "…",
			Epoch: "…",
			Workhorse: "…",
			"Workhorse turn": "…",
			Coordinator: "…",
			"Coordinator realtime": "…",
			Pane: "…",
			Truncation: "Truncated",
		});
		expect(session.key).toBe(voiceContextSessionKey(SESSION_A));
		expect(session.sessionId).toBe("realtime-a");
		expect(session.status).toBe(SESSION_A.status);
	});

	test("computes delivery freshness at attempt and labels adapter outcomes", () => {
		const history = createVoiceContextHistory();
		history.capture(capture(SESSION_A, { provenance: "recovered" }));
		const entries = [
			ledgerEntry("1", { kind: "semantic", outcome: "delivered" }),
			ledgerEntry("2", {
				kind: "focus",
				attempted: false,
				outcome: "not_delivered",
				reason: "stale_session",
			}),
			ledgerEntry("3", {
				kind: "selection",
				freshness: {
					capturedAtMs: 1_800_000_001_003,
					freshUntilMs: 1_800_000_001_103,
				},
				attemptedAtMs: 1_800_000_001_103,
			}),
			ledgerEntry("4", {
				kind: "callback",
				outcome: "outcome_unknown",
				reason: "response_lost",
				connection: "disconnected",
				provenance: "recovered",
			}),
		] as const;
		for (const entry of entries.toReversed()) history.append({ session: SESSION_A, entry });
		const result = projected(history, {
			entryPages: new Map([[voiceContextSessionKey(SESSION_A), 2]]),
		}).sessions[0]!;

		expect(result.entries.map((entry) => entry.kind)).toEqual([
			"semantic",
			"focus",
			"selection",
			"callback",
		]);
		expect(result.entries.map((entry) => entry.freshnessLabel)).toEqual([
			"Fresh at attempt",
			"Not attempted",
			"Stale at attempt",
			"Fresh at attempt",
		]);
		expect(result.entries.map((entry) => entry.outcomeLabel)).toEqual([
			"Delivered",
			"Not delivered",
			"Delivered",
			"Outcome unknown",
		]);
		expect(result.entries[3]).toMatchObject({
			connectionLabel: "Recorded while disconnected",
			provenanceLabel: "Recovered history",
			reason: "response_lost",
		});
	});

	test("reveals only one bounded session, entry, and body window per page", () => {
		const history = createVoiceContextHistory();
		history.capture(capture(SESSION_A));
		for (let index = 1; index <= 5; index += 1)
			history.append({
				session: SESSION_A,
				entry: ledgerEntry(String(index), { body: `body-${index}-is-longer-than-two-windows` }),
			});
		history.capture(capture(SESSION_B));
		const third = voiceSession({ ...BINDING_B, childId: "child-c", paneId: "third" }, "realtime-c");
		history.capture(capture(third));

		const first = projected(history);
		expect(first.sessions).toHaveLength(1);
		expect(first.hiddenSessionCount).toBe(2);
		expect(projected(history, { sessionPage: 2 }).sessions).toHaveLength(2);
		const all = projected(history, { sessionPage: 3 });
		expect(all.sessions).toHaveLength(3);
		const key = voiceContextSessionKey(SESSION_A);
		const older = all.sessions[2]!;
		expect(older.entries.map((entry) => entry.id)).toEqual(["4", "5"]);
		expect(older.hiddenEntryCount).toBe(3);
		const twoPages = projected(history, {
			sessionPage: 3,
			entryPages: new Map([[key, 2]]),
		}).sessions[2]!;
		expect(twoPages.entries.map((entry) => entry.id)).toEqual(["2", "3", "4", "5"]);
		expect(twoPages.hiddenEntryCount).toBe(1);

		const bodyKey = voiceContextEntryExpansionKey(key, "5");
		const bodyPage = projected(history, {
			sessionPage: 3,
			entryBodyPages: new Map([[bodyKey, 2]]),
		}).sessions[2]!.entries[1]!;
		expect([...bodyPage.bodyPreview].length).toBeLessThanOrEqual(25);
		expect(bodyPage.bodyRemainingCharacters).toBeGreaterThan(0);
		expect(history.snapshot().sessions[0]?.entries).toHaveLength(5);
	});

	test("derives stale, replaced, and stopped labels from captured bytes and session views", () => {
		const history = createVoiceContextHistory();
		const stale = canonicalBrief(SESSION_A, {
			freshness: {
				capturedAtMs: 1_800_000_000_000,
				freshUntilMs: 1_800_000_000_500,
				state: "stale",
			},
			staleness: { state: "stale", reasons: ["semantic freshness window expired"] },
		});
		history.capture(capture(SESSION_A, { canonicalBrief: stale }));
		history.observe(
			evidence(
				voiceSession(BINDING_A, "realtime-a", {
					status: "failed",
					label: "Failed",
					detail: "The bound session was replaced.",
					failure: { code: "replaced", recoverable: false, message: "Binding changed." },
				}),
				1_800_000_002_000,
			),
		);
		history.capture(capture(SESSION_B));
		history.observe(
			evidence(
				voiceSession(BINDING_B, "realtime-b", {
					status: "stopped",
					label: "Stopped",
					detail: "Voice stopped.",
				}),
				1_800_000_003_000,
			),
		);
		const sessions = projected(history, { sessionPage: 2 }).sessions;
		expect(sessions[0]).toMatchObject({ status: "stopped", statusLabel: "Stopped" });
		expect(sessions[0]?.statusDetail).toContain("captured baseline and ledger remain available");
		expect(sessions[1]).toMatchObject({
			status: "failed",
			statusLabel: "Replaced",
			replaced: true,
			briefLabel: "Stale brief",
		});
		expect(sessions[1]?.briefDetail).toContain("semantic freshness window expired");
	});
});
