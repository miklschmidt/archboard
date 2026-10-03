// An exchange told on one clock (ADR 0027): every message sends its pulse in its
// turn, at one speed, and waits until the one before it has arrived.
import { describe, expect, test } from "bun:test";
import { DEFAULT_TRAFFIC_SPEED } from "@/shared/semantic-board/index";

/** How fast a pulse flies on a message: twice the pace of a relationship's default traffic. */
const FLOWN = DEFAULT_TRAFFIC_SPEED * 2;
import { FLOW_CYCLE_CAP_MS } from "@/shared/timing/timing";
import { renderSemanticView } from "@/runtime/semantic-renderer/index";
import { messagePulses } from "@/runtime/semantic-renderer/tests/drawn-traffic";
import {
	MOTION,
	SAMPLE,
	TWO_FLOWS,
	drawn,
	headLayer,
	pulsesOn,
	variant,
} from "@/runtime/semantic-renderer/tests/pulse-fixtures";

/**
 * Every pulse of a picture in the order its message is drawn: when its head
 * leaves the start of its line, how fast it flies and how long its line is.
 * @param svg The markup.
 * @param ids The messages, in the order they are told.
 * @returns One entry for each pulse.
 */
function turns(svg: string, ids: readonly string[]) {
	return ids.flatMap((id) =>
		messagePulses(svg, id).map((layers) => {
			const head = headLayer(layers);
			const [, from = 0, to = 1] = head.times;
			const travel = Math.abs(head.values[1]! - head.values[2]!);
			return {
				start: from * head.cycle,
				speed: travel / ((to - from) * head.cycle),
				// The head is at the line's end when the dash has moved the line's length.
				length: -head.values[2]!,
				cycle: head.cycle,
			};
		}),
	);
}

describe("an exchange is told on one clock", () => {
	test("every message takes a turn, and a repeated one takes its repeat", async () => {
		const svg = await drawn("data-flow");
		expect(MOTION.test(svg)).toBe(true);
		expect(pulsesOn(svg, "asks")).toBe(1);
		expect(pulsesOn(svg, "answers")).toBe(1);
		// A step somebody wrote a repeat on sends that many pulses, so the drawing
		// says "twice" the way the label does.
		expect(pulsesOn(svg, "again")).toBe(2);
	});

	test("the turns share one cycle and follow one another in the order they are told", async () => {
		const svg = await drawn("data-flow");
		const told = turns(svg, ["asks", "again", "answers"]);
		expect(told).toHaveLength(4);
		expect(new Set(told.map(({ cycle }) => cycle)).size).toBe(1);
		const starts = told.map(({ start }) => start);
		expect(starts).toEqual(starts.toSorted((a, b) => a - b));
		expect(new Set(starts).size).toBe(4);
		expect(starts.at(-1)!).toBeLessThan(told[0]!.cycle);
	});

	test("every pulse flies at the same pace, however long its message", async () => {
		const svg = await drawn("data-flow");
		for (const { speed } of turns(svg, ["asks", "again", "answers"])) {
			expect(speed).toBeCloseTo(FLOWN, 1);
		}
	});

	test("a message waits until the one before it has arrived, and then goes", async () => {
		const svg = await drawn("data-flow");
		const told = turns(svg, ["asks", "again", "answers"]);
		for (let turn = 1; turn < told.length; turn += 1) {
			const before = told[turn - 1]!;
			expect(told[turn]!.start).toBeCloseTo(before.start + before.length / before.speed, 2);
		}
	});

	test("a page of exchanges shares one clock, and they take their turns in order", async () => {
		// Two flows on one page. A clock each would have both crossing at once and
		// both starting over at 0, which is the drawing saying two unrelated things
		// are the same thing happening twice.
		const svg = (
			await renderSemanticView({
				content: TWO_FLOWS,
				grammar: "data-flow",
				theme: "light",
			})
		).svg;
		const told = turns(svg, ["asks", "answers", "sends", "acks"]);
		expect(told).toHaveLength(5);
		expect(new Set(told.map(({ cycle }) => cycle)).size).toBe(1);
		// Counted straight through: the second flow's first message goes third, not first.
		const starts = told.map(({ start }) => start);
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
			content: variant({
				nodes: SAMPLE.nodes,
				flows: [{ id: "long", name: "Long", participants: ["api", "store"], steps }],
			}),
			grammar: "data-flow",
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
