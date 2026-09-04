import { describe, expect, test } from "bun:test";

import {
	createVoiceContextHistory,
	projectVoiceContext,
	voiceContextEntryExpansionKey,
	voiceContextIdentityKey,
} from "../index.js";
import { ledgerEntry, SESSION_A, SESSION_B, sessionStart, startBrief } from "./support/fixtures.js";

function projected(
	history: ReturnType<typeof createVoiceContextHistory>,
	overrides: Partial<Parameters<typeof projectVoiceContext>[0]> = {},
) {
	return projectVoiceContext({
		snapshot: history.snapshot(),
		showAllSessions: false,
		expandedSessions: new Set(),
		expandedBriefs: new Set(),
		expandedEntries: new Set(),
		limits: { collapsedSessions: 1, collapsedEntries: 2, collapsedBodyCharacters: 12 },
		...overrides,
	});
}

describe("voice context projection", () => {
	test("projects every captured baseline fact and exact canonical copy source", () => {
		const exact = '{"exact":"canonical start brief whose bytes do not change"}';
		const history = createVoiceContextHistory();
		history.start(
			sessionStart(SESSION_A, {
				brief: startBrief({
					canonicalBrief: exact,
					ambiguity: ["Selection spans two architectural paths"],
					truncated: true,
				}),
			}),
		);
		const session = projected(history).sessions[0]!;
		const fields = Object.fromEntries(session.fields.map((field) => [field.label, field.value]));

		expect(fields).toMatchObject({
			Repository: "archboard",
			Child: "child-a",
			Epoch: "epoch-a",
			Workhorse: "workhorse-a",
			Coordinator: "coordinator-a",
			"Realtime session": "realtime-a",
			Board: "checkout",
			Pane: "primary",
			Version: "42",
			"Focused at capture": "Focused",
			"Focus freshness": "Fresh at capture",
			"Selection freshness": "Fresh at capture",
			Claim: "agent",
			Doing: "Explaining the selected path",
			Cursor: "feed-a:17",
			Ambiguity: "Selection spans two architectural paths",
			Truncation: "Truncated",
		});
		expect(session.canonicalBrief).toBe(exact);
		expect(session.canonicalBriefPreview).toBe('{"exact":"ca…');
		expect(session.canonicalBriefTruncated).toBe(true);

		const expanded = projected(history, { expandedBriefs: new Set([session.key]) }).sessions[0]!;
		expect(expanded.canonicalBriefPreview).toBe(exact);
	});

	test("distinguishes stale focus from a fresh captured selection", () => {
		const history = createVoiceContextHistory();
		history.start(
			sessionStart(SESSION_A, {
				brief: startBrief({
					focusFreshness: "stale",
					focusFreshUntilMs: 1_799_999_999_950,
					selection: {
						elementIds: ["api"],
						capturedAtMs: 1_799_999_999_980,
						freshUntilMs: 1_800_000_001_980,
						freshness: "fresh",
					},
				}),
			}),
		);
		const fields = Object.fromEntries(
			projected(history).sessions[0]!.fields.map((field) => [field.label, field.value]),
		);

		expect(fields["Focus freshness"]).toBe("Stale at capture");
		expect(fields["Focus fresh until"]).toBe("2027-01-15T07:59:59.950Z");
		expect(fields["Selection freshness"]).toBe("Fresh at capture");
		expect(fields["Selection fresh until"]).toBe("2027-01-15T08:00:01.980Z");
	});

	test("keeps outcomes ordered and labels disconnected, uncertain, and recovered records", () => {
		const history = createVoiceContextHistory();
		history.start(sessionStart(SESSION_A, { provenance: "recovered" }));
		const variants = [
			ledgerEntry("1", { kind: "semantic", outcome: "delivered" }),
			ledgerEntry("2", {
				kind: "focus",
				outcome: "not_delivered",
				reason: "stale_session",
				attempted: false,
			}),
			ledgerEntry("3", {
				kind: "selection",
				outcome: "outcome_unknown",
				reason: "response_lost",
				connection: "disconnected",
				provenance: "recovered",
			}),
		] as const;
		for (const entry of variants) history.append({ identity: SESSION_A, entry });
		const sessionKey = voiceContextIdentityKey(SESSION_A);
		const result = projected(history, { expandedSessions: new Set([sessionKey]) }).sessions[0]!;

		expect(result.provenanceLabel).toBe("Recovered history");
		expect(result.entries.map((entry) => entry.kind)).toEqual(["semantic", "focus", "selection"]);
		expect(result.entries.map((entry) => entry.outcomeLabel)).toEqual([
			"Delivered",
			"Not delivered",
			"Outcome unknown",
		]);
		expect(result.entries[1]).toMatchObject({
			attemptLabel: "Not attempted",
			reason: "stale_session",
		});
		expect(result.entries[2]).toMatchObject({
			disconnected: true,
			connectionLabel: "Recorded while disconnected",
			provenanceLabel: "Recovered history",
		});
	});

	test("bounds collapsed sessions, rows, and bodies while the full ledger remains intact", () => {
		const history = createVoiceContextHistory();
		history.start(sessionStart(SESSION_A));
		for (let index = 1; index <= 5; index += 1)
			history.append({
				identity: SESSION_A,
				entry: ledgerEntry(String(index), { body: `body-${index}-is-longer-than-the-preview` }),
			});
		history.start(sessionStart(SESSION_B));

		const collapsed = projected(history);
		expect(collapsed.sessionCount).toBe(2);
		expect(collapsed.sessions).toHaveLength(1);
		expect(collapsed.hiddenSessionCount).toBe(1);
		const allSessions = projected(history, { showAllSessions: true });
		expect(allSessions.sessions).toHaveLength(2);
		const older = allSessions.sessions[1]!;
		expect(older.entries.map((entry) => entry.id)).toEqual(["4", "5"]);
		expect(older.hiddenEntryCount).toBe(3);
		expect(older.entries[0]!.bodyPreview).toBe("body-4-is-lo…");
		expect(history.snapshot().sessions[0]!.entries).toHaveLength(5);

		const key = voiceContextIdentityKey(SESSION_A);
		const bodyKey = voiceContextEntryExpansionKey(key, "1");
		const expanded = projected(history, {
			showAllSessions: true,
			expandedSessions: new Set([key]),
			expandedEntries: new Set([bodyKey]),
		}).sessions[1]!;
		expect(expanded.entries).toHaveLength(5);
		expect(expanded.entries[0]!.bodyPreview).toBe("body-1-is-longer-than-the-preview");
	});

	test("labels stale, replaced, and stopped sessions without dropping their evidence", () => {
		const history = createVoiceContextHistory();
		history.start(sessionStart(SESSION_A));
		history.markBriefStale({
			identity: SESSION_A,
			markedAtMs: 1_800_000_004_000,
			reasons: ["Pane focus changed after capture."],
		});
		history.start(sessionStart(SESSION_B));
		history.stop({ identity: SESSION_B, stoppedAtMs: 1_800_000_005_000 });
		const sessions = projected(history, { showAllSessions: true }).sessions;

		expect(sessions[0]).toMatchObject({ status: "stopped", statusLabel: "Stopped" });
		expect(sessions[1]).toMatchObject({
			status: "replaced",
			statusLabel: "Replaced",
			briefState: "stale",
			briefLabel: "Stale brief",
		});
		expect(sessions[1]!.briefDetail).toContain("Pane focus changed after capture.");
	});
});
