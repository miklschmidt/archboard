// Where lines that come onto a card's face from beyond one end of it arrive
// (visual polish). Each such line turns onto the face anyway; packed a lane
// apart at the face's corner, their arrowheads read as one line forking.
// What this catches: two lines reaching a card from the same side whose
// arrowheads stand a lane apart on its face.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { corridorPoints, type DrawnPoint } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import workingWithAnAgent from "./working-with-an-agent.json";

/** The room two arrowheads on one face need to read as two lines. */
const APART = 24;

/** The vocabulary of the fixture, in the dogfood vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		service: { name: "Service", icon: "RiServerLine" },
		route: { name: "Route", icon: "RiRouteLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		ui: { name: "User interface", icon: "RiLayoutLine" },
		system: { name: "System", icon: "RiApps2Line" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
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
		voice: { name: "Voice", color: "yellow" },
		agent: { name: "Agent", color: "fuchsia" },
	},
});

/**
 * Where a route arrives and which side its last turn comes from.
 * @param points The route's points, source to target.
 * @returns The arrival point and the side: -1 from the left, 1 from the right, 0 straight.
 */
function arrival(points: readonly DrawnPoint[]): { end: DrawnPoint; side: number } {
	const end = points.at(-1)!;
	const turn = points.findLast(({ x }) => Math.abs(x - end.x) > 0.5);
	return { end, side: turn === undefined ? 0 : Math.sign(turn.x - end.x) };
}

// Taken from a dogfood board: "the pane's agent and media state" and "one per
// socket generation" both come onto Workbench transport from its right, and
// their arrowheads stood a lane apart near its top-right corner.
test("lines onto one card face from beyond one end arrive apart", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(workingWithAnAgent),
		theme: "light",
		layout: "track",
		policy,
	});
	const routes = corridorPoints(drawing.svg);
	const [one, other] = [arrival(routes.get("DTRtWKab")!), arrival(routes.get("rcSUaP1b")!)];
	// Both turn onto the card's top face from the same side.
	expect(one.side).not.toBe(0);
	expect(other.side).toBe(one.side);
	expect(other.end.y).toBeCloseTo(one.end.y, 0);
	expect(Math.abs(one.end.x - other.end.x)).toBeGreaterThanOrEqual(APART);
});
