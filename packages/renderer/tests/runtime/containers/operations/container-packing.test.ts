import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { headerFoot } from "#tests/runtime/support/drawn-subjects.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";

/** The room a container keeps round its members: archboard_layout::constants::CONTAINER_INSET. */
const CONTAINER_INSET = 20;

test.each([
	{ count: 2, fan: 0 },
	{ count: 10, fan: 0 },
	{ count: 10, fan: 14 },
])(
	"$count independent cards and $fan fanned keep room for measured cards and reserved fan channels",
	async ({ count, fan }) => {
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
			policy: defaultSemanticPolicy(),
			content,
			theme: "light",
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
		if (fan > 0) {
			expectDrawingIntact(drawing, content);
			expect(left).toBeGreaterThanOrEqual(CONTAINER_INSET);
			expect(right).toBeGreaterThanOrEqual(CONTAINER_INSET);
			expect(bottom).toBeGreaterThanOrEqual(CONTAINER_INSET);
			return;
		}
		expect(left).toBe(CONTAINER_INSET);
		expect(right).toBe(left);
		expect(bottom).toBe(left);
		// The cards stand as far under the header as in from the sides.
		expect(Math.min(...cards.map(({ y }) => y))).toBeCloseTo(
			headerFoot(drawing.svg, "pool") + CONTAINER_INSET,
			1,
		);
	},
);
