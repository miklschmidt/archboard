// Writes the fixture of the core's native render test
// (`crates/archboard-render/tests/native.rs`): one corpus board drawn by the
// WebAssembly core, with the request this host wrote, the icons the core was
// given, every solve the render asked for with each graph its Graphviz was
// asked to lay out and what it answered, and the document the core wrote. The
// native test replays those answers to a native build of the core and holds
// it to the same document.
//
// Each solve runs here, one at a time, on a Graphviz as freshly loaded, as a
// worker puts its Graphviz back before every solve (`loadLayoutEngine`), so
// the document is the one the worker pool draws.
//
// Run from the repository root, inside `nix develop`, after `bun run build:core`:
//   bun packages/renderer/tests/runtime/support/capture-native-fixture.ts

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { instance, type Viz } from "@viz-js/viz";
import { locateSemanticBoard } from "@archboard/board/address";
import { readSemanticBoardAt } from "@archboard/board/store-read";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { iconPaths } from "#runtime/operations/icon-paths.ts";
import { loadCore } from "#runtime/services/core.ts";
import { THEME_STYLESHEET } from "#runtime/store/assets.ts";
import { readThemeColors } from "#runtime/store/theme/read.ts";
import { createLayoutEngine } from "#shared/rules/engine/layout-engine.ts";
import { renderBoard } from "#shared/rules/render/board.ts";
import { installRendererHost } from "#shared/rules/render/host.ts";

/** The corpus drawing the fixture holds. */
const VAULT = "examples/web-shop";
const BOARD = "Recommendations";
const VARIANT = "Nightly batch";
/** Where the native test reads it. */
const FIXTURE = "crates/archboard-render/tests/fixtures/recommendations.json";

/** One graph a solve's Graphviz was asked to lay out, and what it answered. */
interface Render {
	readonly graph: unknown;
	readonly answer: string;
}

/** One solve the render asked for, and every graph its Graphviz laid out, in order. */
interface Solve {
	readonly graph: string;
	readonly renders: Render[];
}

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

/**
 * A Graphviz that keeps each graph it lays out and its answer.
 * @param viz Graphviz as freshly loaded.
 * @param renders Where each graph and answer is kept.
 * @returns The same Graphviz, keeping.
 */
function keeping(viz: Viz, renders: Render[]): Viz {
	return new Proxy(viz, {
		/**
		 * The Graphviz's own member, its rendering keeping what it renders.
		 * @param target The Graphviz.
		 * @param name The member.
		 * @returns The member.
		 */
		get(target, name) {
			if (name !== "renderString") return Reflect.get(target, name);
			const render: Viz["renderString"] = (graph, options) => {
				const answer = target.renderString(graph, options);
				renders.push({ graph, answer });
				return answer;
			};
			return render;
		},
	});
}

const core = loadCore();
const solves: Solve[] = [];
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
	solve: async (graph) => {
		const renders: Render[] = [];
		const solve = createLayoutEngine(keeping(await instance(), renders));
		const answer = solve(graph);
		solves.push({ graph, renders });
		return answer;
	},
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
	solves,
	svg: outcome.reply.svg,
};
writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, "\t")}\n`);
console.log(`Wrote ${FIXTURE}: ${solves.length} solves, ${outcome.reply.svg.length} bytes of SVG.`);
