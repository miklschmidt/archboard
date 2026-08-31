import type { ArchboardContext } from "../../codex-instructions/index.js";

export const contextFixture: ArchboardContext = {
	schema: 1,
	paneId: "pane-1",
	board: {
		note: "vault/architecture.excalidraw.md",
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
	selection: {
		elementIds: ["element-1", "element-2"],
		capturedAtMs: 102,
	},
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
