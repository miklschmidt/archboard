import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
// The broad corpus protects meaning and clearance, independent of a layout
// engine's choice of ranks, shared ports and route shapes. Numeric comparisons
// are reported by docs/design/wide-board-layout-fixtures/measure.ts.

import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LAYOUT_ENGINE, LayoutEngineSchema } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import type { SemanticPolicy } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { decodeSemanticBoardDocument } from "@archboard/board/store-read";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { declareTestWallClockBudget } from "../../../../../../tests/system/repository-policy/support/test-wall-clock.ts";
import first from "../../../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import third from "../../../../../../docs/design/wide-board-layout-fixtures/flask-map-3.content.json";
import systemMap from "../../../../../../docs/design/wide-board-layout-fixtures/system-map.content.json";

// Fit, route length, bends and shared corridors remain measured by the corpus
// script and recorded in the adoption report. They do not impose one engine's
// routing style on another (TASK-278).
const FIXTURES = [
	{ name: "flask-map-1", content: first },
	{ name: "flask-map-3", content: third },
	{ name: "system-map", content: systemMap },
];

/** The tracked vault's policy and its boards, by name, as their current variant's content. */
function vaultBoards(): {
	readonly policy: SemanticPolicy;
	readonly boards: { readonly name: string; readonly content: VariantContent }[];
} {
	const vault = fileURLToPath(new URL("../../../../../../.archboard/vault/", import.meta.url));
	const copy = mkdtempSync(join(tmpdir(), "archboard-renderer-vault-"));
	try {
		mkdirSync(join(copy, ".archboard"));
		copyFileSync(join(vault, ".archboard", "config.yaml"), join(copy, ".archboard", "config.yaml"));
		const configured = readSemanticBoardConfiguration(copy);
		const boards = readdirSync(vault)
			.filter((file) => file.endsWith(".semantic.json"))
			.toSorted()
			.map((file) => {
				copyFileSync(join(vault, file), join(copy, file));
				const read = decodeSemanticBoardDocument(
					JSON.parse(readFileSync(join(copy, file), "utf8")),
				);
				if (!read.ok) throw new Error(`the vault board ${file} does not parse`);
				const current = read.board.variants.find(({ id }) => id === read.board.current);
				if (current === undefined)
					throw new Error(`the vault board ${file} has no current variant`);
				return { name: read.board.name, content: current.content };
			});
		return { policy: configured.configuration, boards };
	} finally {
		rmSync(copy, { recursive: true, force: true });
	}
}

const { policy, boards } = vaultBoards();

/**
 * Local first layouts keep three times the 1 s render budget (TASK-377).
 * Hosted CI recorded 45.3 s layouts, so both rendering limits allow 60 s
 * there (TASK-451). CI measures completion on a shared runner. The local
 * bound still catches a layout grown several times slower.
 */
const HOSTED_RENDER_TIMEOUT_MS = 60_000;
const LOADED_LAYOUT_BOUND_MS = process.env["CI"] === "true" ? HOSTED_RENDER_TIMEOUT_MS : 3 * 1000;
const RENDER_CASE_TIMEOUT_MS = process.env["CI"] === "true" ? HOSTED_RENDER_TIMEOUT_MS : 20_000;

/**
 * The outer bound of the two vault boards whose Blocks layout is genuinely
 * heavy, past the preload's 60 s ceiling: about two and a half times the
 * 47.85 s Browser application took on the last green hosted run. It holds
 * locally too: Browser application took 52.9 s alone on a loaded machine
 * once it drew the pane vault (TASK-472.05), 18.5 s before.
 */
const TEST_HEAVY_BLOCKS_CASE_MS = 120_000;
/**
 * The outer bound of Codex realtime voice's Blocks layout, about three and a half
 * times Browser application's in the same local run, so about 165 s where Browser
 * application takes 47.85 s on a hosted runner, and half as much again for a slower one.
 */
