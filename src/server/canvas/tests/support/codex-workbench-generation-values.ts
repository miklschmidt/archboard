import type { ArchboardContext } from "../../../../runtime/codex-instructions/index.js";

const CODEX_WORKBENCH_COMPONENT_ORDER = [
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

const generationContextFixture: ArchboardContext = {
	schema: 1,
	paneId: "pane-fixture",
	board: { name: "Fixture board", key: "fixture board", version: 1, cursor: null },
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
	variant: null,
	view: null,
	selection: { count: 0, subjects: [], capturedAtMs: 1 },
	reconciliation: { required: false, count: 0, blockedBy: null, issues: [] },
	claim: { holder: "none", doing: null },
	ambiguity: [],
	operation: { id: null, kind: null, rpc: null, outcome: null },
};

export { CODEX_WORKBENCH_COMPONENT_ORDER, generationContextFixture };
