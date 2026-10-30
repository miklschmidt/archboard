// Where the parts of a drawn sequence meet: a lifeline and the card it hangs
// from, an arrowhead and the bar or lifeline it points at, a message's words
// and the lifelines either side of them, and a flow's title rule and the frame
// around it.
//
// Each is read back off the drawn document, in the one frame of reference a
// subject's own group is drawn in, so the page's shift never enters a comparison.

import { expect, test } from "bun:test";
import { renderSemanticView } from "#runtime/operations/render.ts";
import { messagesOf } from "@archboard/board/flow";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { subjectGroups, type DrawnGroup } from "#tests/runtime/support/drawn-subjects.ts";
import { labelPlates } from "#tests/runtime/support/drawn-text.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** Every `name="number"` attribute of one start tag. */
const NUMBER = /\s([\w-]+)="(-?[\d.]+)"/g;

/**
 * The numeric attributes of the first element of one sort in a group that
 * matches a test.
 * @param group The subject group.
 * @param element The element's tag name.
 * @param matches Whether a start tag is the one wanted.
 * @returns A reader of its numbers, by attribute name.
 */
function numbersOf(
	group: DrawnGroup,
	element: string,
	matches: (tag: string) => boolean = () => true,
): (name: string) => number {
	const tag = [...group.markup.matchAll(new RegExp(`<${element}\\s[^>]*>`, "g"))]
		.map((found) => found[0])
		.find(matches);
	expect(tag, `no <${element}> in ${group.kind} ${group.id}`).toBeDefined();
	const numbers = new Map(
		[...tag!.matchAll(NUMBER)].map(([, name, value]) => [name!, Number(value)]),
	);
	return (name) => {
		const value = numbers.get(name);
		expect(value, `no ${name} on <${element}> in ${group.kind} ${group.id}`).toBeDefined();
		return value!;
	};
}

/**
 * The box one participant's card is drawn in: the rect after its selection halo.
 * @param groups The drawn subject groups.
 * @param id The participant.
 * @returns The card's top and bottom.
 */
function cardOf(groups: readonly DrawnGroup[], id: string): { top: number; bottom: number } {
	const card = groups.find(
		(group) =>
			group.id === id &&
			group.markup.slice(0, group.markup.indexOf(">")).includes('data-depiction="card"'),
	);
	expect(card, `no card for ${id}`).toBeDefined();
	const box = numbersOf(card!, "rect", (tag) => !tag.includes("ab-halo"));
	return { top: box("y"), bottom: box("y") + box("height") };
}

test("the heads of one flow stand one height, so every lifeline starts level under its card", async () => {
	// Cards in one header row share a top edge, and one with a responsibility of
	// several lines needs more height. Heads of their own heights started their
	// lifelines at as many heights down the page.
	const rendered = await renderSemanticView({
		grammar: "sequence",
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		content: orderedFixture({
			nodes: [
				{ id: "a", name: "Caller", kind: "service" },
				{
					id: "b",
					name: "Worker",
					kind: "service",
					responsibility: "Takes the job.\nDoes the work.\nWrites what it found.",
				},
				{ id: "c", name: "Store", kind: "datastore", responsibility: "Keeps it." },
			],
			flows: [
				{
					id: "f",
					name: "One job",
					participants: ["a", "b", "c"],
					steps: [
						{ id: "s1", from: "a", to: "b", label: "run", kind: "sync" },
						{ id: "s2", from: "b", to: "c", label: "save", kind: "sync" },
					],
				},
			],
		}),
	});
	const groups = subjectGroups(rendered.svg);
	const cards = ["a", "b", "c"].map((id) => cardOf(groups, id));
	expect(new Set(cards.map((card) => card.bottom)).size).toBe(1);
	const gaps = ["a", "b", "c"].map((id, index) => {
		const column = groups.find((group) => group.id === id && group.markup.includes("<line"))!;
		return numbersOf(column, "line")("y1") - cards[index]!.bottom;
	});
	expect(gaps[0]).toBeGreaterThan(0);
	for (const gap of gaps) {
		expect(gap).toBeCloseTo(gaps[0]!, 2);
	}
	// And the first message still waits under the tallest card.
	const first = groups.find((group) => group.id === "s1")!;
	const row = Number(/\sd="M[\d.]+,([\d.]+)/.exec(first.markup)?.[1]);
	expect(row).toBeGreaterThan(Math.max(...cards.map((card) => card.bottom)));
});

/**
 * Where a path's pen stops, and which way it was last moving across the page.
 *
 * A sequence writes a crossing message with absolute moves and a self-message
 * loop with relative ones, so both are walked.
 * @param d The path's `d`.
 * @returns The first point, the last point and the sign of the last horizontal move.
 */
function penOf(d: string): { start: number; end: number; y: number; heading: number } {
	let x = 0;
	let y = 0;
	let start = 0;
	let heading = 0;
	for (const [, command, list] of d.matchAll(/([MLhva])([^MLhva]*)/g)) {
		const numbers = [...list!.matchAll(/-?[\d.]+/g)].map(Number);
		const before = x;
		if (command === "M" || command === "L") {
			[x, y] = [numbers[0]!, numbers[1]!];
		} else if (command === "h") {
			x += numbers[0]!;
		} else if (command === "v") {
			y += numbers[0]!;
		} else {
			x += numbers.at(-2)!;
			y += numbers.at(-1)!;
		}
		if (command === "M") {
			start = x;
		} else if (x !== before) {
			heading = Math.sign(x - before);
		}
	}
	return { start, end: x, y, heading };
}

test("every message's arrowhead touches the bar or lifeline it arrives at", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "a", name: "Caller", kind: "service" },
			{ id: "b", name: "Worker", kind: "service" },
			{ id: "c", name: "Store", kind: "datastore" },
		],
		flows: [
			{
				id: "f",
				name: "One job",
				participants: ["a", "b", "c"],
				steps: [
					{ id: "s1", from: "a", to: "b", label: "run", kind: "sync" },
					{ id: "s2", from: "b", to: "b", label: "check", kind: "self" },
					{ id: "s3", from: "b", to: "c", label: "save", kind: "async" },
					{ id: "s4", from: "c", to: "b", label: "saved", kind: "return" },
					{ id: "s5", from: "b", to: "a", label: "done", kind: "return" },
					{ id: "s6", from: "a", to: "a", label: "log", kind: "self" },
				],
			},
		],
	});
	const rendered = await renderSemanticView({
		grammar: "sequence",
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		content,
	});
	const markers = new Map(
		[...rendered.svg.matchAll(/<marker\s[^>]*>/g)].map(([tag]) => [
			/id="([^"]+)"/.exec(tag)![1]!,
			{
				refX: Number(/refX="([\d.]+)"/.exec(tag)![1]),
				width: Number(/markerWidth="([\d.]+)"/.exec(tag)![1]),
			},
		]),
	);
	const groups = subjectGroups(rendered.svg);
	const steps = ["s1", "s2", "s3", "s4", "s5", "s6"];
	const touched = steps.map((id) => {
		const step = messagesOf(content.flows[0]!.steps).find((one) => one.id === id)!;
		const line = /<path\s[^>]*marker-end="url\(#([^)]+)\)"[^>]*>/.exec(
			groups.find((group) => group.id === id)!.markup,
		)![0];
		const head = markers.get(/marker-end="url\(#([^)]+)\)"/.exec(line)![1]!)!;
		const pen = penOf(/\sd="([^"]+)"/.exec(line)![1]!);
		const reach =
			((10 - head.refX) / 10) * head.width * Number(/stroke-width="([\d.]+)"/.exec(line)![1]);
		const tip = pen.end + pen.heading * reach;
		if (step.kind === "self") {
			// A loop comes back to exactly where it left.
			return tip - pen.start;
		}
		// Otherwise it arrives at the straight side of the receiver's bar where
		// one runs at that height, not at a rounded corner of it, or at its lifeline.
		// A bar's box is the one its selection trace is drawn over; its shadow
		// reaches past it.
		const column = groups.find((group) => group.id === step.to && group.markup.includes("<line"))!;
		const bar = [...column.markup.matchAll(/<rect class="ab-halo"[^>]*>/g)]
			.map(([tag]) => numbersOf({ ...column, markup: tag }, "rect"))
			.find(
				(rect) =>
					rect("y") + rect("rx") <= pen.y && pen.y <= rect("y") + rect("height") - rect("rx"),
			);
		const side =
			bar === undefined
				? numbersOf(column, "line")("x1")
				: bar("x") + (pen.heading > 0 ? 0 : bar("width"));
		return tip - side;
	});
	for (const [index, miss] of touched.entries()) {
		expect(Math.abs(miss), steps[index]).toBeLessThan(0.5);
	}
});

