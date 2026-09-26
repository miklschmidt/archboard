// Where the track engine stands a card sideways (TASK-349). What this
// catches: a chain of one-in, one-out cards stepping sideways rank by rank,
// its lines leaving and entering its cards off centre; a fan whose wrap
// lowers a group region whole refused, so the region stands on a row of its
// own above the fan's other cards; a card fed by a fan standing off its
// middle, so the fan's lines land unevenly on it; and a wrap standing a card
// in a line's way, or away from the port its one line leaves; and the label
// of a line leaving a container standing beside it, where the card the line
// leads into follows it out past the container's wall.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { routeLabels, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import loweredRegion from "./lowered-region.json";
import underPort from "./under-port.json";
import skillEvaluation from "./skill-evaluation.json";
import wrappedBlocker from "./wrapped-blocker.json";

const WORDS = "alpha bravo delta eagle falcon garden harbor island jungle kettle lantern meadow";

/**
 * A card's centre across the page.
 * @param box The card's box.
 * @param box.x Its left edge.
 * @param box.width Its width.
 * @returns Its centre.
 */
function centre({ x, width }: { x: number; width: number }): number {
	return x + width / 2;
}

// Reduced from a real operations board, names replaced: a chain pulled right
// at its head by a line back into it and left at its foot by a wide fan.
test("a chain between a pull and a fan stands on one column", async () => {
	const chain = ["c0", "c1", "c2", "c3", "c4"];
	const fan = ["f0", "f1", "f2", "f3"];
	const content = orderedFixture({
		nodes: [...chain, ...fan, "f4", "alone"].map((id) => ({
			id,
			name: `Part ${id}`,
			kind: "service",
			responsibility: WORDS,
		})),
		edges: [
			...chain.slice(1).map((to, index) => ({
				id: `c${index}`,
				from: chain[index]!,
				to,
				kind: "data",
				label: `hand over ${index}`,
			})),
			...fan.map((to, index) => ({
				id: `f${index}`,
				from: "c4",
				to,
				kind: "dependency",
				label: `start stage ${index}`,
			})),
			{ id: "on", from: "f1", to: "f4", kind: "data", label: "next stage" },
			{ id: "back", from: "f3", to: "c2", kind: "data", label: "stop and plan again" },
		],
	});
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track" });
	const centres = chain.map((id) => centre(drawing.atlas.nodes[id]!));
	for (const at of centres) expect(Math.abs(at - centres[0]!)).toBeLessThan(1);
});

/**
 * Whether two boxes share some height, side by side.
 * @param one A box.
 * @param one.y Its top.
 * @param one.height Its height.
 * @param other Another.
 * @param other.y Its top.
 * @param other.height Its height.
 * @returns True when they do.
 */
function beside(one: { y: number; height: number }, other: { y: number; height: number }): boolean {
	return one.y < other.y + other.height && other.y < one.y + one.height;
}

// Reduced from a board of this repository, names replaced: a hub fans out to
// four cards and to two cards of one group region, one of which a line from
// above also enters.
test("a wrapped fan stands a group region beside its other cards", async () => {
	const policy = SemanticPolicySchema.parse({
		levels: ["service"],
		nodeKinds: { module: { name: "Module", icon: "RiBox3Line" } },
		relationshipKinds: {
			call: { name: "Call", dash: "solid", arrowhead: "filled" },
			uses: { name: "Uses", dash: "dotted", arrowhead: "open" },
		},
		groups: {
			inner: { name: "Inner", color: "indigo" },
			outer: { name: "Outer", color: "yellow" },
		},
	});
	const content = orderedFixture(loweredRegion);
	const drawing = await renderArchitecture({ content, theme: "light", policy, layout: "track" });
	const [members, others] = [
		["n5", "n6"],
		["n2", "n3", "n4", "n7"],
	].map((ids) => ids.map((id) => drawing.atlas.nodes[id]!));
	expect(members!.some((member) => others!.some((other) => beside(member, other)))).toBe(true);
});

