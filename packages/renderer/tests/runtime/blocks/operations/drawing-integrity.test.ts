import { test } from "bun:test";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
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
	test(`${fixture.name}: complete parts and clear drawing`, async () => {
		const content = orderedFixture(fixture.content);
		const drawing = await renderArchitecture({
			policy: defaultSemanticPolicy(),
			content,
			theme: "light",
		});
		expectDrawingIntact(drawing, content);
	});
}

test("Nested public API on Lanes: complete parts and clear drawing", async () => {
	const content = orderedFixture(publicApi);
	const drawing = await renderArchitecture({
		policy: defaultSemanticPolicy(),
		content,
		theme: "light",
		layout: "lanes",
	});
	expectDrawingIntact(drawing, content, "lanes");
});
