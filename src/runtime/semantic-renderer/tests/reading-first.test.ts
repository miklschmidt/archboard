// Choices between two whole layouts of a board rank them on how they read
// before how they fit the reference pane (ADR 0039), and the joins and the
// packing of a board's groups hold to the pick of their earlier weighing
// wherever that ranking's pick reads worse on some measure. What this
// catches: a choice going back to a score that lets a better fit buy a
// crossing or a bend, and a guarded choice taking a drawing that reads worse
// somewhere for crossings it saves, read off the named lines each moves.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import {
	corridorPoints,
	routesCross,
	sharedStretches,
	turnsOf,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import boardPersistence from "./board-persistence.json";
import durableWriteBoundary from "./durable-write-boundary.json";
import oneCommand from "./one-command.json";
import whatTheCliCanBeAsked from "./what-the-cli-can-be-asked.json";

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

/**
 * Every line of a fixture drawn by one engine, by relationship id.
 * @param fixture The fixture.
 * @param layout The engine.
 * @returns Each line's corridor.
 */
async function linesOf(fixture: unknown, layout: "track" | "blocks", levels = policy.levels) {
	const content = orderedFixture(fixture);
	const drawing = await renderArchitecture({
		content,
		theme: "light",
		layout,
		policy: { ...policy, levels },
	});
	return corridorPoints(drawing.svg);
}

// Taken from a board of this repository: its containers laid as Graphviz
// ranks them stood on a page 30 px shorter, and 'a typed message' turned
// three times round them; stacked, it turns once.
test("a board stacks its containers where its lines then turn less, on whatever page", async () => {
	const lines = await linesOf(oneCommand, "track");
	expect(turnsOf(lines.get("Qh7VZ9MQ")!)).toBeLessThanOrEqual(4);
});

// Taken from a board of this repository, with its vault's levels: whether its
// containers stack is weighed on each way as it would be taken, wrapped
// where a wrap is taken. Weighed whole, it took the other way, where 'take
// the new name's lease' turned round a block and crossed 'a migrated
// document', and the board crossed four lines more.
test("a board stacks its containers or not on each way at its best, wrapped or whole", async () => {
	const lines = await linesOf(boardPersistence, "track", ["system", "service", "module"]);
	expect(turnsOf(lines.get("8Let5OXd")!)).toBe(0);
	expect(routesCross(lines.get("8Let5OXd")!, lines.get("C0t1t0gb")!)).toBe(false);
});

// Taken from a board of this repository: drawn with its group packed, its
// page fit the pane better, its lines turned twelve times more, and 'take the
// new name's lease' crossed two lines out of Write under lease.
test("a board keeps its groups inline where packing them turns its lines more", async () => {
	const lines = await linesOf(durableWriteBoundary, "track");
	for (const id of ["E4f3pKJb", "EKOObsIQ"])
		expect(routesCross(lines.get("8Let5OXd")!, lines.get(id)!), id).toBe(false);
});

// Taken from a board of this repository: its joins kept whole the other way
// crossed fewer lines, and parted the two 'the drawn SVG' lines into
// Board client, one running up the other's column and jogging aside a lane
// short of the card, with 14% more line.
test("a join is kept whole as before where the other way reads worse somewhere", async () => {
	const lines = await linesOf(whatTheCliCanBeAsked, "blocks");
	const shared = sharedStretches(lines.get("W0x3eks9")!, lines.get("I2CofSP0")!);
	expect(Math.max(0, ...shared)).toBeGreaterThan(100);
});