// Reduced from a real hosting board, names replaced: two mirrored pairs of
// servers, each pair feeding one database through labelled lines. Graphviz
// left one database anywhere between its two servers.
test("a card two cards of one rank feed stands midway under them", async () => {
	const feeds = { da: ["v0", "v1"], db: ["v2", "v3"] };
	const content = orderedFixture({
		nodes: ["v0", "v1", "v2", "v3", "da", "db"].map((id) => ({
			id,
			name: `Part ${id}`,
			kind: "service",
			responsibility: "legacy work",
		})),
		edges: Object.entries(feeds).flatMap(([to, from]) =>
			from.map((one) => ({
				id: `${one}${to}`,
				from: one,
				to,
				kind: "data",
				label: "Database connection",
			})),
		),
	});
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track" });
	for (const [to, from] of Object.entries(feeds)) {
		const [one, other] = from.map((id) => centre(drawing.atlas.nodes[id]!));
		expect(Math.abs(centre(drawing.atlas.nodes[to]!) - (one! + other!) / 2)).toBeLessThan(1);
	}
});

/** The vocabulary the reduced wrap fixtures draw with. */
const wrapPolicy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: Object.fromEntries(
		["module", "function", "service", "external"].map((kind) => [
			kind,
			{ name: kind, icon: "RiBox3Line" },
		]),
	),
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
	},
	groups: { inner: { name: "Inner", color: "purple" } },
});

/**
 * Whether a drawn line runs straight down, with no bend.
 * @param svg The drawing.
 * @param id The line.
 * @returns True when every point of it stands on one column.
 */
function dropsStraight(svg: string, id: string): boolean {
	const points = routePoints(svg).get(id)!;
	return points.every((point) => Math.abs(point.x - points[0]!.x) < 0.5);
}

// Reduced from a board of this repository, names replaced: a wrap stood a
// card with no line of its own to either end in the column between a card
// and the card its line drops to, and the line stepped around it.
test("a wrapped card stands aside from a line that drops straight past it", async () => {
	const content = orderedFixture(wrappedBlocker);
	const drawing = await renderArchitecture({
		content,
		theme: "light",
		policy: wrapPolicy,
		layout: "track",
	});
	expect(dropsStraight(drawing.svg, "e6")).toBe(true);
});

// Taken from a board of this repository: a wrapped card stepped out of its
// column to open one for a line past it, but that line's label still turned
// it round the next card, so the step bought nothing and cost the column.
test("a wrapped card keeps its column where stepping aside straightens no line", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(skillEvaluation),
		theme: "light",
		policy: wrapPolicy,
		layout: "track",
	});
	const [card, above] = [drawing.atlas.nodes["7LcGoxWH"]!, drawing.atlas.nodes["PEfE7dCL"]!];
	expect(card.x + card.width / 2).toBeCloseTo(above.x + above.width / 2, 0);
});

// Reduced from a board of this repository, names replaced: two cards below a
// group region, each with one line from inside it, were wrapped under
// unrelated cards, and both lines stepped across to them.
test("a wrapped card whose one line leaves a region stands under it", async () => {
	const content = orderedFixture(underPort);
	const drawing = await renderArchitecture({
		content,
		theme: "light",
		policy: wrapPolicy,
		layout: "track",
	});
	for (const id of ["e3", "e6"]) expect(dropsStraight(drawing.svg, id), id).toBe(true);
});

// Two chained cards in a container, both with a labelled line to a card below
// it: the first line's label stood beside the container on the second card's
// rank, and the card below followed it out past the container's wall.
test("a line leaving a container stands its label below the container", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "lib", name: "Shared library", kind: "system", responsibility: "One shared release" },
			{
				id: "a",
				name: "Customer behaviour",
				kind: "module",
				parent: "lib",
				responsibility: "Public contract rules live inside the monolith",
			},
			{
				id: "b",
				name: "Ambient glue",
				kind: "module",
				parent: "lib",
				responsibility: "Caches, auth and logging create implicit runtime dependencies",
			},
			{ id: "x", name: "Data library", kind: "module", responsibility: "Generated model" },
		],
		edges: [
			{ id: "ab", from: "a", to: "b", kind: "call", label: "uses ambient helpers" },
			{ id: "ax", from: "a", to: "x", kind: "call", label: "uses generated model" },
			{ id: "bx", from: "b", to: "x", kind: "call", label: "reads the model too" },
		],
	});
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track" });
	const frame = drawing.atlas.nodes["lib"]!;
	const label = routeLabels(drawing.svg).get("ax")!;
	expect(label.y).toBeGreaterThanOrEqual(frame.y + frame.height);
});
