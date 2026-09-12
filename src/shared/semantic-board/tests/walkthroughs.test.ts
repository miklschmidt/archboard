import { describe, expect, test } from "bun:test";
import {
	compareVariants,
	parseSemanticBoard,
	standingOf,
	subjectsOf,
	VariantContentSchema,
	withRemoved,
	type VariantContent,
} from "@/shared/semantic-board/index";

/** The nodes, relationship and flow every case below explains. */
const ARCHITECTURE = {
	nodes: [
		{ id: "cli", name: "CLI", kind: "app" },
		{ id: "cnv", name: "Canvas", kind: "service" },
	],
	edges: [{ id: "e1", from: "cli", to: "cnv", kind: "http" }],
	flows: [
		{
			id: "f1",
			name: "One edit",
			participants: ["cli", "cnv"],
			steps: [{ id: "s1", from: "cli", to: "cnv", label: "state the change" }],
		},
	],
	views: [{ id: "vw", name: "The parts", grammar: "architecture" }],
};

/**
 * A board that is coherent, so each case can break exactly one thing.
 * @param content What is on its one variant.
 * @returns The board document.
 */
const board = (content: Record<string, unknown>) => ({
	schemaVersion: "1.0.0",
	kind: "semantic-board",
	id: "bd1",
	name: "Pipeline",
	version: 1,
	createdAt: "2026-09-11T00:00:00.000Z",
	updatedAt: "2026-09-11T00:00:00.000Z",
	current: "v1",
	variants: [{ id: "v1", name: "Initial", lifecycle: "current", content }],
});

/**
 * Why a document was refused.
 * @param content What is on its one variant.
 * @returns The reason, or "" when it was accepted.
 */
const refusal = (content: Record<string, unknown>): string => {
	const parsed = parseSemanticBoard(board(content));
	return parsed.ok ? "" : parsed.problem;
};

/**
 * The architecture above, explained by the stated walkthroughs.
 * @param walkthroughs The explanations.
 * @returns The variant's content.
 */
const explained = (walkthroughs: readonly Record<string, unknown>[]) => ({
	...ARCHITECTURE,
	walkthroughs,
});

/**
 * One walkthrough of two beats, with whatever is stated changed about it.
 * @param over What to change.
 * @returns The walkthrough.
 */
const walkthrough = (over: Record<string, unknown> = {}) => ({
	id: "wk",
	name: "For the board",
	beats: [
		{ id: "b1", heading: "The shape", body: "Two parts and one call." },
		{ id: "b2", heading: "One edit", body: "The CLI states it.", subjects: ["cli", "e1"] },
	],
	...over,
});

/**
 * The stated content, parsed.
 * @param content What is on the variant.
 * @returns The content.
 */
