import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import parentReturn from "#tests/runtime/support/fixtures/parent-return.json";
import reservedCorner from "#tests/runtime/support/fixtures/reserved-label-corner.json";
import reservedLane from "#tests/runtime/support/fixtures/reserved-label-lane.json";
import archboardServer from "#tests/runtime/support/fixtures/archboard-server.json";
import oneCommandPath from "#tests/runtime/support/fixtures/one-command-path.json";
import { covering, overlaps } from "#tests/runtime/support/drawn-labels.ts";
import { labelsOffRuns } from "#tests/runtime/support/drawn-ink.ts";
import { drawnTexts } from "#tests/runtime/support/drawn-text.ts";
import {
	corridorPoints,
	distanceToRoute,
	routeCrosses,
	routeLabels,
	routePoints,
} from "#tests/runtime/support/drawn-routes.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** The room a line's words keep from a card: archboard_layout::constants::LABEL_CARD_CLEARANCE. */
const LABEL_CARD_CLEARANCE = 16;

/** The room one line's words keep from another's: archboard_layout::constants::LABEL_LABEL_CLEARANCE. */
const LABEL_LABEL_CLEARANCE = 24;

/** The room a badge keeps from a card and from the ends of its run. */
const AIR = LABEL_CARD_CLEARANCE;
/** The room a badge keeps from another badge. */
const LABEL_AIR = LABEL_LABEL_CLEARANCE;

test.each(
	LayoutEngineSchema.options.flatMap((layout) =>
		[false, true].map((nested) => [nested, layout] as const),
	),
)(
	"badges use their own clear runs with room from cards and other routes (nested: %s, %s)",
	async (nested, layout) => {
		const content = orderedFixture({
			nodes: [
				...(nested ? [{ id: "outer", name: "Worker system", kind: "service" }] : []),
				...["source", "first", "second", "third"].map((id) => ({
					id,
					name: id,
					kind: "service",
					parent: nested ? "outer" : undefined,
				})),
			],
			edges: [
				{ id: "e0", from: "source", to: "first", kind: "call", label: "dispatch work" },
				{ id: "e1", from: "source", to: "second", kind: "call", label: "accept request" },
				{ id: "e2", from: "source", to: "third", kind: "call", label: "accept request" },
			],
		});
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			layout,
		});
		const labels = routeLabels(drawing.svg);
		const routes = routePoints(drawing.svg);
		expect(labels.size).toBe(content.edges.length);
		expect(labelsOffRuns(drawing)).toEqual([]);
		const cards = Object.entries(drawing.atlas.nodes)
			.filter(([id]) => id !== "outer")
			.map(([, box]) => box);
		for (const [labelId, label] of labels) {
			for (const [id, route] of routes) {
				if (id === labelId) continue;
				expect(
					routeCrosses(route, {
						x: label.x - 12,
						y: label.y - 12,
						width: label.width + 24,
						height: label.height + 24,
					}),
				).toBe(false);
			}
			const others = [...labels].filter(([id]) => id !== labelId).map(([, box]) => box);
			for (const [box, air] of [
				...cards.map((card) => [card, AIR] as const),
				...others.map((other) => [other, LABEL_AIR] as const),
			]) {
				const xGap = Math.max(box.x - label.x - label.width, label.x - box.x - box.width);
				const yGap = Math.max(box.y - label.y - label.height, label.y - box.y - box.height);
				// Native placement and SVG serialization quantize coordinates to fractions
				// of a pixel; preserve the clearance contract within that precision.
				expect(Math.max(xGap, yGap)).toBeGreaterThanOrEqual(air - 0.05);
			}
			if (nested) {
				const frame = drawing.atlas.nodes["outer"]!;
				const headings = drawnTexts(drawing.svg).filter((text) => text.subject.id === "outer");
				expect(headings.length).toBeGreaterThan(0);
				expect(label.x).toBeGreaterThanOrEqual(frame.x + 24);
				for (const heading of headings) expect(label.y).toBeGreaterThanOrEqual(heading.y + 24);
				expect(label.x + label.width).toBeLessThanOrEqual(frame.x + frame.width - 24);
				expect(label.y + label.height).toBeLessThanOrEqual(frame.y + frame.height - 24);
			}
		}
		expect(
			await renderArchitecture({
				policy: DEFAULT_SEMANTIC_POLICY,
				content,
				theme: "light",
				layout,
			}),
		).toEqual(drawing);
	},
);

