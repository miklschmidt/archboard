import type { ArchboardContext } from "../index.js";

const contextFixture: ArchboardContext = {
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
	variant: {
		id: "7c40IV7N",
		name: "Queued ingest",
		lifecycle: "draft",
	},
	view: {
		id: "aB3dEf",
		name: "Service overview",
		grammar: "architecture",
	},
	selection: {
		count: 2,
		subjects: [
			{ kind: "node", id: "n1", name: "Gateway" },
			{ kind: "edge", id: "e1", name: null },
		],
		capturedAtMs: 102,
	},
	reconciliation: {
		required: true,
		count: 1,
		blockedBy: null,
		issues: [
			{
				subject: "n1",
				what: "node",
				kind: "competing-field",
				field: "name",
				repair: "Say which name this proposal means, or write a third answer.",
			},
		],
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

const instructionByteMutations = {
	bom: (value: string) => `﻿${value}`,
	crlf: (value: string) => value.replaceAll("\n", "\r\n"),
	missingTerminalLf: (value: string) => value.slice(0, -1),
	extraTerminalLf: (value: string) => `${value}\n`,
	trailingSpace: (value: string) => `${value.slice(0, -1)} \n`,
	wrongSeparator: (value: string) =>
		value.replace("--- ARCHBOARD COORDINATOR ROLE ---", "--- COORDINATOR ROLE ---"),
} as const;

export { contextFixture, instructionByteMutations };