test("a flow's header slab spans the whole of a frame its words widened", async () => {
	// A self-message's words on the last column reach past the columns, and the
	// frame grows to hold them; the header slab the flow's title is printed on
	// grows with it, as far in from either side of the frame.
	const long = "a label long enough to reach past every column of this flow";
	const rendered = await renderSemanticView({
		grammar: "sequence",
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		content: orderedFixture({
			nodes: [
				{ id: "a", name: "A", kind: "service" },
				{ id: "b", name: "B", kind: "service" },
			],
			flows: [
				{
					id: "f",
					name: "Words at the edge",
					participants: ["a", "b"],
					steps: [
						{ id: "s1", from: "a", to: "b", label: "short", kind: "sync" },
						{ id: "s2", from: "b", to: "b", label: long, kind: "self" },
					],
				},
			],
		}),
	});
	const flow = subjectGroups(rendered.svg).find((group) => group.kind === "flow")!;
	const frame = numbersOf(flow, "rect", (tag) => !tag.includes("ab-halo"));
	// The slab's body, at a card's corner radius.
	const slab = numbersOf(flow, "rect", (tag) => tag.includes('rx="8"'));
	const left = slab("x") - frame("x");
	expect(left).toBeGreaterThan(0);
	expect(frame("x") + frame("width") - slab("x") - slab("width")).toBeCloseTo(left, 6);
});

test("a message's words stand between the lifelines either side of them", async () => {
	// A label wider than the gap it names ran across the next lifeline, and one
	// centred over an arrow that passes a column stood on that column's lifeline.
	const rendered = await renderSemanticView({
		grammar: "sequence",
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		content: orderedFixture({
			nodes: ["a", "b", "c"].map((id) => ({ id, name: `Part ${id}`, kind: "service" })),
			flows: [
				{
					id: "f",
					name: "One exchange",
					participants: ["a", "b", "c"],
					steps: [
						{ id: "s1", from: "a", to: "c", label: "past one column", kind: "async" },
						{
							id: "s2",
							from: "b",
							to: "b",
							label: "a label on a loop that runs on well past the next lifeline",
							kind: "self",
						},
						{
							id: "s3",
							from: "b",
							to: "c",
							label: "an unusually long label for a short hop between two columns",
							kind: "sync",
						},
					],
				},
			],
		}),
	});
	const lifelines = ["a", "b", "c"].map((id) => {
		const card = rendered.atlas.nodes[id]!;
		return card.x + card.width / 2;
	});
	const plates = labelPlates(rendered.svg, "step");
	expect(plates.size).toBe(3);
	for (const [id, plate] of plates)
		for (const x of lifelines)
			expect(x > plate.x && x < plate.x + plate.width, `${id} across ${x}`).toBe(false);
});
