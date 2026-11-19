import { test } from "bun:test";
import { layoutEngineSchema } from "@archboard/model/render-reply";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import flask from "../../support/wide-boards/flask-map-1.content.json";
import systemMap from "../../support/wide-boards/system-map.content.json";
import publicApi from "../../support/wide-boards/public-api-independent.content.json";

// Fixed coverage: labeled fan-in/fan-out, dense cross-links, and nested containers.
// These authored fixtures never discover the vault or impose render-speed limits.
const fixtures = [
	{ name: "Flask dependencies", content: flask },
	{ name: "Dense system map", content: systemMap },
	{ name: "Nested public API", content: publicApi },
];

for (const fixture of fixtures) {
	for (const layout of layoutEngineSchema().options) {
		test(`${fixture.name} (${layout}): complete parts and clear drawing`, async () => {
			const content = orderedFixture(fixture.content);
			const drawing = await renderArchitecture({
				policy: defaultSemanticPolicy(),
				content,
				theme: "light",
				layout,
			});
			expectDrawingIntact(drawing, content, layout);
		});
	}
}
