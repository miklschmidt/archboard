import { test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import fixtures from "#tests/runtime/support/fixtures/ambiguous-trunks.json";

// The four council failures share block boundaries but have distinct card ends.
test.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
	"%s: a trunk preserves its source or target",
	async (_name, fixture) => {
		const content = orderedFixture(fixture.content);
		const drawing = await renderArchitecture({
			content,
			policy: SemanticPolicySchema.parse(fixture.policy),
			theme: "light",
			layout: "blocks",
		});
		expectDrawingIntact(drawing, content, "blocks");
	},
);
