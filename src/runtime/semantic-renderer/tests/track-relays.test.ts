// How the track engine lays a line again through the drawing, and where its
// label box may stand (visual polish): each test is a defect a visual review
// found in real boards, reduced to a fixture. What this catches: a line into
// a card inside a frame run round the outside of another card because it was
// kept out of the frame it ends in, and a labelled line run out to the edge
// of the drawing and back because its label's band had room only there, and
// a line into a group region run out beside the region to its label and back,
// and two lines into one block whose ports Graphviz stood beside the block's
// header drawn end to end a few points apart, so that they read as one.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@archboard/board/policy";
import {
	corridorPoints,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import frameDrop from "./frame-drop.json";
import labelBand from "./label-band.json";
import regionLabel from "./region-label.json";
import stackedPorts from "./stacked-ports.json";

/** The spacing of neighbouring lanes. */
const LANE = 16;

/** The vocabulary the fixtures reduced from dogfood boards draw with, its groups in the vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		service: { name: "Service", icon: "RiServerLine", color: "blue" },
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeSSlashLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		voice: { name: "Voice", color: "yellow" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
	},
});

// Reduced from a dogfood board, names replaced: Graphviz ran a line past its
// target frame's title row outside the frame, and the relay kept every lane
// out of the frame, so the line ran round a card beside the frame and back
// in, where it could drop into the frame through its title row.
test("a line into a frame drops into it rather than round what stands beside it", async () => {
	const content = orderedFixture(frameDrop);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const edge = content.edges.find(({ id }) => id === "FDMYhJSq")!;
	const target = content.nodes.find(({ id }) => id === edge.to)!;
	expectBetween(drawing, edge.id, [edge.from, target.parent!]);
});

// Reduced from a real board, names replaced: Graphviz ranked a label on a
// band of cards whose only free slot was at the drawing's left edge, and the
// line ran out there and back although the bands above and below held room
// for the label on the line's own column.
test("a labelled line keeps between its ends when another band holds its label", async () => {
	const content = orderedFixture(labelBand);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const edge = content.edges.find(({ id }) => id === "Wa0ROBSq")!;
	expectBetween(drawing, edge.id, [edge.from, edge.to]);
});

// Reduced from a dogfood board, names replaced: Graphviz stood the label of a
// line into a group region beside the region, the relay's first route in
// crossed a label that only later moved aside, and the line's run out to its
// label and back was no lap by the reach of its ends.
test("a line into a group region keeps its label between its ends", async () => {
	const content = orderedFixture(regionLabel);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const edge = content.edges.find(({ id }) => id === "i6pk24Ov")!;
	const ends = [drawing.atlas.nodes[edge.from]!, drawing.atlas.nodes[edge.to]!];
	const label = routeLabels(drawing.svg).get(edge.id)!;
	expect(label.x).toBeGreaterThanOrEqual(Math.min(...ends.map(({ x }) => x)));
	expect(label.x + label.width).toBeLessThanOrEqual(
		Math.max(...ends.map(({ x, width }) => x + width)),
	);
});

// Reduced from a dogfood board, names replaced: two lines entered a group
// region's block by top ports Graphviz stood right of the block's header,
// far from the lines' labels; nothing moved the ports, and one line's drop off
// its port stood end to end with the other's drop into its label.
test("lines into a block by its own ports never stand end to end", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(stackedPorts),
		theme: "light",
		layout: "track",
		policy,
	});
	const uprights = [...corridorPoints(drawing.svg)].flatMap(([id, points]) =>
		points.slice(1).flatMap((end, index) => {
			const start = points[index]!;
			const upright = start.x === end.x && Math.abs(start.y - end.y) > 0.5;
			return upright
				? [{ id, x: end.x, top: Math.min(start.y, end.y), bottom: Math.max(start.y, end.y) }]
				: [];
		}),
	);
	for (const one of uprights)
		for (const other of uprights.filter(({ id }) => id !== one.id)) {
			const gap = other.top - one.bottom;
			// A trunk's lines share one column exactly; a few points apart is two lines.
			const apart = Math.abs(one.x - other.x);
			const lined = apart >= 0.5 && apart < LANE / 2 && gap > 0 && gap <= 3 * LANE;
			expect(lined, `${one.id} runs on into ${other.id}`).toBe(false);
		}
});

/**
 * Expect a line's every point to stand between the left and right edges of
 * some boxes: its ends, or what holds them.
 * @param drawing The rendered board.
 * @param id The line.
 * @param between The ids whose boxes bound it.
 */
function expectBetween(
	drawing: Awaited<ReturnType<typeof renderArchitecture>>,
	id: string,
	between: readonly string[],
): void {
	const boxes = between.map((one) => drawing.atlas.nodes[one]!);
	const low = Math.min(...boxes.map(({ x }) => x));
	const high = Math.max(...boxes.map(({ x, width }) => x + width));
	for (const { x } of routePoints(drawing.svg).get(id)!)
		expect(x >= low && x <= high, `${x} outside ${low}..${high}`).toBe(true);
}
