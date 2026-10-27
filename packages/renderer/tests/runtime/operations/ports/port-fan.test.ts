import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { corridorPoints } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import workingWithAnAgent from "#tests/runtime/support/fixtures/working-with-an-agent.json";

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
	const [one, other] = [routes.get("DTRtWKab")!.at(-1)!, routes.get("rcSUaP1b")!.at(-1)!];
	// Packing can change the arrival faces. The arrowheads must remain distinct.
	expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThanOrEqual(APART);
});
