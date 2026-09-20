import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import reservedCorner from "./reserved-label-corner.json";
import reservedLane from "./reserved-label-lane.json";
import { covering, overlaps } from "@/runtime/semantic-renderer/tests/drawn-labels";
import { labelsOffRuns } from "@/runtime/semantic-renderer/tests/drawn-ink";
import { drawnTexts } from "@/runtime/semantic-renderer/tests/drawn-text";
import {
	routeCrosses,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { COMPOUND_OPTIONS } from "@/runtime/semantic-renderer/layout";

/** The room a badge keeps from a card and from the ends of its run. */
const AIR = Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]);
/** The room a badge keeps from another badge. */
const LABEL_AIR = Number(COMPOUND_OPTIONS["elk.spacing.labelLabel"]);

test.each([false, true])(
	"badges use their own clear runs with room from cards and other routes (nested: %s)",
	async (nested) => {
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
		const drawing = await renderArchitecture({ content, theme: "light" });
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
		expect(await renderArchitecture({ content, theme: "light" })).toEqual(drawing);
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
	const drawing = await renderArchitecture({ content, theme: "light" });
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
	const drawing = await renderArchitecture({ content, theme: "light" });
	expect(labelsOffRuns(drawing)).toEqual([]);
});

// Reduced from Common-Weblib public-api-independent: fanning a shared vertical
// run left its label behind; moving only that label instead covered another route.
test("reserved labels follow their shared lanes without covering routes, cards or other labels", async () => {
	const content = orderedFixture(reservedLane);
	const drawing = await renderArchitecture({ content, theme: "light" });
	expect(labelsOffRuns(drawing)).toEqual([]);
	expect(covering(drawing)).toEqual([]);
	expect(overlaps(drawing, content)).toEqual([]);
});
