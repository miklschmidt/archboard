// How often the track engine's lines step sideways (visual polish): each test
// is a step a visual review found in real boards, reduced to a fixture. What
// this catches: a long line whose lanes no one column holds stepping in
// every channel it passes, a line stepped aside from another it joins at one
// port anyway, and a line that leaves a group region on a second track where
// the first one runs clear.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { corridorPoints, type DrawnPoint } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import onePointPort from "./one-point-port.json";
import doubleStep from "./double-step.json";
import staircase from "./staircase.json";
import walkthroughStair from "./walkthrough-stair.json";

/** The vocabulary the fixtures reduced from dogfood boards draw with, its groups in the vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeSSlashLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		ui: { name: "User interface", icon: "RiLayoutLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		drawing: { name: "Drawing", color: "violet" },
		panes: { name: "Live panes", color: "teal" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		voice: { name: "Voice", color: "yellow" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
	},
});

/**
 * The heights a drawn route runs sideways at.
 * @param points The route's corridor, hops taken out.
 * @returns Each distinct height.
 */
function sidewaysLevels(points: readonly DrawnPoint[]): Set<number> {
	return new Set(
		points
			.slice(1)
			.filter((point, index) => point.y === points[index]!.y && point.x !== points[index]!.x)
			.map(({ y }) => y),
	);
}

// Reduced from a dogfood board: a long line's lanes drift a little from band
// to band where Graphviz drew it, no one column was free for all of them, and
// each lane kept its own x, so the line stepped in almost every channel.
test("a long line no one column holds takes as few columns as hold it", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(staircase),
		theme: "light",
		layout: "track",
		policy,
	});
	for (const [id, points] of corridorPoints(drawing.svg))
		expect(sidewaysLevels(points).size, id).toBeLessThanOrEqual(4);
});

// Reduced from a dogfood board: two lines leave a group region through its one
// port, one of them straight down into it. Read as two lines lined up end to
// end, the other was stepped a lane aside just before the port they share,
// where they are drawn joined anyway.
test("a line into a port another line drops into is not stepped aside from it", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(onePointPort),
		theme: "light",
		layout: "track",
		policy,
	});
	const points = corridorPoints(drawing.svg).get("mxl6bmYW")!;
	expect(sidewaysLevels(points).size).toBeLessThanOrEqual(2);
});

// Reduced from a dogfood board: a line leaves a group region for a card far
// below it. Its lanes were held to the region Graphviz drew the first one in,
// so the line stepped down to a second track in the same empty channel
// before running on outside the region.
test("a line leaving a group region runs on the track it is already on", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(walkthroughStair),
		theme: "light",
		layout: "track",
		policy,
	});
	const points = corridorPoints(drawing.svg).get("P1XYQl8l")!;
	expect(sidewaysLevels(points).size).toBeLessThanOrEqual(1);
});

// Reduced from a dogfood board: a line's lanes stood on three columns, the
// middle one meeting neither the lane above it nor the one below, so the line
// stepped sideways twice in two channels where one step would do.
test("a line steps once where one step joins the columns above and below", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(doubleStep),
		theme: "light",
		layout: "track",
		policy,
	});
	const points = corridorPoints(drawing.svg).get("UubWA3xG")!;
	expect(sidewaysLevels(points).size).toBeLessThanOrEqual(2);
});
