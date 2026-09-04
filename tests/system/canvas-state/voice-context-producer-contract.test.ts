import { expect, test } from "bun:test";

import { createIdentityAuthority } from "../../../src/shared/codex-workbench-identity/index.js";
import {
	createSemanticContextPublisher,
	type SemanticContextInput,
} from "../../../src/runtime/codex-semantic-context/index.js";
import type { VoiceSessionView } from "../../../src/ui/voice-session/index.js";
import {
	createVoiceContextHistory,
	projectVoiceContext,
} from "../../../src/ui/voice-context/index.js";

test("fresh semantic bytes remain the exact voice-context display and copy source", () => {
	const identity = createIdentityAuthority();
	const workhorse = identity.decoder.adoptThreadId("workhorse");
	const turn = identity.decoder.adoptTurnId("turn-1");
	const coordinator = identity.decoder.adoptThreadId("coordinator");
	const realtimeSessionId = identity.issuer.mintRealtimeSessionId();
	const input: SemanticContextInput = {
		repository: "archboard",
		child: { id: identity.validator.childId, epoch: identity.validator.epoch },
		threadLink: { state: "executable", reason: null },
		workhorse: { threadId: workhorse, turnId: turn },
		coordinator: { threadId: coordinator, realtimeSessionId },
		board: { key: "payments", note: "boards/payments.md", version: 7 },
		pane: { paneId: "pane-a", focused: true },
		selection: ["element-b", "element-a"],
		claim: { holder: "agent", doing: "mapping the board" },
		doing: "mapping the board",
		cursor: { feedId: "feed-1", sequence: 3 },
		description: "Payments board",
	};
	const publisher = createSemanticContextPublisher({
		feed: { onChange: () => () => undefined },
		feedId: "feed-1",
		fresh: { read: () => input },
		contextForChange: () => input,
		now: () => 1_700_000_000_000,
	});
	try {
		const exact = publisher.freshBrief().brief;
		const session = {
			status: "listening",
			label: "Listening",
			detail: "Voice is listening.",
			accessibleStatus: "Listening. Voice is listening.",
			failure: null,
			outcome: { kind: "none" },
			controls: {
				canStart: false,
				canMute: true,
				canUnmute: false,
				canStop: true,
				canRestart: true,
				canClose: false,
			},
			binding: {
				paneId: "pane-a",
				childId: identity.validator.childId,
				epoch: identity.validator.epoch,
				workhorseThreadId: workhorse,
				coordinatorThreadId: coordinator,
			},
			sessionId: "browser-session",
		} as const satisfies VoiceSessionView;
		const history = createVoiceContextHistory();
		expect(
			history.capture({
				session,
				canonicalBrief: exact,
				observedAtMs: 1_700_000_000_001,
				provenance: "live",
			}),
		).toMatchObject({ outcome: "applied" });
		const stored = history.snapshot().sessions[0];
		const projected = projectVoiceContext({
			snapshot: history.snapshot(),
			sessionPage: 1,
			entryPages: new Map(),
			briefPages: new Map(),
			entryBodyPages: new Map(),
		}).sessions[0];
		if (stored === undefined || projected === undefined)
			throw new Error("Voice context did not retain the producer brief.");
		const fields = Object.fromEntries(projected.fields.map((field) => [field.label, field.value]));

		expect(stored.captured.canonicalBrief).toBe(exact);
		expect(projected.canonicalBrief).toBe(exact);
		expect(fields).toMatchObject({
			Feed: "feed-1",
			Repository: "archboard",
			Child: identity.validator.childId,
			Epoch: identity.validator.epoch,
			"Thread link": "executable",
			"Thread link reason": "None",
			Workhorse: workhorse,
			"Workhorse turn": turn,
			Coordinator: coordinator,
			"Coordinator realtime": realtimeSessionId,
			Board: "payments",
			"Board note": "boards/payments.md",
			Pane: "pane-a",
			"Focused at capture": "Focused",
			Version: "7",
			Selection: "element-a, element-b",
			Claim: "agent",
			"Claim doing": "mapping the board",
			Doing: "mapping the board",
			Cursor: "feed-1:3",
			Description: "Payments board",
			Freshness: "Fresh at capture",
			Captured: "2023-11-14T22:13:20.000Z",
			Ambiguity: "None",
			Truncation: "Not truncated",
			Staleness: "current",
			"Stale reasons": "None",
		});
	} finally {
		publisher.dispose();
	}
});
