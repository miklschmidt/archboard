// Every chooser ADR 0039 changed takes the layout that reads better only
// where its earlier weighing agrees or that layout reads no worse anywhere,
// and the choosers left on their earlier weighing keep it. What this
// catches, read off the named lines each choice moves: a chooser going back
// to its earlier weighing alone and losing a drawing that reads better
// everywhere; a chooser taking a drawing that reads worse somewhere for
// crossings it saves; and a clause of an earlier weighing dropped.

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
import boardChangesReachTheWorkhorse from "./board-changes-reach-the-workhorse.json";
import boardPersistence from "./board-persistence.json";
import durableWriteBoundary from "./durable-write-boundary.json";
import oneCommand from "./one-command.json";
import oneWriteLands from "./one-write-lands.json";
import readingABoard from "./reading-a-board-joins.json";
import theTwoThreads from "./the-two-threads.json";
import whatTheCliCanBeAsked from "./what-the-cli-can-be-asked.json";
import workhorseNews from "./workhorse-news.json";

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

// Taken from a board of this repository: stacked, its containers stood on a
// page with four bends fewer and no more line, but 'announce the accepted
// write' ran down the page's right edge past every card, a lane beside 'what
// the writer said it was doing'. A line lapping round a block past every
// card counts as a crossing, so the containers stand as Graphviz ranks them.
test("a board keeps its containers as ranked where stacking them sends a line round the page", async () => {
	const content = orderedFixture(oneWriteLands);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const right = Math.max(...Object.values(drawing.atlas.nodes).map(({ x, width }) => x + width));
	const announce = corridorPoints(drawing.svg).get("9wogU6N3")!;
	expect(Math.max(...announce.map(({ x }) => x))).toBeLessThan(right);
});

// Taken from a board of this repository, with its vault's levels: on how
// its blocks read alone, its containers took the other way, which drew the
// board on a page half again as wide with twice the crossings, where 'take
// the new name's lease' turned round a block and crossed 'a migrated
// document'. Stacking keeps its earlier pick where the other reads worse
// somewhere.
test("a board stacks its containers or not as before where the other way reads worse somewhere", async () => {
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

// Taken from a board of this repository: its joins weighed on their
// crossings alone, each crossing once however many lines a trunk carries,
// 'start the realtime leg' and 'turn/start on the coordinator thread' ran
// together on one long stroke into Codex session, 500 px down and back up,
// and both crossed 'the user's changes, focus and selection'. A crossing
// costs half as much again for each line through it past the first.
test("a join is kept whole the way whose trunks cross fewer lines they carry", async () => {
	const lines = await linesOf(workhorseNews, "blocks");
	for (const id of ["eRYh0zYO", "kdzh3hrY"])
		expect(routesCross(lines.get(id)!, lines.get("wyliCZzQ")!), id).toBe(false);
});

// Taken from a board of this repository: with its groups packed, it scored
// higher on a page that fit the pane better, but drew more line, and
// 'thread/queue/add, update, reorder, delete, start' turned twice more
// and crossed 'delegate, steer, inspect, queue' and 'workhorse notifications,
// tell_coordinator calls'. A board packs its groups only on no more line.
test("a board keeps its groups inline where packing them draws more line", async () => {
	const lines = await linesOf(theTwoThreads, "track");
	for (const id of ["mhknqBOz", "NztvEtjX"])
		expect(routesCross(lines.get("b9HU99hH")!, lines.get(id)!), id).toBe(false);
});

// Taken from a board of this repository: weighed as before ADR 0039, its
// joins were kept whole the way where 'the pane socket: registration and
// news' turned four times and 'one stage per pane' three. The other way
// turns them twice and once and reads no worse anywhere, so it is taken.
// Its blocks pack two ways that score alike, and the first tried stepped
// 'one stage per pane' down beside 'a board's new version': a tie goes to
// the smaller page.
test("a join is kept whole the way that reads better where it reads no worse anywhere", async () => {
	const lines = await linesOf(readingABoard, "blocks");
	expect(turnsOf(lines.get("PuILGsjg")!)).toBeLessThanOrEqual(4);
	expect(turnsOf(lines.get("VbLQ6rfX")!)).toBeLessThanOrEqual(2);
});

// Taken from a board of this repository: weighed as before ADR 0039, its
// groups were laid the way where 'thread/inject_items into the workhorse'
// turned four times. The other way turns it twice and reads no worse
// anywhere, so it is taken.
test("a board's groups are laid the way that reads better where it reads no worse anywhere", async () => {
	const lines = await linesOf(boardChangesReachTheWorkhorse, "track");
	expect(turnsOf(lines.get("8g1SNngD")!)).toBeLessThanOrEqual(4);
});
