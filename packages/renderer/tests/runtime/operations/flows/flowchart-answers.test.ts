// A decision's answers leave it from separate points (TASK-491): left and
// right, and the bottom for a third. Each line leaves sideways, stays beside
// the diamond down to its words, and takes the side that crosses no line.
//
// What is guarded: where each answer starts and how it runs out of its
// point, that no answer steps back under its diamond above its words, and
// that a loop's line back up does not cross an answer.

import { describe, expect, test } from "bun:test";
import { renderSemanticView } from "#runtime/operations/render.ts";
import type { VariantContent } from "@archboard/board/content";
import {
	distanceToOutline,
	drawnLines,
	outlineOf,
	type At,
} from "#tests/runtime/support/drawn-flowchart.ts";
import { corridorPoints, routesCross, routeLabels } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** How near a line's start may be to the outline it leaves. */
const MEETING = 2.5;

/** The parts the flows run between. */
const NODES = [
	{ id: "pane", name: "Browser pane", kind: "ui" },
	{ id: "gate", name: "Browser gateway", kind: "service" },
	{ id: "run", name: "Codex session", kind: "service" },
];

/** A decision with two answers, one of them into a loop. */
const TWO: VariantContent = orderedFixture({
	nodes: NODES,
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

/** A decision with three answers, each with a step of its own, and a step after it. */
const THREE: VariantContent = orderedFixture({
	nodes: NODES,
	flows: [
		{
			id: "f2",
			name: "Three ways",
			participants: ["pane", "gate", "run"],
			steps: [
				{ id: "t1", from: "pane", to: "gate", label: "ask", kind: "sync" },
				{
					id: "d2",
					kind: "decision",
					question: "Which way does the gateway send it?",
					alternatives: ["first", "second", "third"].map((label, index) => ({
						label,
						steps: [
							{ id: `a${index}`, from: "gate", to: "run", label: `go ${label}`, kind: "sync" },
						],
					})),
				},
				{ id: "t2", from: "gate", to: "pane", label: "answered", kind: "return" },
			],
		},
	],
});

/**
 * A loop around a decision whose one answer comes straight back to the loop
 * and whose other runs on through two steps: the line back up runs beside one
 * answer or across it.
 */
const LOOPED: VariantContent = orderedFixture({
	nodes: NODES,
	flows: [
		{
			id: "f3",
			name: "Stop each",
			participants: ["pane", "gate", "run"],
			steps: [
				{ id: "u1", from: "pane", to: "gate", label: "stop them all", kind: "sync" },
				{
					id: "l3",
					kind: "loop",
					condition: "for each workhorse of the tab",
					steps: [
						{
							id: "d3",
							kind: "decision",
							question: "Is a turn running on this workhorse?",
							alternatives: [
								{
									label: "idle",
									steps: [
										{ id: "u2", from: "gate", to: "gate", label: "report it idle", kind: "self" },
									],
								},
								{
									label: "running",
									steps: [
										{
											id: "u3",
											from: "gate",
											to: "run",
											label: "interrupt the turn",
											kind: "sync",
										},
										{ id: "u4", from: "run", to: "gate", label: "interrupt sent", kind: "return" },
									],
								},
							],
						},
					],
				},
				{ id: "u5", from: "gate", to: "pane", label: "what each did", kind: "return" },
			],
		},
	],
});

/**
 * Decisions nested in answers, as a reveal is drawn: an answer whose words
 * stand wider than the step it reaches would step back under its diamond
 * above them.
 */
const NESTED: VariantContent = orderedFixture({
	nodes: [...NODES, { id: "cam", name: "Camera", kind: "ui" }],
	flows: [
		{
			id: "f4",
			name: "A reveal",
			participants: ["pane", "gate", "run", "cam"],
			steps: [
				{ id: "v1", from: "pane", to: "gate", label: "the pick", kind: "sync" },
				{
					id: "d4",
					kind: "decision",
					question: "Did the picture itself pick the part?",
					alternatives: [
						{ label: "by the reader's hand", steps: [] },
						{
							label: "from a list, a search or an agent",
							steps: [
								{
									id: "d5",
									kind: "decision",
									question: "Does a walkthrough or a panel already move the camera?",
									alternatives: [
										{ label: "yes", steps: [] },
										{
											label: "no",
											steps: [
												{
													id: "v2",
													from: "gate",
													to: "run",
													label: "where the part is",
													kind: "sync",
												},
												{
													id: "v3",
													from: "run",
													to: "gate",
													label: "its box, or none",
													kind: "return",
												},
												{
													id: "d6",
													kind: "decision",
													question: "Is the part already in view?",
													alternatives: [
														{ label: "in view", steps: [] },
														{
															label: "out of view",
															steps: [
																{
																	id: "v4",
																	from: "gate",
																	to: "cam",
																	label: "glide to it",
																	kind: "sync",
																},
															],
														},
													],
												},
											],
										},
									],
								},
							],
						},
					],
				},
			],
		},
	],
});

/**
 * The lines that leave a decision, each from its start, left to right by where
 * it starts, with the diamond's points.
 * @param content What is drawn.
 * @param id The decision.
 * @returns The lines, and the diamond's left and right x, middle height and foot.
 */
async function answersOf(content: VariantContent, id: string) {
	const { svg } = await renderSemanticView({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		grammar: "flowchart",
		theme: "light",
	});
	const outline = outlineOf(svg, id);
	const xs = outline.map(({ x }) => x);
	const ys = outline.map(({ y }) => y);
	const diamond = {
		left: Math.min(...xs),
		right: Math.max(...xs),
		middle: (Math.min(...ys) + Math.max(...ys)) / 2,
		foot: Math.max(...ys),
	};
	const out = drawnLines(svg)
		.filter((points) => distanceToOutline(outline, points[0]!) < MEETING)
		.toSorted((one, other) => one[0]!.x - other[0]!.x);
	return { out, diamond };
}

/**
 * Whether a line out of a side point runs sideways out of it, and stays
 * outside the diamond's width until it is below the diamond.
 * @param points The line, from its start.
 * @param side The x of the point it leaves.
 * @param way Which way out of the diamond that side is: -1 left, 1 right.
 * @param foot The diamond's foot.
 * @returns True when it does.
 */
function leavesSideways(points: readonly At[], side: number, way: -1 | 1, foot: number): boolean {
	const [start, next] = points;
	const sideways = Math.abs(next!.y - start!.y) < 0.5 && (next!.x - side) * way > 0;
	const beside = points.filter(({ y }) => y <= foot).every(({ x }) => (x - side) * way >= -0.5);
	return sideways && beside;
}

describe("a decision's answers leave it from separate points", () => {
	test("two answers leave from its left and right points, each sideways before it turns down", async () => {
		const { out, diamond } = await answersOf(TWO, "d1");
		expect(out.length).toBe(2);
		const [left, right] = out;
		for (const [line, x] of [
			[left!, diamond.left],
			[right!, diamond.right],
		] as const) {
			expect(line[0]!.x).toBeCloseTo(x, 0);
			expect(line[0]!.y).toBeCloseTo(diamond.middle, 0);
		}
		expect(leavesSideways(left!, diamond.left, -1, diamond.foot)).toBe(true);
		expect(leavesSideways(right!, diamond.right, 1, diamond.foot)).toBe(true);
	});

	test("three answers leave from its left, bottom and right points", async () => {
		const { out, diamond } = await answersOf(THREE, "d2");
		expect(out.length).toBe(3);
		const [left, bottom, right] = out;
		expect(left![0]!.x).toBeCloseTo(diamond.left, 0);
		expect(right![0]!.x).toBeCloseTo(diamond.right, 0);
		expect(bottom![0]!.x).toBeCloseTo((diamond.left + diamond.right) / 2, 0);
		expect(bottom![0]!.y).toBeCloseTo(diamond.foot, 0);
		expect(leavesSideways(left!, diamond.left, -1, diamond.foot)).toBe(true);
		expect(leavesSideways(right!, diamond.right, 1, diamond.foot)).toBe(true);
	});

	test("answers take the sides that cross no line, a loop's line back up included", async () => {
		const { svg } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: LOOPED,
			grammar: "flowchart",
			theme: "light",
		});
		const routes = [...corridorPoints(svg).values()];
		const crossing = routes.flatMap((one, index) =>
			routes.slice(index + 1).filter((other) => routesCross(one, other)),
		);
		expect(crossing).toEqual([]);
		const { out, diamond } = await answersOf(LOOPED, "d3");
		expect(leavesSideways(out[0]!, diamond.left, -1, diamond.foot)).toBe(true);
		expect(leavesSideways(out.at(-1)!, diamond.right, 1, diamond.foot)).toBe(true);
	});

	test("an answer from a side point stays beside its diamond down to its words", async () => {
		const { svg } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: NESTED,
			grammar: "flowchart",
			theme: "light",
		});
		const labels = routeLabels(svg);
		const sides = ["d4", "d5", "d6"].flatMap((id) => {
			const xs = outlineOf(svg, id).map(({ x }) => x);
			return [Math.min(...xs), Math.max(...xs)].map((x, index) => ({ id, x, way: index * 2 - 1 }));
		});
		let checked = 0;
		for (const [line, points] of corridorPoints(svg)) {
			const side = sides.find(({ x }) => Math.abs(points[0]!.x - x) < 0.5);
			if (side === undefined) continue;
			checked += 1;
			const above = points.filter(({ y }) => y <= labels.get(line)!.y);
			const beside = above.every(({ x }) => (x - side.x) * side.way >= -0.5);
			expect(beside, `${line} runs back under ${side.id} above its words`).toBe(true);
		}
		expect(checked).toBeGreaterThan(0);
	});
});