const content = (content_: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(content_);

describe("what an explanation has to be before it is presented", () => {
	test("a walkthrough about this variant is accepted", () => {
		expect(refusal(explained([walkthrough()]))).toBe("");
	});

	test("a beat may be about nothing at all, because an opening beat is", () => {
		const opening = walkthrough({
			beats: [{ id: "b1", heading: "The shape", body: "Here is the system." }],
		});
		expect(refusal(explained([opening]))).toBe("");
	});

	test("a beat about a subject the variant has not got is refused", () => {
		const wrong = walkthrough({
			beats: [{ id: "b1", heading: "The shape", body: "Two parts.", subjects: ["gone"] }],
		});
		expect(refusal(explained([wrong]))).toContain("not something on this variant");
	});

	test("a beat may be about a node, a relationship, a flow or one of its steps", () => {
		const about = walkthrough({
			beats: [
				{
					id: "b1",
					heading: "All of it",
					body: "Everything at once.",
					subjects: ["cli", "e1", "f1", "s1"],
				},
			],
		});
		expect(refusal(explained([about]))).toBe("");
	});

	test("a beat about a view, rather than read through one, is refused", () => {
		// A view is named in the beat's own `view` field. Admitting it as a subject
		// as well would make one sentence two, with nothing saying which was meant.
		const about = walkthrough({
			beats: [{ id: "b1", heading: "The parts", body: "Read this one.", subjects: ["vw"] }],
		});
		expect(refusal(explained([about]))).toContain("not something on this variant");
	});

	test("a beat about another beat is refused", () => {
		const about = walkthrough({
			beats: [
				{ id: "b1", heading: "The shape", body: "Two parts." },
				{ id: "b2", heading: "Recursion", body: "About the last one.", subjects: ["b1"] },
			],
		});
		expect(refusal(explained([about]))).toContain("not something on this variant");
	});

	test("a beat read through a view this variant has is accepted, and any other is refused", () => {
		const seen = walkthrough({
			beats: [{ id: "b1", heading: "The shape", body: "Two parts.", view: "vw" }],
		});
		expect(refusal(explained([seen]))).toBe("");
		const blind = walkthrough({
			beats: [{ id: "b1", heading: "The shape", body: "Two parts.", view: "cli" }],
		});
		expect(refusal(explained([blind]))).toContain("not a view of this variant");
	});

	test("a walkthrough with no beats is refused, and says which one", () => {
		expect(refusal(explained([walkthrough({ beats: [] })]))).toContain(
			'"For the board" is a walkthrough with no beats',
		);
	});

	test("two walkthroughs of one name are refused, because a walkthrough is addressed by name", () => {
		const twice = [walkthrough(), walkthrough({ id: "wk2", beats: [walkthrough().beats[0]] })];
		expect(refusal(explained(twice))).toContain("two walkthroughs are called");
	});

	test("a beat sharing an id with a node is refused, because there is one namespace", () => {
		const clash = walkthrough({
			beats: [{ id: "cli", heading: "The shape", body: "Two parts." }],
		});
		expect(refusal(explained([clash]))).toContain('both answer to the id "cli"');
	});

	test("a walkthrough and its beats are subjects of the variant", () => {
		const held = [...subjectsOf(content(explained([walkthrough()])))];
		expect(held.filter((one) => one.kind === "walkthrough").map((one) => one.id)).toEqual(["wk"]);
		expect(held.filter((one) => one.kind === "beat").map((one) => one.id)).toEqual(["b1", "b2"]);
	});
});

describe("what a proposal changed about an explanation", () => {
	const before = content(explained([walkthrough()]));

	test("a reworded beat is changed, and the node it is about is not", () => {
		const after = content(
			explained([
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
			]),
		);
		const comparison = compareVariants(before, after);
		expect(comparison.beats.get("b2")?.kind).toBe("changed");
		expect(comparison.beats.get("b2")?.fields.map((one) => one.field)).toEqual(["body"]);
		// The whole point: explaining a node differently does not change the node.
		expect(standingOf(comparison, "cli")).toBe("unchanged");
		expect(standingOf(comparison, "e1")).toBe("unchanged");
	});

	test("a beat that moved is changed, because where it comes is part of what it says", () => {
		const after = content(
			explained([walkthrough({ beats: [...walkthrough().beats].toReversed() })]),
		);
		const comparison = compareVariants(before, after);
		expect(comparison.beats.get("b1")?.fields.map((one) => one.field)).toEqual(["position"]);
		expect(comparison.beats.get("b2")?.kind).toBe("changed");
	});

	test("reordering what one beat is about changes nothing, because they are highlighted together", () => {
		const after = content(
			explained([
				walkthrough({
					beats: [
						{ id: "b1", heading: "The shape", body: "Two parts and one call." },
						{ id: "b2", heading: "One edit", body: "The CLI states it.", subjects: ["e1", "cli"] },
					],
				}),
			]),
		);
		expect(compareVariants(before, after).beats.get("b2")?.kind).toBe("unchanged");
	});

	test("dropping a subject from a beat is a change", () => {
		const after = content(
			explained([
				walkthrough({
					beats: [
						{ id: "b1", heading: "The shape", body: "Two parts and one call." },
						{ id: "b2", heading: "One edit", body: "The CLI states it.", subjects: ["cli"] },
					],
				}),
			]),
		);
		expect(compareVariants(before, after).beats.get("b2")?.kind).toBe("changed");
	});

	test("a renamed walkthrough is changed and its untouched beats are not", () => {
		const after = content(explained([walkthrough({ name: "For the builders" })]));
		const comparison = compareVariants(before, after);
		expect(comparison.walkthroughs.get("wk")?.fields.map((one) => one.field)).toEqual(["name"]);
		expect(comparison.beats.get("b1")?.kind).toBe("unchanged");
	});

	test("an added and a removed explanation are reported as such", () => {
		const after = content(explained([]));
		const comparison = compareVariants(before, after);
		expect(standingOf(comparison, "wk")).toBe("removed");
		expect(standingOf(comparison, "b1")).toBe("removed");
		expect(standingOf(compareVariants(after, before), "wk")).toBe("added");
	});

	test("a removed explanation is not put back into the picture", () => {
		const after = content(explained([]));
		const drawn = withRemoved(after, compareVariants(before, after));
		// A removed node comes back so the diagram can show what the proposal takes
		// away. A removed paragraph does not: archboard does not author prose.
		expect(drawn.walkthroughs).toEqual([]);
	});
});
