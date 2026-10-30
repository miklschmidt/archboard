// Writes the fixture of the core's native render test
// (`crates/archboard-render/tests/native.rs`): one corpus board drawn by the
// WebAssembly core, with the request this host wrote, the icons the core was
// given, and the document the core wrote. The native test draws the same
// request with a native build of the core, Graphviz included, and holds it to
// the same document.
//
// Each solve runs here, one at a time, with the core's `layOutBoard`, as a
// layout worker runs it; a solve's answer depends on its graph alone, so the
// document is the one the worker pool draws.
//
// Run from the repository root, inside `nix develop`, after `bun run build:core`:
//   bun packages/renderer/tests/runtime/support/capture-native-fixture.ts

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateSemanticBoard } from "@archboard/board/address";
import { readSemanticBoardAt } from "@archboard/board/store-read";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { iconPaths } from "#runtime/operations/icon-paths.ts";
import { loadCore } from "#runtime/services/core.ts";
import { THEME_STYLESHEET } from "#runtime/store/assets.ts";
import { readThemeColors } from "#runtime/store/theme/read.ts";
import { renderBoard } from "#shared/rules/render/board.ts";
import { installRendererHost } from "#shared/rules/render/host.ts";

/** The corpus drawing the fixture holds. */
const VAULT = "examples/web-shop";
const BOARD = "Recommendations";
const VARIANT = "Nightly batch";
/** Where the native test reads it. */
const FIXTURE = "crates/archboard-render/tests/fixtures/recommendations.json";

/**
 * Read the board from a copy of its vault, so the vault is never touched.
 * @returns The board and the vault's policy.
 */
function readBoard() {
	const copy = mkdtempSync(join(tmpdir(), "archboard-native-fixture-"));
	try {
		mkdirSync(join(copy, ".archboard"), { recursive: true });
		copyFileSync(join(VAULT, ".archboard", "config.yaml"), join(copy, ".archboard", "config.yaml"));
		copyFileSync(join(VAULT, `${BOARD}.semantic.json`), join(copy, `${BOARD}.semantic.json`));
		const configured = readSemanticBoardConfiguration(copy);
		const read = readSemanticBoardAt(copy, locateSemanticBoard(BOARD, copy), configured);
		if (!read.ok) throw new Error(`${BOARD} does not read: ${JSON.stringify(read)}`);
		return { board: read.board, policy: configured.configuration };
	} finally {
		rmSync(copy, { recursive: true, force: true });
	}
}

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
	solve: async (graph) => core.layOutBoard(graph),
	themeColors: readThemeColors(readFileSync(THEME_STYLESHEET, "utf8")),
	iconPaths,
});

const { board, policy } = readBoard();
const outcome = await renderBoard(
	board,
	{ variant: VARIANT, comparison: false, theme: "light", layout: "track" },
	policy,
);
if (!outcome.ok || !("svg" in outcome.reply)) {
	throw new Error(`${BOARD} ${VARIANT} drew nothing: ${JSON.stringify(outcome)}`);
}
const fixture = {
	drawing: `${VAULT} | ${BOARD} | ${VARIANT} | overview | track | light | plain`,
	request: kept.request,
	icons: kept.icons,
	svg: outcome.reply.svg,
};
writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, "\t")}\n`);
process.stdout.write(`Wrote ${FIXTURE}: ${outcome.reply.svg.length} bytes of SVG.\n`);
