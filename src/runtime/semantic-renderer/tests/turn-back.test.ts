// A line that steps aside past a label and back is closed onto one column
// where the label can move (`jogs.ts` `turnsBack`). What this catches: a
// labelled line that runs out one way to its label and back the other way to
// reach its card, since the step back was wider than a kink. Reduced from
// dogfood boards: in One write lands (Track) 'the holder changed' ran right to
// its label and back left into Live panes; in Command interface (Blocks)
// 'the stated board, doing and version' ran right past the region round
// Panes and back 40 px to pass it.
import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { cornersOf, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import commandInterface from "./command-interface.json";
import oneWriteLands from "./one-write-lands.json";

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		service: { name: "Service", icon: "RiServerLine" },
		route: { name: "Route", icon: "RiRouteLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		panes: { name: "Live panes", color: "teal" },
		checks: { name: "Vault checks", color: "pink" },
	},
});

/**
 * Whether a route runs sideways one way and later the other.
 * @param points The route.
 * @returns True when it turns back.
 */
function turnsBack(points: readonly { x: number; y: number }[]): boolean {
	const corners = cornersOf(points);
	const ways = corners
		.slice(1)
		.map((point, index) => Math.sign(point.x - corners[index]!.x))
		.filter((way) => way !== 0);
	return ways.some((way, index) => index > 0 && way !== ways[index - 1]);
}

const lines = [
	["One write lands", "track", oneWriteLands, "Ac9VTagz"],
	["Command interface", "blocks", commandInterface, "REIYPxdO"],
] as const;
test.each(lines)("%s: the %s engine runs a labelled line out and not back", async (...args) => {
	const [, layout, fixture, line] = args;
	const content = orderedFixture(fixture);
	const { svg } = await renderArchitecture({ content, theme: "light", policy, layout });
	expect(turnsBack(routePoints(svg).get(line)!)).toBeFalse();
});
