// Each choice between two whole layouts of a board ranks them on how they
// read before how they fit the reference pane (ADR 0039): its crossings,
// each on a corner or in a stack one more; the line unrelated lines draw on
// one stroke or side by side; its hooks and touching lines; its bends; its
// line; and only then its fit. What this catches: any of those choices going
// back to a score that lets a better fit buy a crossing or a bend, read off
// the named lines each choice moves.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import {
	corridorPoints,
	routesCross,
	turnsOf,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import boardPersistence from "./board-persistence.json";
import durableWriteBoundary from "./durable-write-boundary.json";
import oneBrowserTwoUses from "./one-browser-two-uses.json";
import oneCommand from "./one-command.json";
import theTwoThreads from "./the-two-threads.json";

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
async function linesOf(fixture: unknown, layout: "track" | "blocks") {
	const content = orderedFixture(fixture);
	const drawing = await renderArchitecture({ content, theme: "light", layout, policy });
	return corridorPoints(drawing.svg);
}

// Taken from a board of this repository: its containers laid as Graphviz
// ranks them stood on a page 30 px shorter, and 'a typed message' turned
// three times round them; stacked, it turns once.
test("a board stacks its containers where its lines then turn less, on whatever page", async () => {
	const lines = await linesOf(oneCommand, "track");
	expect(turnsOf(lines.get("Qh7VZ9MQ")!)).toBeLessThanOrEqual(4);
});

// Taken from a board of this repository: left unsettled, its ports stood on
// a page 36 px shorter, and 'launch, a 1920x1080 window, stop' stepped aside
// on its way down; settled, it drops straight.
test("a block settles its ports where its lines then run round less, on whatever page", async () => {
	const lines = await linesOf(oneBrowserTwoUses, "blocks");
	expect(turnsOf(lines.get("BN01aJai")!)).toBe(0);
});

// Taken from a board of this repository: its lines settled and not ran round
// its blocks within a fraction of a crossing's worth of each other, and that
// sliver decided before the lines' bends did: 'submit transition', 'rename
// transition' and 'discard a whole board' each turned once more, on a page
// 64 px taller.
test("lines that run round a block within a sliver of each other are weighed on their bends", async () => {
	const lines = await linesOf(boardPersistence, "blocks");
	for (const id of ["s73zYKpi", "smLdyKlp", "wyTy54Ob"])
		expect(turnsOf(lines.get(id)!), id).toBeLessThanOrEqual(8);
});

// Taken from a board of this repository: drawn with its group packed, its
// page fit the pane better, its lines turned twelve times more, and 'take the
// new name's lease' crossed two lines out of Write under lease.
test("a board keeps its groups inline where packing them turns its lines more", async () => {
	const lines = await linesOf(durableWriteBoundary, "track");
	for (const id of ["E4f3pKJb", "EKOObsIQ"])
		expect(routesCross(lines.get("8Let5OXd")!, lines.get(id)!), id).toBe(false);
});

// Taken from a board of this repository: ranked on fit less a share per
// crossing, its joins were kept whole the other way, and 'workhorse
// notifications, tell_coordinator calls' turned on its way and crossed 'news
// as a coordinator turn/start'.
test("a join is kept whole the way whose lines cross less, on whatever page", async () => {
	const lines = await linesOf(theTwoThreads, "blocks");
	expect(turnsOf(lines.get("NztvEtjX")!)).toBe(0);
	expect(routesCross(lines.get("NztvEtjX")!, lines.get("biUWQZMB")!)).toBe(false);
});