test("a long relationship's label remains within reach of its endpoints on a clear run", async () => {
	// A skip over two stages may have no clear endpoint-adjacent segment.
	// Its label must still remain within the span of the relationship.
	const content = orderedFixture({
		nodes: ["a", "b", "c", "d"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "ab", from: "a", to: "b", kind: "call" },
			{ id: "bc", from: "b", to: "c", kind: "call" },
			{ id: "cd", from: "c", to: "d", kind: "call" },
			{ id: "skip", from: "a", to: "d", kind: "data", label: "complete drawing" },
		],
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
	});
	const label = routeLabels(drawing.svg).get("skip")!;
	const centre = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
	const route = routePoints(drawing.svg).get("skip")!;
	const ends = [route[0]!, route.at(-1)!];
	const reach = Math.min(...ends.map((end) => Math.hypot(centre.x - end.x, centre.y - end.y)));
	const span = Math.hypot(ends[0]!.x - ends[1]!.x, ends[0]!.y - ends[1]!.y);
	expect(reach, "the label is not stranded beyond both endpoints").toBeLessThanOrEqual(span);
	expect(labelsOffRuns(drawing)).toEqual([]);
	expect(overlaps(drawing, content)).toEqual([]);
	expect(covering(drawing)).toEqual([]);
});

// Reduced from the Public ownership comparison: parallel retained and added
// relationships need an engine-reserved label just before a rounded corner.
test("reserved labels keep their whole straight run when a neighboring corner rounds", async () => {
	const content = orderedFixture(reservedCorner);
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
	});
	expect(labelsOffRuns(drawing)).toEqual([]);
});

// Reduced from Common-Weblib public-api-independent: fanning a shared vertical
// run left its label behind; moving only that label instead covered another route.
test("reserved labels follow their shared lanes without covering routes, cards or other labels", async () => {
	const content = orderedFixture(reservedLane);
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
	});
	expect(labelsOffRuns(drawing)).toEqual([]);
	expect(covering(drawing)).toEqual([]);
	expect(overlaps(drawing, content)).toEqual([]);
});

// Reduced from the dogfood vault: a channel grows for a line that turns in it
// anywhere across the block, so a label on a straight line far from that turn
// stood twice as far from one card as from the other.
test("a label on a straight line stands in the middle of the gap between its cards", async () => {
	const content = orderedFixture(oneCommandPath);
	const drawn = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "blocks",
	});
	const labels = routeLabels(drawn.svg);
	for (const id of ["kcqc65Ye", "EBy8Rjwh"]) {
		const edge = content.edges.find((one) => one.id === id)!;
		const [from, to] = [drawn.atlas.nodes[edge.from]!, drawn.atlas.nodes[edge.to]!];
		const label = labels.get(id)!;
		const above = label.y - (from.y + from.height);
		const below = to.y - (label.y + label.height);
		expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
	}
});

// Taken from a board of this repository: moved to the middle of its gap, the
// row holding 'one socket per page' ran into a channel where another line
// turns beside the row, and the label sat half a lane from that line.
test("a row of labels moves toward its gap's middle only as far as the lines turning there leave it a lane", async () => {
	const content = orderedFixture(archboardServer);
	const drawn = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const label = routeLabels(drawn.svg).get("ENymHNDK")!;
	const others = [...corridorPoints(drawn.svg)].filter(([id]) => id !== "ENymHNDK");
	const nearest = Math.min(...others.map(([, points]) => distanceToRoute(label, points)));
	expect(nearest).toBeGreaterThanOrEqual(16);
});

// A request enters a container and its child publishes the response. The
// container title orders its child, so both relationships form one cycle.
test("a response from a child keeps its label on the return route", async () => {
	const content = orderedFixture(parentReturn);
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	expect(labelsOffRuns(drawing)).toEqual([]);
});
