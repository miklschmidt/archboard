// A line that leaves a container by its wall, drawn straight from its card's
// side where nothing stands between (walls.ts). What this catches: a line
// that leaves its card by the bottom and hooks under the card's corner to
// reach the wall, and two lines from one side standing a lane apart, which
// the container's parent then runs the long way round.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { corridorPoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import ingressStages from "./ingress-stages.json";
import requestPath from "./request-path.json";

/** The vocabulary of the two reduced fixtures. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: Object.fromEntries(
		["service", "route", "external", "system", "module"].map((kind) => [
			kind,
			{ name: kind, icon: "RiServerLine" },
		]),
	),
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
	},
});

/**
 * How many times a route turns.
 * @param points The route's corridor.
 * @returns Its corners.
 */
function turns(points: readonly { x: number; y: number }[]): number {
	return points.slice(1, -1).filter((point, index) => {
		const [before, after] = [points[index]!, points[index + 2]!];
		const straight =
			(before.x === point.x && point.x === after.x) ||
			(before.y === point.y && point.y === after.y);
		return !straight;
	}).length;
}

// Reduced from a board of a work vault, names replaced: a line out of a
// container by its wall left its card by the bottom and ran along the
// channel under it, a hook under the card's corner, although nothing stood
// between the card's side and the wall.
test("a line out of a container by its wall leaves its card's side when nothing stands between", async () => {
	const content = orderedFixture(requestPath);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const card = drawn.atlas.nodes["JnkTz8V4"]!;
	const [start] = corridorPoints(drawn.svg).get("FOrXU78u")!;
	expect(start!.x).toBeCloseTo(card.x + card.width, 0);
	expect(start!.y).toBeLessThan(card.y + card.height);
});

// Reduced from a board of a work vault, letters replaced: a card sends two
// lines out of one wall of its cluster. Drawn straight from its side, a lane
// apart, the board chose to stand their labels under the card and ran both
// lines down and round through the next stage, turning a dozen times more.
test("two lines out of one side of a card keep to the tracks", async () => {
	const content = orderedFixture(ingressStages);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const corners = [...corridorPoints(drawn.svg).values()].reduce(
		(sum, points) => sum + turns(points),
		0,
	);
	expect(corners).toBeLessThan(50);
});
