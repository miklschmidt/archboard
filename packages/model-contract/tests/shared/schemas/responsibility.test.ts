import { expect, test } from "bun:test";
import { parseDocument } from "@archboard/model-contract";

test("Semantic responsibilities preserve readable multiline text", () => {
	const responsibility =
		"Accepts requests from the browser.\nChecks access before dispatching.\nReturns the result.";
	const holding = (text: string) =>
		parseDocument("variantContent", {
			nodes: [{ id: "api", name: "API", kind: "service", responsibility: text, order: 1000 }],
			edges: [],
		});
	const read = holding(responsibility);
	expect(read.success && read.data.nodes[0]?.responsibility).toBe(responsibility);
	expect(holding(" \n ").success).toBe(false);
	expect(holding("x".repeat(201)).success).toBe(false);
});
