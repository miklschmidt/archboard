import { test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import boardChangesReachTheWorkhorse from "#tests/runtime/support/fixtures/board-changes-reach-the-workhorse.json";
import boardPersistence from "#tests/runtime/support/fixtures/board-persistence.json";
import codeEvidence from "#tests/runtime/support/fixtures/code-evidence.json";
import durableWriteBoundary from "#tests/runtime/support/fixtures/durable-write-boundary.json";
import oneCommand from "#tests/runtime/support/fixtures/one-command.json";
import oneWriteLands from "#tests/runtime/support/fixtures/one-write-lands.json";
import readingABoard from "#tests/runtime/support/fixtures/reading-a-board-joins.json";
import theTwoThreads from "#tests/runtime/support/fixtures/the-two-threads.json";
import whatTheCliCanBeAsked from "#tests/runtime/support/fixtures/what-the-cli-can-be-asked.json";
import workhorseNews from "#tests/runtime/support/fixtures/workhorse-news.json";

/** The vocabulary of the fixtures, in the dogfood vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		service: { name: "Service", icon: "RiServerLine" },
		route: { name: "Route", icon: "RiRouteLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		ui: { name: "User interface", icon: "RiLayoutLine" },
		function: { name: "Function", icon: "RiCodeLine" },
		system: { name: "System", icon: "RiApps2Line" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		state: { name: "Server state", color: "teal" },
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		panes: { name: "Live panes", color: "teal" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		voice: { name: "Voice", color: "yellow" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
		agent: { name: "Agent", color: "fuchsia" },
		checks: { name: "Vault checks", color: "pink" },
	},
});

// These fixtures previously selected a winner among complete layout candidates.
// The graph now fixes that plan. The council judges its reading, while these
// tests retain the contract that each drawing preserves its meaning.
test.each([
	["One command", oneCommand, "track"],
	["One write lands", oneWriteLands, "track"],
	["Board persistence", boardPersistence, "track"],
	["Code evidence", codeEvidence, "track"],
	["Durable write boundary", durableWriteBoundary, "track"],
	["What the CLI can be asked", whatTheCliCanBeAsked, "blocks"],
	["Workhorse news", workhorseNews, "blocks"],
	["The two threads", theTwoThreads, "track"],
	["Reading a board", readingABoard, "blocks"],
	["Board changes reach the workhorse", boardChangesReachTheWorkhorse, "track"],
] as const)(
	"%s: one graph plan keeps every card, label, and route intact",
	async (_name, fixture, layout) => {
		const content = orderedFixture(fixture);
		const drawing = await renderArchitecture({ content, theme: "light", layout, policy });
		expectDrawingIntact(drawing, content, layout);
	},
);
