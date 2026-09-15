import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { drawnTexts } from "@/runtime/semantic-renderer/tests/drawn-text";
import {
	routeCrosses,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

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
		const horizontal = labels.get("e2")!;
		const points = routes.get("e2")!;
		for (const [id, route] of routes) {
			const axes = route.slice(1).flatMap((point, index) => {
				const from = route[index]!;
				return from.x === point.x ? ["vertical"] : from.y === point.y ? ["horizontal"] : [];
			});
			const bends = axes.filter((axis, index) => index > 0 && axis !== axes[index - 1]).length;
			expect(bends).toBe(id === "e0" ? 0 : 2);
		}
		expect(labels.size).toBe(content.edges.length);
		// The badge sits on one straight run of its own route, 24 clear of that
		// run's ends, on whichever axis lies nearest an end of the route
		// (docs/design/layout-rules.md, TASK-232).
		expect(
			points.some((from, index) => {
				const to = points[index + 1];
				if (to === undefined) return false;
				const onHorizontal =
					from.y === to.y &&
					Math.abs(from.y - horizontal.y - horizontal.height / 2) < 0.02 &&
					Math.min(from.x, to.x) + 24 <= horizontal.x &&
					Math.max(from.x, to.x) - 24 >= horizontal.x + horizontal.width;
				const onVertical =
					from.x === to.x &&
					Math.abs(from.x - horizontal.x - horizontal.width / 2) < 0.02 &&
					Math.min(from.y, to.y) + 24 <= horizontal.y &&
					Math.max(from.y, to.y) - 24 >= horizontal.y + horizontal.height;
				return onHorizontal || onVertical;
			}),
		).toBe(true);
		for (const id of ["e0"]) {
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
			if (id !== "e2")
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
		for (const box of [
			...cards,
			...[...labels].filter(([id]) => id !== "e2").map(([, label]) => label),
		]) {
			const xGap = Math.max(
				box.x - horizontal.x - horizontal.width,
				horizontal.x - box.x - box.width,
			);
			const yGap = Math.max(
				box.y - horizontal.y - horizontal.height,
				horizontal.y - box.y - box.height,
			);
			expect(Math.max(xGap, yGap)).toBeGreaterThanOrEqual(24);
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
