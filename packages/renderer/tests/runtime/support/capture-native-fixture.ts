// Writes the fixture of the core's native render test
// (`crates/archboard-render/tests/native.rs`): one corpus document drawn by the
// WebAssembly core, with the request this host wrote, the icons the core was
// given, and the document the core wrote. The native test draws the same
// request with a native build of the core, Graphviz included, and holds it to
// the same document.
//
// Each solve runs here, one at a time, with the core's `layOutPicture`, as a
// layout worker runs it; a solve's answer depends on its graph alone, so the
// document is the one the worker pool draws.
//
// Run from the repository root, inside `nix develop`, after `bun run build:core`:
//   bun packages/renderer/tests/runtime/support/capture-native-fixture.ts

import { readFileSync, writeFileSync } from "node:fs";
import { projectModel } from "@archboard/model/content";
import { readArchitectureModel } from "@archboard/model/store-read";
import { iconPaths } from "#runtime/operations/icon-paths.ts";
import { loadCore } from "#runtime/services/core.ts";
import { THEME_STYLESHEET } from "#runtime/store/assets.ts";
import { readThemeColors } from "#runtime/store/theme/read.ts";
import { renderArchitecture } from "#shared/rules/render/diagram.ts";
import { installRendererHost } from "#shared/rules/render/host.ts";

/** The corpus drawing the fixture holds: the Nightly batch proposal of the example model. */
const VAULT = "examples/web-shop";
const STATE = "LjzZMsi7";
/** Where the native test reads it. */
const FIXTURE = "crates/archboard-render/tests/fixtures/recommendations.json";

const core = loadCore();
const kept: { request: string; icons: Record<string, readonly string[]> } = {
	request: "",
	icons: {},
};
installRendererHost({
	core: () => ({
		render: (request, host) => {
			kept.request = request;
			return core.render(request, {
				solve: host.solve,
				icons: (names) => {
					const given = host.icons(names);
					Object.assign(kept.icons, given);
					return given;
				},
			});
		},
	}),
	solve: async (graph) => core.layOutPicture(graph),
	themeColors: readThemeColors(readFileSync(THEME_STYLESHEET, "utf8")),
	iconPaths,
});

const model = await readArchitectureModel(VAULT, undefined, undefined, {
	state: STATE,
	compare: false,
});
if (!model.success) throw new Error(`${VAULT} does not read: ${JSON.stringify(model)}`);
const reading = projectModel(model);
const drawn = await renderArchitecture({
	content: reading.content,
	variant: reading.complete,
	policy: model.policy,
	theme: "light",
	layout: "track",
});
const fixture = {
	drawing: `${VAULT} | ${model.manifest.name} | ${STATE} | (whole model) | track | light | plain`,
	request: kept.request,
	icons: kept.icons,
	svg: drawn.svg,
};
writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, "\t")}\n`);
process.stdout.write(`Wrote ${FIXTURE}: ${drawn.svg.length} bytes of SVG.\n`);
