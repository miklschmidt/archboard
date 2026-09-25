// Where the parts of a drawn sequence meet: a lifeline and the card it hangs
// from, and a flow's title rule and the frame around it.
//
// Each is read back off the drawn document, in the one frame of reference a
// subject's own group is drawn in, so the page's shift never enters a comparison.

import { expect, test } from "bun:test";
import { renderDataFlow } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { subjectGroups, type DrawnGroup } from "@/runtime/semantic-renderer/tests/drawn-subjects";

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

test("every lifeline starts the same short way under its own card, however tall the card", () => {
	// Cards in one header row share a top edge but not a height: one with a
	// responsibility of several lines is taller. A lifeline that starts under the
	// tallest card leaves every shorter card floating above its own column.
	const rendered = renderDataFlow({
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
	expect(new Set(cards.map((card) => card.bottom)).size).toBe(3);
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

test("a flow's title rule keeps the same inset from both sides of a frame its words widened", () => {
	// A self-message's words on the last column reach past the columns, and the
	// frame grows to hold them; the rule under the flow's title grows with it.
	const long = "a label long enough to reach past every column of this flow";
	const rendered = renderDataFlow({
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
	const rule = numbersOf(flow, "line");
	expect(rule("y1")).toBe(rule("y2"));
	const left = rule("x1") - frame("x");
	expect(left).toBeGreaterThan(0);
	expect(frame("x") + frame("width") - rule("x2")).toBeCloseTo(left, 2);
});
