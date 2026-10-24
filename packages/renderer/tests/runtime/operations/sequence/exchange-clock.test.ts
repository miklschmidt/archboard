// An exchange told on one clock (ADR 0027): every message sends its pulse in its
// turn, at one speed, and waits until the one before it has arrived.
import { describe, expect, test } from "bun:test";
import { DEFAULT_TRAFFIC_SPEED } from "@archboard/board/content";
import { FLOW_CYCLE_CAP_MS } from "@archboard/timing";
import { renderSemanticView } from "#runtime/operations/render.ts";
import { messageBeams, slidingSpeedOf } from "#tests/runtime/support/drawn-traffic.ts";
import {
	MOTION,
	SAMPLE,
	TWO_FLOWS,
	drawn,
	pulsesOn,
	variant,
} from "#tests/runtime/support/pulse-fixtures.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** How fast a pulse flies on a message: twice the pace of a relationship's default traffic. */
const FLOWN = DEFAULT_TRAFFIC_SPEED * 2;

/**
 * Every pulse of a picture in the order its message is told: when its bar begins
 * to slide, how fast it flies, how long its line is and how long the cycle is.
 * @param svg The markup.
 * @param ids The messages, in the order they are told.
 * @returns One entry for each pulse.
 */
function turns(svg: string, ids: readonly string[]) {
	return ids.flatMap((id) =>
		messageBeams(svg, id).map(({ pieces }) => {
			const [piece] = pieces;
			const [from, to] = [piece!.points[1]!, piece!.points.at(-2)!];
			return {
				// The bar begins to slide a moment before the head leaves the line's start.
				begins: (piece!.times[1] ?? 0) * piece!.cycle,
				speed: slidingSpeedOf(piece!),
				length: Math.hypot(to.x - from.x, to.y - from.y),
				cycle: piece!.cycle,
			};
		}),
	);
}

describe("an exchange is told on one clock", () => {
	test("every message takes a turn, and a repeated one takes its repeat", async () => {
		const svg = await drawn("sequence");
		expect(MOTION.test(svg)).toBe(true);
		expect(pulsesOn(svg, "asks")).toBe(1);
		expect(pulsesOn(svg, "answers")).toBe(1);
		// A step somebody wrote a repeat on sends that many pulses, so the drawing
		// says "twice" the way the label does.
		expect(pulsesOn(svg, "again")).toBe(2);
	});

	test("the turns share one cycle and follow one another in the order they are told", async () => {
		const svg = await drawn("sequence");
		const told = turns(svg, ["asks", "again", "answers"]);
		expect(told).toHaveLength(4);
		expect(new Set(told.map(({ cycle }) => cycle)).size).toBe(1);
		const starts = told.map((turn) => turn.begins);
		expect(starts).toEqual(starts.toSorted((a, b) => a - b));
		expect(new Set(starts).size).toBe(4);
		expect(starts.at(-1)!).toBeLessThan(told[0]!.cycle);
	});

	test("every pulse flies at the same pace, however long its message", async () => {
		const svg = await drawn("sequence");
		for (const { speed } of turns(svg, ["asks", "again", "answers"])) {
			expect(speed).toBeCloseTo(FLOWN, 1);
		}
	});

	test("a message waits until the one before it has arrived, and then goes", async () => {
		const svg = await drawn("sequence");
		const told = turns(svg, ["asks", "again", "answers"]);
		for (let turn = 2; turn < told.length; turn += 1) {
			const before = told[turn - 1]!;
			// The turns are counted from where each bar begins to slide, which is the same
			// moment ahead of each head: the gap between two is the line the first crosses.
			expect((told[turn]!.begins - before.begins) * before.speed).toBeCloseTo(before.length, 0);
		}
		// The first has no turn before it to measure from; its bar starts within a few units of a line ahead.
		expect(told[1]!.begins * told[0]!.speed).toBeCloseTo(told[0]!.length, -1);
	});

	test("a page of exchanges shares one clock, and they take their turns in order", async () => {
		// Two flows on one page. A clock each would have both crossing at once and
		// both starting over at 0, which is the drawing saying two unrelated things
		// are the same thing happening twice.
		const svg = (
			await renderSemanticView({
				policy: DEFAULT_SEMANTIC_POLICY,
				content: TWO_FLOWS,
				grammar: "sequence",
				theme: "light",
			})
		).svg;
		const told = turns(svg, ["asks", "answers", "sends", "acks"]);
		expect(told).toHaveLength(5);
		expect(new Set(told.map(({ cycle }) => cycle)).size).toBe(1);
		// Counted straight through: the second flow's first message goes third, not first.
		const starts = told.map((turn) => turn.begins);
		expect(starts).toEqual(starts.toSorted((a, b) => a - b));
		expect(new Set(starts).size).toBe(5);
	});

	test("a long exchange flies faster to come round again within the cycle a reader will wait for", async () => {
		const steps = Array.from({ length: 40 }, (_, index) => ({
			id: `m${index}`,
			from: index % 2 === 0 ? "api" : "store",
			to: index % 2 === 0 ? "store" : "api",
			label: `m${index}`,
			kind: index % 2 === 0 ? "sync" : "return",
		}));
		const { svg } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: variant({
				nodes: SAMPLE.nodes,
				flows: [{ id: "long", name: "Long", participants: ["api", "store"], steps }],
			}),
			grammar: "sequence",
			theme: "light",
		});
		const told = turns(
			svg,
			steps.map(({ id }) => id),
		);
		expect(told[0]!.cycle).toBeLessThanOrEqual(FLOW_CYCLE_CAP_MS / 1000 + 0.001);
		for (const { speed } of told) expect(speed).toBeGreaterThan(FLOWN);
	});
});
