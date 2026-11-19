import { describe, expect, test } from "bun:test";
import { parseDocument } from "@archboard/model-contract";

/**
 * Whether an author may write a step into a flow.
 * @param step The step as written.
 * @returns True when the statement is accepted.
 */
const accepts = (step: unknown): boolean =>
	parseDocument("flowChange", {
		type: "add-step",
		placement: { holder: "Shop#One" },
		step,
	}).success;

describe("what a flow's logic must say to be written", () => {
	const message = { from: "CLI", to: "Server", label: "edit" };

	test("a decision, a loop and a message without a kind are all steps", () => {
		const decision = {
			kind: "decision",
			question: "Held?",
			alternatives: [
				{ label: "yes", steps: [message] },
				{ label: "no", steps: [] },
			],
		};
		const loop = { kind: "loop", condition: "for each", steps: [message] };
		expect(accepts(decision)).toBe(true);
		expect(accepts(loop)).toBe(true);
		expect(accepts(message)).toBe(true);
	});

	test.each([
		["one alternative", [{ label: "yes", steps: [message] }]],
		[
			"two alternatives with one label",
			[
				{ label: "yes", steps: [message] },
				{ label: "yes", steps: [] },
			],
		],
		[
			"alternatives that hold no step",
			[
				{ label: "yes", steps: [] },
				{ label: "no", steps: [] },
			],
		],
	])("a decision with %s is refused", (_case, alternatives) => {
		expect(accepts({ kind: "decision", question: "?", alternatives })).toBe(false);
	});

	test("a loop that repeats nothing is refused", () => {
		expect(accepts({ kind: "loop", condition: "while", steps: [] })).toBe(false);
	});

	test("the old grammar name is refused, and the refusal names the new one", () => {
		const parsed = parseDocument("diagramGrammar", "data-flow");
		expect(parsed.success).toBe(false);
		expect(!parsed.success && parsed.error.issues[0]?.message).toContain('"sequence"');
		expect(parseDocument("diagramGrammar", "flowchart").success).toBe(true);
	});
});
