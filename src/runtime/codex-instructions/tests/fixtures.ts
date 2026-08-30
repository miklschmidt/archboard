import type { ArchboardContext } from "../index.js";

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
		outcome: null,
	},
};

export const instructionByteMutations = {
	bom: (value: string) => `\ufeff${value}`,
	crlf: (value: string) => value.replaceAll("\n", "\r\n"),
	missingTerminalLf: (value: string) => value.slice(0, -1),
	extraTerminalLf: (value: string) => `${value}\n`,
	trailingSpace: (value: string) => `${value.slice(0, -1)} \n`,
	wrongSeparator: (value: string) =>
		value.replace("--- ARCHBOARD COORDINATOR ROLE ---", "--- COORDINATOR ROLE ---"),
} as const;
