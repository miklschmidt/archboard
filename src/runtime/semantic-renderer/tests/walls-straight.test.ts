// A line that leaves a container by its wall, drawn straight from its card's
// side where nothing stands between (walls.ts). What this catches: a line
// that leaves its card by the bottom and hooks under the card's corner to
// reach the wall, and two lines from one side standing a lane apart, which
// the container's parent then runs the long way round.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	corridorPoints,
	routeCrosses,
	routePoints,
	turnsOf,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
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
	// The two lines out of Floeo Btla Pstetineo's side of its container.
	const routes = corridorPoints(drawn.svg);
	for (const id of ["HH8tp1yP", "0j05s9wR"])
		expect(turnsOf(routes.get(id)!), id).toBeLessThanOrEqual(4);
});

// Reduced from a board of a work vault, names replaced: the line into the
// region's load balancer is joined from pieces routed in two blocks, and
// where they met it ran down past the region's wall and back up to its card.
// Once the drawing is joined, the loop is taken out (blocks/steps.ts), clear
// of every card.
test("a joined line runs on into its container without the loop its pieces made", async () => {
	const content = orderedFixture(requestPath);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	// Three rounded corners, two turning points each; the loop made seven.
	expect(turnsOf(corridorPoints(drawn.svg).get("f3lzoqzb")!)).toBeLessThanOrEqual(6);
	const route = routePoints(drawn.svg).get("f3lzoqzb")!;
	const passed = ["8P3HctR4", "ZsN5eHIV", "RsdfAtQ8", "JnkTz8V4", "WLY9p0FT"];
	for (const id of passed) expect(routeCrosses(route, drawn.atlas.nodes[id]!)).toBeFalse();
});
