import { describe, expect, test } from "bun:test";
import type { DiagramBox } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import { renderSemanticView } from "#runtime/operations/render.ts";
import { SemanticRenderError } from "#shared/protocol/render-request.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { drawnTexts } from "#tests/runtime/support/drawn-text.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** One edit: a decision on the lease, its "no" side writing each variant in a loop. */
const BRANCHING: VariantContent = orderedFixture({
	nodes: [
		{ id: "cli", name: "CLI", kind: "app" },
		{ id: "srv", name: "Server", kind: "service" },
		{ id: "st", name: "Store", kind: "datastore" },
	],
	flows: [
		{
			id: "f1",
			name: "One edit",
			participants: ["cli", "srv", "st"],
			steps: [
				{ id: "s1", from: "cli", to: "srv", label: "edit", kind: "sync" },
				{
					id: "d1",
					kind: "decision",
					question: "Is the lease held?",
					alternatives: [
						{
							label: "yes",
							steps: [{ id: "s2", from: "srv", to: "cli", label: "held", kind: "return" }],
						},
						{
							label: "no",
							steps: [
								{
									id: "l1",
									kind: "loop",
									condition: "for each variant",
									steps: [{ id: "s3", from: "srv", to: "st", label: "write", kind: "sync" }],
								},
								{ id: "s4", from: "srv", to: "cli", label: "new version", kind: "return" },
							],
						},
					],
				},
				{ id: "s5", from: "cli", to: "cli", label: "print", kind: "self" },
			],
		},
	],
});

/**
 * Whether one box sits wholly inside another, allowing a hair of rounding.
 * @param inner The box that should be inside.
 * @param outer The box that should hold it.
 * @returns True when it does.
 */
function inside(inner: DiagramBox, outer: DiagramBox): boolean {
	const slack = 0.01;
	return (
		inner.x >= outer.x - slack &&
		inner.y >= outer.y - slack &&
		inner.x + inner.width <= outer.x + outer.width + slack &&
		inner.y + inner.height <= outer.y + outer.height + slack
	);
}

/**
 * The bottom edge of a box.
 * @param box The box.
 * @returns Its bottom.
 */
const bottom = (box: DiagramBox): number => box.y + box.height;

describe("a flow's logic in the sequence view", () => {
	test("a decision and a loop are frames around exactly the steps they hold", async () => {
		const { atlas } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: BRANCHING,
			grammar: "sequence",
			theme: "light",
		});
		const decision = atlas.edges["d1"]!;
		const loop = atlas.edges["l1"]!;
		expect(inside(loop, decision)).toBe(true);
		for (const id of ["s2", "s3", "s4"]) expect(inside(atlas.edges[id]!, decision)).toBe(true);
		expect(inside(atlas.edges["s3"]!, loop)).toBe(true);
		expect(inside(atlas.edges["s4"]!, loop)).toBe(false);
		// What comes before the decision is above it, and what follows is below.
		expect(bottom(atlas.edges["s1"]!)).toBeLessThanOrEqual(decision.y);
		expect(atlas.edges["s5"]!.y).toBeGreaterThanOrEqual(bottom(decision));
	});

	test("a frame says what it decides or repeats, and each alternative's label", async () => {
		const { svg } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: BRANCHING,
			grammar: "sequence",
			theme: "light",
		});
		const texts = drawnTexts(svg);
		/**
		 * Whether a word is drawn under one step.
		 * @param id The step.
		 * @param word The word.
		 * @returns True when it is.
		 */
		const says = (id: string, word: string): boolean =>
			texts.some((one) => one.subject.id === id && one.text.includes(word));
		expect(says("d1", "Is the lease held?")).toBe(true);
		expect(says("d1", "yes")).toBe(true);
		expect(says("d1", "no")).toBe(true);
		expect(says("l1", "for each variant")).toBe(true);
	});
});

describe("the flowchart view", () => {
	test("a decision branches below itself and every alternative rejoins at the step after it", async () => {
		const { atlas } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: BRANCHING,
			grammar: "flowchart",
			theme: "light",
		});
		const decision = atlas.nodes["d1"]!;
		for (const id of ["s2", "l1", "s3", "s4"]) {
			expect(atlas.nodes[id]!.y).toBeGreaterThan(bottom(decision));
		}
		for (const id of ["s2", "s4"]) {
			expect(atlas.nodes["s5"]!.y).toBeGreaterThan(bottom(atlas.nodes[id]!));
		}
		// The flow is the frame every step stands in.
		for (const id of ["s1", "d1", "l1", "s5"]) {
			expect(inside(atlas.nodes[id]!, atlas.regions["f1"]!)).toBe(true);
		}
	});

	test("only the flow and its steps are subjects: the lines and terminals belong to the picture", async () => {
		const { atlas } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: BRANCHING,
			grammar: "flowchart",
			theme: "light",
		});
		// The flow's frame is a node of the picture as a container is, and its region.
		const steps = ["f1", "s1", "d1", "s2", "l1", "s3", "s4", "s5"];
		expect(Object.keys(atlas.nodes).toSorted()).toEqual(steps.toSorted());
		expect(Object.keys(atlas.regions)).toEqual(["f1"]);
		expect(atlas.edges).toEqual({});
	});

	test("each line out of a decision is labelled with its answer, and a loop's with repeat and done", async () => {
		const { svg } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: BRANCHING,
			grammar: "flowchart",
			theme: "light",
		});
		const words = drawnTexts(svg).map((one) => one.text);
		for (const label of ["yes", "no", "repeat", "done"]) expect(words).toContain(label);
	});

	test("content with no flow has no flowchart", async () => {
		const plain = orderedFixture({ nodes: [{ id: "a", name: "A", kind: "service" }] });
		const refused = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: plain,
			grammar: "flowchart",
			theme: "light",
		}).catch((error: unknown) => error);
		expect(refused instanceof SemanticRenderError && refused.code).toBe("NOTHING_TO_RENDER");
	});
});
