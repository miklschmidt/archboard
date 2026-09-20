import { expect, test } from "bun:test";
import { SemanticNodeInputSchema, SemanticNodeSchema } from "@/shared/semantic-board/index";

test("authored and persisted responsibilities preserve readable multiline text", () => {
	const responsibility =
		"Accepts requests from the browser.\nChecks access before dispatching.\nReturns the result.";
	const node = { id: "api", name: "API", kind: "service", responsibility, order: 1000 };
	for (const schema of [SemanticNodeInputSchema, SemanticNodeSchema]) {
		expect(schema.parse(node).responsibility).toBe(responsibility);
		expect(schema.safeParse({ ...node, responsibility: " \n " }).success).toBe(false);
		expect(schema.safeParse({ ...node, responsibility: "x".repeat(201) }).success).toBe(false);
	}
});
