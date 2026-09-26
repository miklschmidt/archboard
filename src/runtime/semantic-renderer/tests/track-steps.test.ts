// How often the track engine's lines step sideways (visual polish): each test
// is a step a visual review found in real boards, reduced to a fixture. What
// this catches: a long line whose lanes no one column holds stepping in
// every channel it passes.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { corridorPoints, type DrawnPoint } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import staircase from "./staircase.json";

/** The vocabulary the fixtures reduced from dogfood boards draw with, its groups in the vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeSSlashLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
	},
	groups: {
		drawing: { name: "Drawing", color: "violet" },
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
