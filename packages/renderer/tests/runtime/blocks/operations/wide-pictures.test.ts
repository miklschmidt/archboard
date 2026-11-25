import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
// The broad corpus protects meaning and clearance, independent of a layout
// engine's choice of ranks, shared ports and route shapes. Numeric comparisons
// are reported by docs/design/wide-board-layout-fixtures/measure.ts.

import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { projectModel } from "@archboard/model/content";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { readArchitectureModel } from "@archboard/model/store-read";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import first from "../../../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import third from "../../../../../../docs/design/wide-board-layout-fixtures/flask-map-3.content.json";
import systemMap from "../../../../../../docs/design/wide-board-layout-fixtures/system-map.content.json";

// Fit, route length, bends and shared corridors remain measured by the corpus
// script and recorded in the adoption report. They do not impose a
// routing style (TASK-278).
const FIXTURES = [
	{ name: "flask-map-1", content: first },
	{ name: "flask-map-3", content: third },
	{ name: "system-map", content: systemMap },
];

/** Read only this checkout's current model, with every non-leaf scope open in turn. */
function repositoryReadings() {
	const vault = fileURLToPath(new URL("../../../../../../.archboard/vault/", import.meta.url));
	const model = readArchitectureModel(vault);
	if (!model.success)
		throw new Error(
			`Cannot benchmark current repository architecture at ${vault}: ${JSON.stringify(model)}`,
		);
	if (model.manifest.current === null)
		throw new Error(
			`Cannot benchmark current repository architecture at ${vault}: no current state`,
		);
	const parents = new Set(
		model.modules.flatMap(({ parent }) => (parent === undefined ? [] : [parent])),
	);
	const scopes = [
		{ name: `${model.manifest.name} (root)`, id: null },
		...model.modules
			.filter(({ id }) => parents.has(id))
			.map(({ id, name }) => ({ name: `${name} [${id}]`, id })),
	];
	return scopes.map(({ name, id }) => {
		const projection = projectModel(model, id);
		return {
			name,
			request: {
				content: projection.content,
				policy: model.policy,
				unsettled: projection.unsettled,
			},
		};
	});
}

/**
 * Local first layouts allow three times the 1 s render budget (TASK-377).
 * If this benchmark runs with CI=true, both limits allow 60 s. Hosted
 * runners recorded first layouts up to 45.3 s (TASK-451).
 */
const HOSTED_RENDER_TIMEOUT_MS = 60_000;
const LOADED_LAYOUT_BOUND_MS = process.env["CI"] === "true" ? HOSTED_RENDER_TIMEOUT_MS : 3 * 1000;
const RENDER_CASE_TIMEOUT_MS = process.env["CI"] === "true" ? HOSTED_RENDER_TIMEOUT_MS : 20_000;

// Canonical scopes carry the complete model for container interface meaning.
const cases: { name: string; request: Parameters<typeof renderArchitecture>[0] }[] = [
	...FIXTURES.map(({ name, content }) => ({
		name,
		request: { content: orderedFixture(content), policy: defaultSemanticPolicy() },
	})),
	...repositoryReadings(),
];
for (const reading of cases) {
	const name = `${reading.name}: complete architecture, clear cards, labels on their own routes`;
	test(
		name,
		async () => {
			const { content } = reading.request;
			// Each case draws content nothing drew before, so this is a first layout.
			const began = performance.now();
			const drawing = await renderArchitecture({
				...reading.request,
				theme: "light",
			});
			const took = performance.now() - began;
			expect(took, "first layout, ms").toBeLessThan(LOADED_LAYOUT_BOUND_MS);
			expectDrawingIntact(drawing, content);
		},
		RENDER_CASE_TIMEOUT_MS,
	);
}
