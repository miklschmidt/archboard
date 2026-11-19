import { test } from "bun:test";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import fixtures from "#tests/runtime/support/fixtures/ambiguous-trunks.json";
import { fixtureDocument } from "#tests/runtime/support/model-documents.ts";

// The four council failures share block boundaries but have distinct card ends.
test.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
	"%s: a trunk preserves its source or target",
	async (_name, fixture) => {
		const content = orderedFixture(fixture.content);
		const drawing = await renderArchitecture({
			content,
			policy: fixtureDocument("semanticPolicy", fixture.policy),
			theme: "light",
			layout: "blocks",
		});
		expectDrawingIntact(drawing, content, "blocks");
	},
);
