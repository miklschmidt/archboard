import { expect, test } from "bun:test";
import { SemanticNodeSchema } from "#shared/schemas/content.ts";

test("Semantic responsibilities preserve readable multiline text", () => {
	const responsibility =
		"Accepts requests from the browser.\nChecks access before dispatching.\nReturns the result.";
	const node = { id: "api", name: "API", kind: "service", responsibility, order: 1000 };
	expect(SemanticNodeSchema.parse(node).responsibility).toBe(responsibility);
	expect(SemanticNodeSchema.safeParse({ ...node, responsibility: " \n " }).success).toBe(false);
	expect(SemanticNodeSchema.safeParse({ ...node, responsibility: "x".repeat(201) }).success).toBe(
		false,
	);
});
