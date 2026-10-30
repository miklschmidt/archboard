// The shapes of a flowchart (ADR 0053): a decision's diamond, a loop's hexagon
// and the terminals. They are blocks as the cards are, and what a card keeps
// they keep.
//
// What is guarded: every line that meets a shape ends on the outline the shape
// is drawn with (the layout moves the line and the painter draws the shape, and
// a shape drawn another way than its lines expect leaves each of its lines short
// of it or inside it); a line meets a diamond at one of its points, as the
// layout would otherwise spread the lines along its slanted sides; the words
// stand centred and inside the shape; and the
// standing, the warning and the shadow of a step stay on the shape and say what
// they say on a card.

import { describe, expect, test } from "bun:test";
import { renderSemanticView } from "#runtime/operations/render.ts";
import type { VariantContent } from "@archboard/board/content";
import {
	distanceToOutline,
	drawnLines,
	outlineOf,
	pointsOf,
	type At,
} from "#tests/runtime/support/drawn-flowchart.ts";
import { drawnTexts } from "#tests/runtime/support/drawn-text.ts";
import {
	groupOf,
	markShape,
	strokesOf,
	type DrawnGroup,
} from "#tests/runtime/support/drawn-subjects.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** A decision whose question wraps onto two lines, and a loop, between steps. */
const FLOW: VariantContent = orderedFixture({
	nodes: [
		{ id: "pane", name: "Browser pane", kind: "ui" },
		{ id: "gate", name: "Browser gateway", kind: "service" },
		{ id: "run", name: "Codex session", kind: "service" },
	],
	flows: [
		{
			id: "f1",
			name: "One command",
			participants: ["pane", "gate", "run"],
			steps: [
				{ id: "s1", from: "pane", to: "gate", label: "start a command", kind: "sync" },
				{
					id: "d1",
					kind: "decision",
					question: "Does the pane hold the lease, on a link that stands?",
					alternatives: [
						{
							label: "refused",
							steps: [{ id: "s2", from: "gate", to: "pane", label: "no", kind: "return" }],
						},
						{
							label: "admitted",
							steps: [
								{
									id: "l1",
									kind: "loop",
									condition: "until the workhorse is idle, or its time is up",
									steps: [{ id: "s3", from: "gate", to: "run", label: "read", kind: "sync" }],
								},
							],
						},
					],
				},
				{ id: "s4", from: "gate", to: "pane", label: "delivered", kind: "return" },
			],
		},
	],
});

/**
 * The flow drawn as a flowchart.
 * @param request What else the picture is told.
 * @param request.standing How the steps stand.
 * @param request.unsettled Which steps nobody has decided.
 * @returns The picture.
 */
function drawn(request: {
	standing?: Record<string, "added" | "removed" | "changed">;
	unsettled?: string[];
}) {
	return renderSemanticView({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: FLOW,
		grammar: "flowchart",
		theme: "light",
		...request,
	});
}

/**
 * One step's group of a picture.
 * @param svg The drawn document.
 * @param id The step.
 * @returns The group.
 */
function stepOf(svg: string, id: string): DrawnGroup {
	const group = groupOf(svg, "step", id);
	expect(group, `step ${id} was not drawn`).toBeDefined();
	return group!;
}

/**
 * Where every line of the picture starts and ends.
 * @param svg The drawn document.
 * @returns The ends of the lines, on the page.
 */
function lineEnds(svg: string): At[] {
	return drawnLines(svg).flatMap((points) => [points[0]!, points.at(-1)!]);
}

/**
 * Whether a point is inside a convex outline whose corners run clockwise.
 * @param outline The outline's corners, in order.
 * @param point The point.
 * @returns True when it is inside, or on the outline.
 */
function isInside(outline: readonly At[], point: At): boolean {
	return outline.every((from, index) => {
		const to = outline[(index + 1) % outline.length]!;
		return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x) >= -0.01;
	});
}

/** How near a line's end may be to the outline it meets: an arrowhead's tip is a little past it. */
const MEETING = 2.5;
/** How far from an outline a line's end is still meeting it, and not passing by. */
const NEAR = 12;

/** The two shapes a step takes that are not a box, by the step's id. */
const SHAPES = [
	["d1", "diamond"],
	["l1", "hexagon"],
] as const;

