import { test } from "bun:test";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import flask from "../../../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import systemMap from "../../../../../../docs/design/wide-board-layout-fixtures/system-map.content.json";
import publicApi from "../../../../../../docs/design/wide-board-layout-fixtures/public-api-independent.content.json";

// Fixed coverage: labeled fan-in/fan-out, dense cross-links, and nested containers.
// These authored fixtures never discover the vault or impose render-speed limits.
const fixtures = [
	{ name: "Flask dependencies", content: flask },
	{ name: "Dense system map", content: systemMap },
	{ name: "Nested public API", content: publicApi },
];

for (const fixture of fixtures) {
	for (const layout of LayoutEngineSchema.options) {
		test(`${fixture.name} (${layout}): complete parts and clear drawing`, async () => {
			const content = orderedFixture(fixture.content);
			const drawing = await renderArchitecture({
				policy: DEFAULT_SEMANTIC_POLICY,
				content,
				theme: "light",
				layout,
			});
			expectDrawingIntact(drawing, content, layout);
		});
	}
}
