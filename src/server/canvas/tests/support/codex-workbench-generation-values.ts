import type { ArchboardContext } from "../../../../runtime/codex-instructions/index.js";

export const CODEX_WORKBENCH_COMPONENT_ORDER = [
	"identity",
	"epoch",
	"transport",
	"session",
	"threadLink",
	"workhorse",
	"semanticPublisher",
	"realtime",
	"approvals",
	"dynamicTools",
	"semanticDelivery",
	"coordinator",
	"queue",
	"operations",
	"spokenApproval",
	"coordinatorTools",
	"callbacks",
	"gateway",
] as const;

export const generationContextFixture: ArchboardContext = {
	schema: 1,
	paneId: "pane-fixture",
	board: { note: "vault/fixture.md", version: 1, cursor: null },
	threadLink: { state: "unbound", reason: null },
	child: { id: "fixture-child", epoch: "fixture-epoch" },
	workhorse: { threadId: null, turnId: null },
	coordinator: { threadId: null, realtimeSessionId: null },
	semantic: {
		brief: "Generation fixture.",
		capturedAtMs: 1,
		freshUntilMs: 2,
		truncated: false,
	},
	focus: { paneId: "pane-fixture", capturedAtMs: 1 },
	selection: { elementIds: [], capturedAtMs: 1 },
	claim: { holder: "none", doing: null },
	ambiguity: [],
	operation: { id: null, kind: null, rpc: null, outcome: null },
};