describe("a flowchart's lines meet its shapes", () => {
	for (const [id, name] of SHAPES) {
		test(`on the outline of the ${name}`, async () => {
			const { svg } = await drawn({});
			const outline = outlineOf(svg, id);
			const meeting = lineEnds(svg).filter((end) => distanceToOutline(outline, end) < NEAR);
			// The line in, and a line out for each answer, or for repeating and being done.
			expect(meeting.length).toBeGreaterThanOrEqual(3);
			for (const end of meeting) expect(distanceToOutline(outline, end)).toBeLessThan(MEETING);
		});
	}

	test("at the points of the diamond, never on a slanted side", async () => {
		const { svg } = await drawn({});
		const outline = outlineOf(svg, "d1");
		const xs = outline.map(({ x }) => x);
		const ys = outline.map(({ y }) => y);
		const centre = {
			x: (Math.min(...xs) + Math.max(...xs)) / 2,
			y: (Math.min(...ys) + Math.max(...ys)) / 2,
		};
		const meeting = lineEnds(svg).filter((end) => distanceToOutline(outline, end) < NEAR);
		expect(meeting.length).toBeGreaterThanOrEqual(3);
		for (const end of meeting) {
			const atPoint = Math.abs(end.x - centre.x) < 0.5 || Math.abs(end.y - centre.y) < 0.5;
			expect(atPoint, `a line meets the diamond at ${end.x}, ${end.y}`).toBe(true);
		}
	});
});

describe("the words of a shape", () => {
	for (const [id, name] of SHAPES) {
		test(`stand centred in the ${name} and inside it`, async () => {
			const { svg } = await drawn({});
			const outline = outlineOf(svg, id);
			const left = Math.min(...outline.map((corner) => corner.x));
			const right = Math.max(...outline.map((corner) => corner.x));
			const lines = drawnTexts(svg).filter((text) => text.subject.id === id);
			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) {
				expect(line.x + line.width / 2).toBeCloseTo((left + right) / 2, 1);
				// Both ends of the line, at its top and at its foot.
				for (const y of [line.y - line.size * 0.75, line.y + line.size * 0.25]) {
					expect(isInside(outline, { x: line.x, y })).toBe(true);
					expect(isInside(outline, { x: line.x + line.width, y })).toBe(true);
				}
			}
		});
	}
});

describe("a step's shape in a proposal", () => {
	test("wears its standing as a card does: a border on its face, and a pin on its outline", async () => {
		const { svg } = await drawn({ standing: { d1: "added", l1: "changed" } });
		const added = stepOf(svg, "d1");
		const changed = stepOf(svg, "l1");
		expect(added.standing).toBe("added");
		// A step stroked only with its selection ring wears a border once a standing gives it one.
		const ring = strokesOf(stepOf((await drawn({ standing: { l1: "changed" } })).svg, "d1"));
		expect(strokesOf(added).length).toBeGreaterThan(ring.length);
		expect(strokesOf(added).every((stroke) => stroke.dash === undefined)).toBe(true);
		// A change is dashed where an addition is solid.
		expect(strokesOf(changed).some((stroke) => stroke.dash !== undefined)).toBe(true);
		expect(ring.some((stroke) => stroke.dash !== undefined)).toBe(false);
		expect(markShape(added)).not.toBe(markShape(changed));
		expect(markShape(stepOf(svg, "s1"))).toBeUndefined();
		// The pin stands on the diamond's outline, not off in the corner of its box.
		const pin = /translate\(([-\d.]+),([-\d.]+)\)"><circle/.exec(added.markup)!;
		const [at] = pointsOf(svg, `${pin[1]} ${pin[2]}`);
		expect(distanceToOutline(outlineOf(svg, "d1"), at!)).toBeLessThan(1);
	});

	test("shows a removed step as a see-through footprint that has lost its thickness", async () => {
		const { svg } = await drawn({ standing: { d1: "removed" } });
		const gone = stepOf(svg, "d1");
		expect(gone.opacity).toBeUndefined();
		expect(strokesOf(gone).some((stroke) => stroke.dash !== undefined)).toBe(true);
		// The gold a block's face is made of is not drawn on a ghost.
		expect(gone.markup).not.toContain("ab-flow-gold");
		expect(stepOf(svg, "l1").markup).toContain("ab-flow-gold");
	});

	test("wears the warning of an undecided step, and nothing else does", async () => {
		const { svg } = await drawn({ unsettled: ["d1"] });
		expect(stepOf(svg, "d1").markup).toContain("--warning");
		expect(stepOf(svg, "l1").markup).not.toContain("--warning");
	});
});

describe("the shadow of a step's shape", () => {
	test("lies under every line and card, and lists its step", async () => {
		const { svg } = await drawn({});
		for (const [id] of SHAPES) {
			const shadow = svg.indexOf(`class="ab-shadow" data-members="${id}"`);
			expect(shadow, `shadow of ${id}`).toBeGreaterThan(-1);
			// Before the shape is drawn, so it never lies on its face or a neighbour's.
			expect(shadow).toBeLessThan(svg.indexOf(`data-semantic-id="${id}"`));
			expect(stepOf(svg, id).markup).not.toContain("ab-shadow");
		}
	});
});
