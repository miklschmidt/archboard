import { describe, expect, test } from "bun:test";
import { parseDocument, subjectsOf, type VariantContent } from "@archboard/model-contract";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

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

const VIEWS = [{ id: "vw", name: "The parts", grammar: "architecture" }];

/**
 * A model that is coherent, so each case can break exactly one thing.
 * @param content What is on its one variant.
 * @returns The model document.
 */
const model = (content: Record<string, unknown>) => ({
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "bd1",
	name: "Pipeline",
	level: "system",
	version: 1,
	createdAt: "2026-09-11T00:00:00.000Z",
	updatedAt: "2026-09-11T00:00:00.000Z",
	views: VIEWS,
	current: "v1",
	variants: [{ id: "v1", name: "Initial", lifecycle: "current", content }],
});

/**
 * Why a document was refused.
 * @param content What is on its one variant.
 * @returns The reason, or "" when it was accepted.
 */
const refusal = (content: Record<string, unknown>): string => {
	const parsed = parseDocument("legacyBoard", withFixtureOrders(model(content)));
	return parsed.success ? "" : parsed.error;
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
	name: "For the model",
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
const content = (content_: Record<string, unknown>): VariantContent => {
	const read = parseDocument("variantContent", withFixtureOrders(content_));
	if (read.success) return read.data;
	throw read.error instanceof Error ? read.error : new Error(JSON.stringify(read.error));
};

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

	test("a beat read through a view this model has is accepted, and any other is refused", () => {
		const seen = walkthrough({
			beats: [{ id: "b1", heading: "The shape", body: "Two parts.", view: "vw" }],
		});
		expect(refusal(explained([seen]))).toBe("");
		const blind = walkthrough({
			beats: [{ id: "b1", heading: "The shape", body: "Two parts.", view: "cli" }],
		});
		expect(refusal(explained([blind]))).toContain("not a view of this board");
	});

	test("a walkthrough with no beats is refused, and says which one", () => {
		expect(refusal(explained([walkthrough({ beats: [] })]))).toContain(
			'"For the model" is a walkthrough with no beats',
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
