// A line from a container leaves by its title row and runs clear of the
// cards the container holds. With a group's region packed as a block of its
// own, Graphviz ranks a block that draws a container inline with `newrank`,
// which does not keep the block's bottom ports alone on its last rank. The
// container's last card shared their rank, that band was spaced as ports
// alone at the block's foot, and it stood over the label band above it, so
// the line from the container's title row ran through the card (Codex
// workhorse, reduced).
// What this catches: a band of a block drawn over the band above it, seen as
// a line through a card that is neither of its ends.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

const policy = SemanticPolicySchema.parse({
	levels: ["module"],
	nodeKinds: { module: { name: "Module", icon: "RiBox3Line", color: "violet" } },
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
	},
	groups: {
		voice: { name: "Voice", color: "yellow" },
		child: { name: "Codex child", color: "indigo" },
	},
});

const traffic = { speed: 40, volume: 0.5 };

const content = orderedFixture({
	nodes: [
		{ id: "tools", name: "Coordinator tools", kind: "module", parent: "doors", groups: ["voice"] },
		{
			id: "ops",
			name: "Workhorse operations",
			kind: "module",
			parent: "turns",
			responsibility:
				"The four things the coordinator may ask of a workhorse, one at a time: delegate, steer, inspect, manage its queue",
		},
		{ id: "starter", name: "Workhorse start", kind: "module", parent: "start" },
		{ id: "link", name: "Thread link", kind: "module", parent: "start" },
		{
			id: "ledger",
			name: "Epoch ledger",
			kind: "module",
			parent: "start",
			groups: ["child"],
			responsibility:
				"Which child generation owns which thread, on disk, with operations that commit, roll back or say the outcome is unknown",
		},
		{ id: "session", name: "Codex session", kind: "module", groups: ["child"] },
		{
			id: "tell",
			name: "Tell coordinator",
			kind: "module",
			parent: "calls",
			groups: ["voice"],
			responsibility:
				"The archboard_coordinator tool a workhorse is started with: tell the coordinator one thing while it works",
		},
		{
			id: "calls",
			name: "Coordinator callbacks",
			kind: "module",
			parent: "doors",
			groups: ["voice"],
		},
		{ id: "workers", name: "Session workhorses", kind: "module", parent: "doors" },
		{ id: "doors", name: "Pane and coordinator doors", kind: "module" },
		{ id: "turns", name: "Turns", kind: "module" },
		{
			id: "start",
			name: "Thread start",
			kind: "module",
			responsibility:
				"Opens a workhorse's thread with its authored instructions and tool manifest, binds it to its tab session and checkout, and records which child generation owns it",
		},
	],
	edges: [
		{
			id: "ask",
			from: "tools",
			to: "ops",
			kind: "call",
			label: "a delegation",
			emphasis: "hero",
			traffic,
		},
		{ id: "stage", from: "ops", to: "ledger", kind: "call", label: "stage the operation" },
		{
			id: "turn",
			from: "ops",
			to: "session",
			kind: "rpc",
			label: "turn/start",
			emphasis: "hero",
			traffic,
		},
		{
			id: "digest",
			from: "starter",
			to: "tell",
			kind: "dependency",
			label: "by digest",
			emphasis: "muted",
		},
		{
			id: "check",
			from: "calls",
			to: "link",
			kind: "call",
			label: "check the link",
			emphasis: "muted",
		},
		{
			id: "news",
			from: "calls",
			to: "session",
			kind: "rpc",
			label: "pane news",
			emphasis: "muted",
		},
		{ id: "stop", from: "tools", to: "workers", kind: "call", label: "stop every workhorse" },
	],
});

test("a line from a container runs clear of the cards it holds", async () => {
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	expect(routesThroughCards(drawing, content)).toEqual([]);
});
