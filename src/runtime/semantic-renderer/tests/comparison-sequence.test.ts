// With its comparison off, a sequence draws each flow as the draft's own view
// holds it, and every participant and message it keeps stands where it stands
// with the comparison.

import { expect, test } from "bun:test";

import { bothModes, expectSamePlaces } from "@/runtime/semantic-renderer/tests/comparison-modes";
import { routeEnds } from "@/runtime/semantic-renderer/tests/drawn-routes";

test("turning the comparison off moves no participant or message of a sequence", async () => {
	const nodes = [
		{ id: "web", name: "Console", kind: "ui" },
		{ id: "api", name: "Orders API", kind: "service" },
		{ id: "old", name: "Legacy cache", kind: "database" },
		{ id: "store", name: "Order store", kind: "database" },
	];
	const steps = [
		{ id: "s1", from: "web", to: "api", label: "place order", kind: "sync" },
		{ id: "s2", from: "api", to: "old", label: "read cache", kind: "sync" },
		{ id: "s3", from: "api", to: "store", label: "write order", kind: "sync" },
		{ id: "s4", from: "api", to: "web", label: "placed", kind: "return" },
	];
	const flow = { id: "f1", name: "Place an order", participants: ["web", "api", "old", "store"] };
	// A participant's box covers its column in every flow, so the flow the draft
	// drops has none it keeps.
	const gone = { id: "f2", name: "Warm the cache", participants: ["old"] };
	const warm = [{ id: "s5", from: "old", to: "old", label: "warm", kind: "self" }];
	const drawings = await bothModes(
		{
			nodes,
			edges: [],
			flows: [
				{ ...flow, steps },
				{ ...gone, steps: warm },
			],
		},
		{
			nodes: nodes.filter(({ id }) => id !== "old"),
			edges: [],
			flows: [
				{
					...flow,
					participants: ["web", "api", "store"],
					steps: steps.filter(({ id }) => id !== "s2"),
				},
			],
		},
		{ view: { grammar: "data-flow" } },
	);
	expectSamePlaces(drawings, ["old", "s2", "f2", "s5"]);
	expect(routeEnds(drawings.plain.svg, "step")).toEqual(
		new Map(
			[...routeEnds(drawings.compared.svg, "step")].filter(([id]) => !["s2", "s5"].includes(id)),
		),
	);
});

/**
 * How many lifelines the store draws.
 * @param svg The picture.
 * @returns The count.
 */
function storeColumns(svg: string): number {
	return (
		svg.match(
			/data-semantic-part="lifeline"[^>]*data-semantic-id="store"|data-semantic-id="store"[^>]*data-semantic-part="lifeline"/gu,
		)?.length ?? 0
	);
}

test("a participant the draft keeps as a node but drops from a flow has no column there", async () => {
	const nodes = [
		{ id: "web", name: "Console", kind: "ui" },
		{ id: "api", name: "Orders API", kind: "service" },
		{ id: "store", name: "Order store", kind: "database" },
	];
	const place = { id: "s1", from: "web", to: "api", label: "place", kind: "sync" };
	const write = { id: "s2", from: "api", to: "store", label: "write", kind: "sync" };
	const flow = { id: "f1", name: "Place an order" };
	const drawings = await bothModes(
		{
			nodes,
			edges: [],
			flows: [{ ...flow, participants: ["web", "api", "store"], steps: [place, write] }],
		},
		{ nodes, edges: [], flows: [{ ...flow, participants: ["web", "api"], steps: [place] }] },
		{ view: { grammar: "data-flow" } },
	);
	expectSamePlaces(drawings, ["store", write.id]);
	// Another flow that keeps the participant keeps its column there.
	const read = { id: "t1", from: "api", to: "store", label: "read", kind: "sync" };
	const reads = { id: "f2", name: "Read an order", participants: ["api", "store"], steps: [read] };
	const both = await bothModes(
		{
			nodes,
			edges: [],
			flows: [{ ...flow, participants: ["web", "api", "store"], steps: [place, write] }, reads],
		},
		{
			nodes,
			edges: [],
			flows: [{ ...flow, participants: ["web", "api"], steps: [place] }, reads],
		},
		{ view: { grammar: "data-flow" } },
	);
	expect(storeColumns(both.compared.svg)).toBe(2);
	expect(storeColumns(both.plain.svg)).toBe(1);
});

/**
 * The activation bars one participant's column draws, each read from its
 * selection trace: one per bar, over the bar's own box.
 * @param svg The rendered document.
 * @param id The participant.
 * @returns Each bar's trace, in order.
 */
function barsOf(svg: string, id: string): string[] {
	const column = new RegExp(
		`<g(?=[^>]*data-semantic-id="${id}")(?=[^>]*data-semantic-part="lifeline")[^>]*>([\\s\\S]*?)</g>`,
	).exec(svg);
	return [...(column?.[1] ?? "").matchAll(/<rect class="ab-halo"[^>]*>/g)].map(([rect]) => rect);
}

test("a column draws no bar only messages the draft drops open or hold", async () => {
	const nodes = [
		{ id: "web", name: "Console", kind: "service" },
		{ id: "api", name: "Orders API", kind: "service" },
		{ id: "db", name: "Order store", kind: "database" },
	];
	const steps = [
		{ id: "s1", from: "web", to: "api", label: "place", kind: "sync" },
		{ id: "s2", from: "api", to: "db", label: "write", kind: "sync" },
		{ id: "s3", from: "db", to: "api", label: "ok", kind: "return" },
		{ id: "s4", from: "api", to: "db", label: "read", kind: "sync" },
		{ id: "s5", from: "db", to: "api", label: "row", kind: "return" },
		{ id: "s6", from: "api", to: "web", label: "done", kind: "return" },
	];
	const flow = { id: "f1", name: "Place an order", participants: ["web", "api", "db"] };
	const without = (dropped: readonly string[]) =>
		bothModes(
			{ nodes, edges: [], flows: [{ ...flow, steps }] },
			{
				nodes,
				edges: [],
				flows: [{ ...flow, steps: steps.filter(({ id }) => !dropped.includes(id)) }],
			},
			{ view: { grammar: "data-flow" } },
		);
	// The draft drops the write and its answer: the store's bar for them goes.
	const write = await without(["s2", "s3"]);
	expect(barsOf(write.compared.svg, "db")).toHaveLength(2);
	expect(barsOf(write.plain.svg, "db")).toEqual(barsOf(write.compared.svg, "db").slice(1));
	expect(barsOf(write.plain.svg, "api")).toEqual(barsOf(write.compared.svg, "api"));
	// The draft drops the read and keeps its answer, which still leaves the store's bar.
	const read = await without(["s4"]);
	expect(barsOf(read.plain.svg, "db")).toEqual(barsOf(read.compared.svg, "db"));
});
