import type { ArchboardContext } from "../../codex-instructions/index.js";

export const contextFixture: ArchboardContext = {
	schema: 1,
	paneId: "pane-1",
	board: {
		name: "Ingest pipeline",
		key: "ingest pipeline",
		version: 42,
		cursor: "cursor-1",
	},
	threadLink: {
		state: "executable",
		reason: null,
	},
	child: {
		id: "child-1",
		epoch: "epoch-1",
	},
	workhorse: {
		threadId: "thread-workhorse",
		turnId: "turn-1",
	},
	coordinator: {
		threadId: "thread-coordinator",
		realtimeSessionId: null,
	},
	semantic: {
		brief: "The selected service depends on the repository adapter.",
		capturedAtMs: 100,
		freshUntilMs: 30_100,
		truncated: false,
	},
	focus: {
		paneId: "pane-1",
		capturedAtMs: 101,
	},
	variant: null,
	view: null,
	selection: {
		count: 1,
		subjects: [{ kind: "node", id: "n1", name: "Gateway" }],
		capturedAtMs: 102,
	},
	reconciliation: { required: false, count: 0, blockedBy: null, issues: [] },
	claim: {
		holder: "human",
		doing: "Reviewing the adapter boundary",
	},
	ambiguity: [],
	operation: {
		id: null,
		kind: null,
		rpc: null,
		outcome: null,
	},
};
