// Routing rules of the track router that change drawings of this repository,
// each owned by the lines it moves. What this catches: any of the rules below
// dropped or undone, read off the named lines rather than a whole-board score.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import {
	corridorPoints,
	routeLabels,
	routesCross,
	turnsOf,
} from "#tests/runtime/support/drawn-routes.ts";
import rendererLayout from "#tests/runtime/support/fixtures/renderer-layout.json";
import liveServerState from "#tests/runtime/support/fixtures/live-server-state.json";
import skillEvaluation from "#tests/runtime/support/fixtures/skill-evaluation.json";
import twinLines from "#tests/runtime/support/fixtures/twin-lines.json";
import workhorseNews from "#tests/runtime/support/fixtures/workhorse-news-track.json";
import workingWithAnAgent from "#tests/runtime/support/fixtures/working-with-an-agent.json";

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
		config: { name: "Config", icon: "RiSettings3Line" },
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
		grading: { name: "Grading", color: "amber" },
	},
});

/**
 * Every line of a fixture drawn by one engine, by relationship id.
 * @param fixture The fixture.
 * @param layout The engine.
 * @returns Each line's corridor.
 */
async function linesOf(fixture: unknown, layout: "track" | "blocks") {
	const content = orderedFixture(fixture);
	const drawing = await renderArchitecture({ content, theme: "light", layout, policy });
	return Object.assign(corridorPoints(drawing.svg), { labels: routeLabels(drawing.svg) });
}

// Taken from a board of this repository: 'route every relationship' from
// Layout engine drops straight into Obstacle routing once the jog routing
// left in it is closed again; without that it steps aside and back.
test("a jog is closed again once routing frees its column", async () => {
	const lines = await linesOf(rendererLayout, "track");
	expect(turnsOf(lines.get("Qvp9SqT5")!)).toBe(0);
});

// Two lines pass beside a frame their stations stand either side of; moved
// onto a column inside it, each stepped in and out of the frame.
test("a lane keeps the frames either station beside it stands in", async () => {
	const lines = await linesOf(twinLines, "track");
	for (const id of ["e5", "e8"]) expect(turnsOf(lines.get(id)!)).toBeLessThanOrEqual(4);
});

// Blocks straightens a lane onto the column its line runs on even where the
// straight lane crosses more than the stepped one: refused there, 'rasterize
// each picture' and 'photograph everything declared' each stepped twice, and
// the whole of Archboard server crossed 69 -> 90 times.
test("Blocks straightens a lane even where it crosses more", async () => {
	const lines = await linesOf(skillEvaluation, "blocks");
	for (const id of ["5TtCOktb", "b3s3lWZn"]) expect(turnsOf(lines.get(id)!), id).toBe(0);
});

// Blocks settles a label under the card above it before over the card below:
// the other way round, 'tell the panes on the board' stood off its line's
// column and the line stepped to reach it.
test("Blocks settles a label toward the station above it first", async () => {
	const lines = await linesOf(liveServerState, "blocks");
	const label = lines.labels.get("AjWTGwUA")!;
	const [start] = lines.get("AjWTGwUA")!;
	expect(Math.abs(label.x + label.width / 2 - start!.x)).toBeLessThanOrEqual(1);
});

// A lap round the drawing costs its run only where it sets the page's edge:
// charged everywhere, 'one per socket generation' kept off the page's edge
// and crossed two other lines into Workbench transport.
test("a lap costs its run only where it sets the page's edge", async () => {
	const lines = await linesOf(workingWithAnAgent, "blocks");
	for (const id of ["PuILGsjg", "kZtsu0nq"])
		expect(routesCross(lines.get("rcSUaP1b")!, lines.get(id)!)).toBeFalse();
});

// Pulling a leaving label down onto the line's lower end is kept only where
// the drawing reads no worse: taken on page size alone, 'answer the
// workhorse' stepped round the label row and across another line.
test("a leaving label is pulled down only where the drawing reads no worse", async () => {
	const lines = await linesOf(workhorseNews, "track");
	expect(routesCross(lines.get("5EeoHuyh")!, lines.get("yjIBH8F4")!)).toBeFalse();
});