const TEST_HEAVIEST_BLOCKS_CASE_MS = 240_000;
/** Why each heavy Blocks case takes long: its work is the layout's, and one hosted CI worker does it alone. */
const LIBAVOID_PACKINGS =
	"Its Blocks layout routes the trunks of a six-block cluster with libavoid fifteen times a solve, once for each packing it weighs, over seven solves, and libavoid's nudging solves a region again for every pair of its free segments: the work is the layout's, and one hosted CI worker does it alone";
/** What the two TASK-451 cases measured. */
const TASK_451_EVIDENCE =
	"Browser application 47.85 s and Board viewer 26.6 s on GitHub Actions run 37921029421 (commit 4dcd39b54), Browser application past 60 s on the run of 68e7f0e13; 46.8 s locally with one layout worker, 17.6 s with all; Browser application 52.9 s locally at load 6 after b032fd31b, against 18.5 s before it";
/** The cases that get a budget of their own, by name: every other case keeps the bounds above. */
const HEAVY_BLOCKS = new Map<
	string,
	{ outerBoundMs: number; reason: string; task: `TASK-${string}`; evidence: string }
>([
	[
		"Browser application (blocks)",
		{
			outerBoundMs: TEST_HEAVY_BLOCKS_CASE_MS,
			reason: LIBAVOID_PACKINGS,
			task: "TASK-451",
			evidence: TASK_451_EVIDENCE,
		},
	],
	[
		"Board viewer (blocks)",
		{
			outerBoundMs: TEST_HEAVY_BLOCKS_CASE_MS,
			reason: LIBAVOID_PACKINGS,
			task: "TASK-451",
			evidence: TASK_451_EVIDENCE,
		},
	],
	[
		"Codex realtime voice (blocks)",
		{
			outerBoundMs: TEST_HEAVIEST_BLOCKS_CASE_MS,
			reason: `${LIBAVOID_PACKINGS}. Its board holds 51 parts and 92 relationships in 10 containers`,
			task: "TASK-536",
			evidence:
				"Past 60 s on GitHub Actions run 40201286232 (commit 24d228731); 75.7 s locally at load 8 before TASK-530.05, then 67.6 s at load 5 after it, where Browser application took 19.6 s in the same run",
		},
	],
]);

// Every board on both engines gets the rendering deadline, inside the preload's
// 60 s wall-clock ceiling, but the heavy Blocks cases, which declare their own
// (docs/agents/test-suite.md).
// The vault's boards are drawn with the vault's policy, so its groups gather.
const cases: {
	name: string;
	content: Parameters<typeof orderedFixture>[0];
	policy: SemanticPolicy | undefined;
}[] = [
	...FIXTURES.map(({ name, content }) => ({ name, content, policy: undefined })),
	...boards.map(({ name, content }) => ({ name, content, policy })),
];
for (const board of cases) {
	for (const layout of LayoutEngineSchema.options) {
		const name = `${board.name} (${layout}): complete architecture, clear cards, labels on their own routes`;
		const budget = HEAVY_BLOCKS.get(`${board.name} (${layout})`);
		test(
			name,
			async () => {
				if (budget !== undefined) declareTestWallClockBudget({ test: name, ...budget });
				const content = orderedFixture(board.content);
				// Each case draws content nothing drew before, so this is a first layout.
				const began = performance.now();
				const drawing = await renderArchitecture({
					content,
					theme: "light",
					layout,
					...(board.policy === undefined ? {} : { policy: board.policy }),
				});
				const took = performance.now() - began;
				if (layout === DEFAULT_LAYOUT_ENGINE)
					expect(took, "first layout, ms").toBeLessThan(LOADED_LAYOUT_BOUND_MS);
				expectDrawingIntact(drawing, content, layout);
			},
			budget?.outerBoundMs ?? RENDER_CASE_TIMEOUT_MS,
		);
	}
}
