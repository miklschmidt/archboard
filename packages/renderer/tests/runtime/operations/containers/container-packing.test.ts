import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import { CONTAINER_INSET } from "#shared/constants/spacing.ts";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { measureArchitecture } from "#runtime/operations/measure.ts";
import { routePoints } from "#tests/runtime/support/drawn-routes.ts";
import { labelsOffRuns, routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

// Track still pads a container whose cards fan out below it wider than its
// insets, so that case holds on Blocks alone.
test.each([
	...LayoutEngineSchema.options.flatMap((layout) => [
		{ count: 2, fan: 0, layout },
		{ count: 10, fan: 0, layout },
	]),
	{ count: 10, fan: 14, layout: "blocks" as const },
])(
	"$count independent cards and $fan fanned keep compact insets ($layout)",
	async ({ count, fan, layout }) => {
		const content = orderedFixture({
			nodes: [
				{ id: "pool", name: "Application pool", kind: "service" },
				...Array.from({ length: count }, (_, index) => ({
					id: `app${index}`,
					name: `Application ${index}`,
					kind: "module",
					parent: "pool",
				})),
				...Array.from({ length: fan }, (_, index) => ({
					id: `fan${index}`,
					name: `Fan ${index}`,
					kind: "module",
				})),
			],
			edges: Array.from({ length: fan }, (_, index) => ({
				id: `edge${index}`,
				from: "pool",
				to: `fan${index}`,
				kind: "call",
			})),
		});
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			layout,
		});
		expect(drawing.readingDirection).toBe("down");
		const frame = drawing.atlas.nodes["pool"]!;
		const cards = content.nodes
			.filter(({ parent }) => parent === "pool")
			.map(({ id }) => drawing.atlas.nodes[id]!);
		if (count === 10) {
			expect(new Set(cards.map(({ x }) => x)).size).toBeGreaterThan(1);
			expect(new Set(cards.map(({ y }) => y)).size).toBeGreaterThan(1);
		}
		const left = Math.min(...cards.map(({ x }) => x)) - frame.x;
		const right = frame.x + frame.width - Math.max(...cards.map(({ x, width }) => x + width));
		const bottom = frame.y + frame.height - Math.max(...cards.map(({ y, height }) => y + height));
		expect(left).toBe(CONTAINER_INSET);
		expect(right).toBe(left);
		expect(bottom).toBe(left);
		// The cards stand as far under the header as in from the sides.
		const header = measureArchitecture(content).nodes.get("pool")!.headerHeight;
		expect(Math.min(...cards.map(({ y }) => y)) - frame.y).toBe(header + CONTAINER_INSET);
	},
);

test("external dependencies follow their contained sources beneath the frame", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "db1", name: "Database one", kind: "datastore" },
			{ id: "db2", name: "Database two", kind: "datastore" },
			{ id: "bundle", name: "Deployment bundle", kind: "service" },
			{ id: "gateway", name: "Gateway", kind: "service" },
			{ id: "pool", name: "Service pool", kind: "service" },
			{ id: "first", name: "First instance", kind: "service", parent: "pool" },
			{ id: "second", name: "Second instance", kind: "service", parent: "pool" },
		],
		edges: [
			{ id: "e0", from: "first", to: "db1", kind: "data", label: "Database connection" },
			{ id: "e1", from: "second", to: "db2", kind: "data", label: "Database connection" },
			{
				id: "e2",
				from: "gateway",
				to: "pool",
				kind: "call",
				label: "Balances directly across healthy VMs",
			},
			{
				id: "e3",
				from: "pool",
				to: "bundle",
				kind: "dependency",
				label: "Same deployment repeated ×4",
			},
		],
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
	});
	const frame = drawing.atlas.nodes["pool"]!;
	const childIds = new Set(
		content.nodes.filter(({ parent }) => parent === "pool").map(({ id }) => id),
	);
	const routes = routePoints(drawing.svg);
	const departures = content.edges.filter(({ from }) => childIds.has(from));
	const points = departures.map(({ id }) => routes.get(id)!);
	const internal = points
		.flat()
		.filter(
			({ x, y }) =>
				x > frame.x && x < frame.x + frame.width && y > frame.y && y < frame.y + frame.height,
		);
	// A straight departure can cross the entire bottom inset without leaving
	// a waypoint there. Include its intersection with the frame's bottom.
	const crossedBottom = points.some((route) =>
		route.some((from, index) => {
			const to = route[index + 1];
			if (to === undefined || to.y === from.y) return false;
			const at = (frame.y + frame.height - from.y) / (to.y - from.y);
			const x = from.x + at * (to.x - from.x);
			return at >= 0 && at <= 1 && x > frame.x && x < frame.x + frame.width;
		}),
	);
	const bottom = Math.max(
		...internal.map(({ y }) => y),
		...(crossedBottom ? [frame.y + frame.height] : []),
		...content.nodes
			.filter(({ parent }) => parent === "pool")
			.map(({ id }) => {
				const box = drawing.atlas.nodes[id]!;
				return box.y + box.height;
			}),
	);
	// Label-sized tracks used to add 79px below all content. The 24px frame
	// inset plus an ordinary routing track should fit inside twice the inset.
	expect(drawing.readingDirection).toBe("down");
	expect(frame.y + frame.height - bottom).toBeLessThanOrEqual(48);
	for (const edge of departures) {
		const target = drawing.atlas.nodes[edge.to]!;
		const center = target.x + target.width / 2;
		expect(center).toBeGreaterThanOrEqual(frame.x);
		expect(center).toBeLessThanOrEqual(frame.x + frame.width);
		expect(target.y).toBeGreaterThan(frame.y + frame.height);
	}
	expect(routesThroughCards(drawing, content)).toEqual([]);
	expect(labelsOffRuns(drawing)).toEqual([]);
});
