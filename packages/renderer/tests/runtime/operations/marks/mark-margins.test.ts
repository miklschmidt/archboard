// A corner mark keeps the page's margin (visual polish). What this catches: a
// standing pin or warning badge on a subject at the page's top or left edge
// reaching into the margin, so the drawing stands nearer the top and left of
// its page than the right and bottom, because the page was fitted to the
// subjects and not to the marks on their corners.

import { expect, test } from "bun:test";
import { renderArchitecture, renderSemanticView } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { bodyShift } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/**
 * How near the page's top and left edges any pin reaches, and how much room
 * the page keeps right of and below its subjects.
 * @param drawing The drawing.
 * @returns The pins' nearest reach to the left and top edges, and the right and bottom margins.
 */
function margins(drawing: RenderedDiagram): {
	left: number;
	top: number;
	right: number;
	bottom: number;
} {
	const shift = bodyShift(drawing.svg);
	const pins = [
		...drawing.svg.matchAll(/<g transform="translate\(([\d.]+),([\d.]+)\)"><circle r="([\d.]+)"/g),
	].map(([, x, y, r]) => ({
		x: shift.x + Number(x) - Number(r),
		y: shift.y + Number(y) - Number(r),
	}));
	// No pin found would leave nothing to measure, and every margin met.
	expect(pins.length).toBeGreaterThan(0);
	const boxes = [...Object.values(drawing.atlas.nodes), ...Object.values(drawing.atlas.regions)];
	return {
		left: Math.min(...pins.map(({ x }) => x)),
		top: Math.min(...pins.map(({ y }) => y)),
		right: drawing.width - Math.max(...boxes.map(({ x, width }) => x + width)),
		bottom: drawing.height - Math.max(...boxes.map(({ y, height }) => y + height)),
	};
}

test("a pin on a subject at the page's edge keeps the page's margin", async () => {
	const architecture = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture({
			nodes: [
				{ id: "a", name: "Board store", kind: "module" },
				{ id: "b", name: "Change feed", kind: "module" },
			],
			edges: [{ id: "ab", from: "a", to: "b", kind: "call" }],
		}),
		layout: "track",
		standing: { a: "added" },
	});
	const sequence = await renderSemanticView({
		grammar: "sequence",
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture({
			nodes: [
				{ id: "web", name: "Operator Console", kind: "ui" },
				{ id: "io", name: "board-io", kind: "module" },
			],
			edges: [],
			flows: [
				{
					id: "f1",
					name: "Agent edit",
					participants: ["web", "io"],
					steps: [{ id: "s1", from: "web", to: "io", label: "edit", kind: "sync" }],
				},
			],
		}),
		standing: { f1: "changed" },
	});
	for (const drawing of [architecture, sequence]) {
		const { left, top, right, bottom } = margins(drawing);
		expect(left).toBeGreaterThanOrEqual(right - 1);
		expect(top).toBeGreaterThanOrEqual(bottom - 1);
	}
});
