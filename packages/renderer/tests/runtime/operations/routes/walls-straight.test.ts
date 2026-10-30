// A line that leaves a container by its wall, drawn straight from its card's
// side where nothing stands between (crates/archboard-layout/src/blocks/walls.rs). What this catches: a line
// that leaves its card by the bottom and hooks under the card's corner to
// reach the wall.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import {
	corridorPoints,
	routeCrosses,
	routePoints,
	turnsOf,
} from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import requestPath from "#tests/runtime/support/fixtures/request-path.json";

/** The vocabulary of the reduced fixture. */
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
// between the card's side and the wall. Wherever the stores stand, the line
// leaves its card by the face toward them.
test("a line out of a container by its wall leaves its card's side when nothing stands between", async () => {
	const content = orderedFixture(requestPath);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const [card, stores] = [drawn.atlas.nodes["JnkTz8V4"]!, drawn.atlas.nodes["WLY9p0FT"]!];
	const [start] = corridorPoints(drawn.svg).get("FOrXU78u")!;
	const [right, bottom] = [card.x + card.width, card.y + card.height];
	const byBottom = Math.abs(start!.y - bottom) < 1;
	expect(byBottom || Math.abs(start!.x - right) < 1).toBeTrue();
	if (byBottom) expect(stores.y).toBeGreaterThan(bottom);
	else expect(stores.x).toBeGreaterThan(right);
});

// Reduced from a board of a work vault, names replaced: the line into the
// region's load balancer is joined from pieces routed in two blocks, and
// where they met it ran down past the region's wall and back up to its card.
// Once the drawing is joined, the loop is taken out (crates/archboard-layout/src/blocks/steps.rs), clear
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
