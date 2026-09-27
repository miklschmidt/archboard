// Measures of boards of this repository that one routing rule each keeps
// down (visual polish). Each rule changes these drawings, and with it left
// out the drawing reads worse by the measure named: more bends, or more
// crossings. What this catches: any of the rules below dropped or undone.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { scorecardOf } from "@/runtime/semantic-renderer/tests/drawn-scorecard";
import archboardServer from "./archboard-server.json";
import commandInterface from "./command-interface.json";
import shortStep from "./short-step.json";
import twinLines from "./twin-lines.json";
import workhorseNews from "./workhorse-news.json";
import workingWithAnAgent from "./working-with-an-agent.json";

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

/** One rule's owner: the board, the engine, the measure it keeps down, and how far. */
type Owner = readonly [
	rule: string,
	fixture: unknown,
	layout: "track" | "blocks",
	measure: "bends per route" | "crossings",
	most: number,
];

test.each<Owner>([
	["jogs are closed again once lines are parted", archboardServer, "track", "bends per route", 2.7],
	[
		"a lane keeps the frames either station beside it stands in",
		twinLines,
		"track",
		"bends per route",
		2.5,
	],
	[
		"Blocks straightens a lane even where it crosses more",
		archboardServer,
		"blocks",
		"crossings",
		122,
	],
	[
		"Blocks settles a label toward the station above it first",
		shortStep,
		"blocks",
		"bends per route",
		1.3,
	],
	[
		"a lap costs its run only where it sets the page's edge",
		workingWithAnAgent,
		"blocks",
		"crossings",
		1,
	],
	[
		"a pin's line in a block of cards leaves where the block turned it",
		commandInterface,
		"track",
		"bends per route",
		2.55,
	],
	[
		"a leaving label is pulled down only where the drawing reads no worse",
		workhorseNews,
		"track",
		"crossings",
		0,
	],
])("%s (%#)", async (_, fixture, layout, measure, most) => {
	const content = orderedFixture(fixture);
	const drawing = await renderArchitecture({ content, theme: "light", layout, policy });
	const measured = scorecardOf(drawing, content).find(({ name }) => name === measure)!;
	expect(measured.value).toBeLessThanOrEqual(most);
});
