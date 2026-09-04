import { expect, test } from "bun:test";

import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import { CODEX_SEMANTIC_FRESHNESS_MS } from "../../../shared/timing/timing.js";
import { createSemanticContextPublisher, type SemanticContextInput } from "../index.js";

test("pins the canonical semantic_context bytes consumed by presentation adapters", () => {
	const identity = createIdentityAuthority();
	const workhorse = identity.decoder.adoptThreadId("workhorse");
	const turn = identity.decoder.adoptTurnId("turn-1");
	const coordinator = identity.decoder.adoptThreadId("coordinator");
	const realtimeSessionId = identity.issuer.mintRealtimeSessionId();
	const now = 1_700_000_000_000;
	const input: SemanticContextInput = {
		repository: "archboard",
		child: { id: identity.validator.childId, epoch: identity.validator.epoch },
		threadLink: { state: "executable", reason: null },
		workhorse: { threadId: workhorse, turnId: turn },
		coordinator: { threadId: coordinator, realtimeSessionId },
		board: { key: "payments", note: "boards/payments.excalidraw.md", version: 7 },
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
		now: () => now,
	});
	const brief = publisher.freshBrief().brief;
	const expected = JSON.stringify({
		source: "semantic_context",
		feedId: "feed-1",
		repository: "archboard",
		workhorse: { threadId: workhorse, turnId: turn },
		coordinator: { threadId: coordinator, realtimeSessionId },
		board: { key: "payments", note: "boards/payments.excalidraw.md", version: 7 },
		pane: { paneId: "pane-a", focused: true },
		version: 7,
		selection: ["element-a", "element-b"],
		claim: { holder: "agent", doing: "mapping the board" },
		doing: "mapping the board",
		cursor: { feedId: "feed-1", sequence: 3 },
		description: "Payments board",
		freshness: {
			capturedAtMs: now,
			freshUntilMs: now + CODEX_SEMANTIC_FRESHNESS_MS,
			state: "fresh",
		},
		truncated: false,
		ambiguity: [],
		staleness: { state: "current", reasons: [] },
		child: { id: identity.validator.childId, epoch: identity.validator.epoch },
		threadLink: { state: "executable", reason: null },
	});

	expect(brief).toBe(expected);
	publisher.dispose();
});
