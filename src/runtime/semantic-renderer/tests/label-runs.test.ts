import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
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
	"badges use clear horizontal runs and retain vertical fallbacks (nested: %s)",
	async (nested) => {
		const content = VariantContentSchema.parse({
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
		// The source sits over one of its three children, whichever the engine's
		// placement centres it on: that route is straight and the other two bend
		// twice. The straight one carries its label on a vertical run below.
		const bendsOf = new Map(
			[...routes].map(([id, route]) => {
				const axes = route.slice(1).flatMap((point, index) => {
					const from = route[index]!;
					return from.x === point.x ? ["vertical"] : from.y === point.y ? ["horizontal"] : [];
				});
				return [id, axes.filter((axis, index) => index > 0 && axis !== axes[index - 1]).length];
			}),
		);
		const straight = [...bendsOf].filter(([, bends]) => bends === 0).map(([id]) => id);
		expect(straight).toHaveLength(1);
		for (const [id, bends] of bendsOf) if (id !== straight[0]) expect(bends).toBe(2);
		const bent = content.edges.map((edge) => edge.id).filter((id) => id !== straight[0]);
		const horizontal = labels.get(bent[1]!)!;
		const points = routes.get(bent[1]!)!;
		expect(labels.size).toBe(content.edges.length);
		// The badge sits on one straight run of its own route, the label air clear of that
		// run's ends, on whichever axis lies nearest an end of the route
		// (docs/design/layout-rules.md, TASK-232).
		expect(
			points.some((from, index) => {
				const to = points[index + 1];
				if (to === undefined) return false;
				const onHorizontal =
					from.y === to.y &&
					Math.abs(from.y - horizontal.y - horizontal.height / 2) < 0.02 &&
					Math.min(from.x, to.x) + AIR <= horizontal.x &&
					Math.max(from.x, to.x) - AIR >= horizontal.x + horizontal.width;
				const onVertical =
					from.x === to.x &&
					Math.abs(from.x - horizontal.x - horizontal.width / 2) < 0.02 &&
					Math.min(from.y, to.y) + AIR <= horizontal.y &&
					Math.max(from.y, to.y) - AIR >= horizontal.y + horizontal.height;
				return onHorizontal || onVertical;
			}),
		).toBe(true);
		for (const id of straight) {
			const label = labels.get(id)!;
			expect(
				routes.get(id)!.some((from, index, route) => {
					const to = route[index + 1];
					return (
						to !== undefined &&
						from.x === to.x &&
						Math.abs(from.x - label.x - label.width / 2) < 0.02 &&
						Math.min(from.y, to.y) <= label.y &&
						Math.max(from.y, to.y) >= label.y + label.height
					);
				}),
			).toBe(true);
		}
		for (const [id, route] of routes) {
			if (id !== bent[1])
				expect(
					routeCrosses(route, {
						x: horizontal.x - 12,
						y: horizontal.y - 12,
						width: horizontal.width + 24,
						height: horizontal.height + 24,
					}),
				).toBe(false);
		}
		const cards = Object.entries(drawing.atlas.nodes)
			.filter(([id]) => id !== "outer")
			.map(([, box]) => box);
		const others = [...labels].filter(([id]) => id !== bent[1]).map(([, label]) => label);
		for (const [box, air] of [
			...cards.map((card) => [card, AIR] as const),
			...others.map((label) => [label, LABEL_AIR] as const),
		]) {
			const xGap = Math.max(
				box.x - horizontal.x - horizontal.width,
				horizontal.x - box.x - box.width,
			);
			const yGap = Math.max(
				box.y - horizontal.y - horizontal.height,
				horizontal.y - box.y - box.height,
			);
			expect(Math.max(xGap, yGap)).toBeGreaterThanOrEqual(air);
		}
		if (nested) {
			const frame = drawing.atlas.nodes["outer"]!;
			const headings = drawnTexts(drawing.svg).filter((text) => text.subject.id === "outer");
			expect(headings.length).toBeGreaterThan(0);
			expect(horizontal.x).toBeGreaterThanOrEqual(frame.x + 24);
			for (const heading of headings) expect(horizontal.y).toBeGreaterThanOrEqual(heading.y + 24);
			expect(horizontal.x + horizontal.width).toBeLessThanOrEqual(frame.x + frame.width - 24);
			expect(horizontal.y + horizontal.height).toBeLessThanOrEqual(frame.y + frame.height - 24);
		}
		expect(await renderArchitecture({ content, theme: "light" })).toEqual(drawing);
	},
);

test("a long relationship's label sits on the run nearest an endpoint that can hold it, not on the longest run", async () => {
	// A skip over two stages: its route has a short departure beside the source,
	// a long middle run and a short arrival. A reader tracing the line from
	// either card should meet the words before the middle of the page.
	const content = VariantContentSchema.parse({
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
	expect(reach, "the label is nearer an end than the middle of its route").toBeLessThan(span / 2);
	expect(reach, "within a lane and a clearance of the nearer card").toBeLessThanOrEqual(150);
});

// Reduced from the Public ownership comparison: parallel retained and added
// relationships need an engine-reserved label just before a rounded corner.
test("reserved labels keep their whole straight run when a neighboring corner rounds", async () => {
	const content = VariantContentSchema.parse(reservedCorner);
	const drawing = await renderArchitecture({ content, theme: "light" });
	expect(labelsOffRuns(drawing)).toEqual([]);
});

// Reduced from Common-Weblib public-api-independent: fanning a shared vertical
// run left its label behind; moving only that label instead covered another route.
test("reserved labels follow their shared lanes without covering routes, cards or other labels", async () => {
	const content = VariantContentSchema.parse(reservedLane);
	const drawing = await renderArchitecture({ content, theme: "light" });
	expect(labelsOffRuns(drawing)).toEqual([]);
	expect(covering(drawing)).toEqual([]);
	expect(overlaps(drawing, content)).toEqual([]);
});
