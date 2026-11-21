import { describe, expect, test } from "bun:test";
import { changeOf, compareVariants, type VariantComparison } from "@archboard/model-rules";
import { contentOf as content } from "#tests/shared/support/fixture-orders.ts";

/** How one subject stands in a comparison: unchanged when the comparison never saw it. */
const standingOf = (comparison: VariantComparison, id: string) =>
	changeOf(comparison, id)?.kind ?? "unchanged";

/** The nodes, relationship and flow every case below explains. */
const ARCHITECTURE = {
	nodes: [
		{ id: "cli", name: "CLI", kind: "app" },
		{ id: "srv", name: "Server", kind: "service" },
	],
	edges: [{ id: "e1", from: "cli", to: "srv", kind: "http" }],
	flows: [
		{
			id: "f1",
			name: "One edit",
			participants: ["cli", "srv"],
			steps: [{ id: "s1", from: "cli", to: "srv", label: "state the change" }],
		},
	],
};

/**
 * The architecture above, explained by the stated walkthroughs.
 * @param walkthroughs The explanations.
 * @returns The variant's content.
 */
const explained = (walkthroughs: readonly Record<string, unknown>[]) =>
	content({ ...ARCHITECTURE, walkthroughs });

/**
 * One walkthrough of two beats, with whatever is stated changed about it.
 * @param over What to change.
 * @returns The walkthrough.
 */
const walkthrough = (over: Record<string, unknown> = {}) => ({
	id: "wk",
	name: "For the model",
	beats: [
		{ id: "b1", heading: "The shape", body: "Two parts and one call." },
		{ id: "b2", heading: "One edit", body: "The CLI states it.", subjects: ["cli", "e1"] },
	],
	...over,
});

describe("what a proposal changed about an explanation", () => {
	const before = explained([walkthrough()]);

	test("a reworded beat is changed, and the node it is about is not", () => {
		const after = explained([
			walkthrough({
				beats: [
					{ id: "b1", heading: "The shape", body: "Two parts and one call." },
					{
						id: "b2",
						heading: "One edit",
						body: "The CLI asks for it.",
						subjects: ["cli", "e1"],
					},
				],
			}),
		]);
		const comparison = compareVariants(before, after);
		expect(comparison.beats.get("b2")?.kind).toBe("changed");
		expect(comparison.beats.get("b2")?.fields.map((one) => one.field)).toEqual(["body"]);
		// The whole point: explaining a node differently does not change the node.
		expect(standingOf(comparison, "cli")).toBe("unchanged");
		expect(standingOf(comparison, "e1")).toBe("unchanged");
	});

	test("a beat that moved is changed, because where it comes is part of what it says", () => {
		const after = explained([walkthrough({ beats: [...walkthrough().beats].toReversed() })]);
		const comparison = compareVariants(before, after);
		expect(comparison.beats.get("b1")?.fields.map((one) => one.field)).toEqual(["position"]);
		expect(comparison.beats.get("b2")?.kind).toBe("changed");
	});

	test("reordering what one beat is about changes nothing, because they are highlighted together", () => {
		const after = explained([
			walkthrough({
				beats: [
					{ id: "b1", heading: "The shape", body: "Two parts and one call." },
					{ id: "b2", heading: "One edit", body: "The CLI states it.", subjects: ["e1", "cli"] },
				],
			}),
		]);
		expect(compareVariants(before, after).beats.get("b2")?.kind).toBe("unchanged");
	});

	test("dropping a subject from a beat is a change", () => {
		const after = explained([
			walkthrough({
				beats: [
					{ id: "b1", heading: "The shape", body: "Two parts and one call." },
					{ id: "b2", heading: "One edit", body: "The CLI states it.", subjects: ["cli"] },
				],
			}),
		]);
		expect(compareVariants(before, after).beats.get("b2")?.kind).toBe("changed");
	});

	test("a renamed walkthrough is changed and its untouched beats are not", () => {
		const after = explained([walkthrough({ name: "For the builders" })]);
		const comparison = compareVariants(before, after);
		expect(comparison.walkthroughs.get("wk")?.fields.map((one) => one.field)).toEqual(["name"]);
		expect(comparison.beats.get("b1")?.kind).toBe("unchanged");
	});

	test("an added and a removed explanation are reported as such", () => {
		const after = explained([]);
		const comparison = compareVariants(before, after);
		expect(standingOf(comparison, "wk")).toBe("removed");
		expect(standingOf(comparison, "b1")).toBe("removed");
		expect(standingOf(compareVariants(after, before), "wk")).toBe("added");
	});

	test("a removed explanation is not put back into the picture", () => {
		const after = explained([]);
		const drawn = compareVariants(before, after, { kind: "all" }).content;
		// A removed node comes back so the diagram can show what the proposal takes
		// away. A removed paragraph does not: archboard does not author prose.
		expect(drawn.walkthroughs).toEqual([]);
	});
});
