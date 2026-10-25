import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
// The broad corpus protects meaning and clearance, independent of a layout
// engine's choice of ranks, shared ports and route shapes. Numeric comparisons
// are reported by docs/design/wide-board-layout-fixtures/measure.ts.

import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LAYOUT_ENGINE, LayoutEngineSchema } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { locateSemanticBoard } from "@archboard/board/address";
import { readSemanticBoardAt } from "@archboard/board/store-read";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { labelsOffRuns, routesThroughCards } from "#tests/runtime/support/drawn-ink.ts";
import {
	labelsAcrossWalls,
	nearLanes,
	runsUnderLabels,
	slants,
	wallHugs,
} from "#tests/runtime/support/drawn-checks.ts";
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
				const name = file.slice(0, -".semantic.json".length);
				const read = readSemanticBoardAt(copy, locateSemanticBoard(name, copy), configured);
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

/**
 * Semantic completeness and readable labels across the measured corpus.
 * @param drawing The rendered board.
 * @param content Its authored architecture.
 */
function expectIntact(drawing: RenderedDiagram, content: VariantContent) {
	expect(routesThroughCards(drawing, content), "routes through cards").toEqual([]);
	expect(labelsOffRuns(drawing), "labels off their own route").toEqual([]);
	expect(runsUnderLabels(drawing), "routes under another's label").toEqual([]);
	expect(Object.keys(drawing.atlas.nodes).toSorted()).toEqual(
		content.nodes.map(({ id }) => id).toSorted(),
	);
	expect(Object.keys(drawing.atlas.edges).toSorted()).toEqual(
		content.edges.map(({ id }) => id).toSorted(),
	);
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

// Every board on both engines gets the rendering deadline, inside the preload's
// 60 s wall-clock ceiling (docs/agents/test-suite.md).
// The vault's boards are drawn with the vault's policy, so its groups gather.
const cases: {
	name: string;
	content: Parameters<typeof orderedFixture>[0];
	policy: SemanticPolicy;
}[] = [
	...FIXTURES.map(({ name, content }) => ({ name, content, policy: DEFAULT_SEMANTIC_POLICY })),
	...boards.map(({ name, content }) => ({ name, content, policy })),
];
for (const board of cases) {
	for (const layout of LayoutEngineSchema.options) {
		const name = `${board.name} (${layout}): complete architecture, clear cards, labels on their own routes`;
		test(
			name,
			async () => {
				const content = orderedFixture(board.content);
				// Each case draws content nothing drew before, so this is a first layout.
				const began = performance.now();
				const drawing = await renderArchitecture({
					content,
					theme: "light",
					layout,
					policy: board.policy,
				});
				const took = performance.now() - began;
				if (layout === DEFAULT_LAYOUT_ENGINE)
					expect(took, "first layout, ms").toBeLessThan(LOADED_LAYOUT_BOUND_MS);
				expectIntact(drawing, content);
				expect(slants(drawing), "routes on a slant").toEqual([]);
				expect(labelsAcrossWalls(drawing), "labels across a container's edge").toEqual([]);
				if (layout === "track") {
					expect(nearLanes(drawing), "lines closer than a lane").toEqual([]);
					expect(wallHugs(drawing), "lines along a container's wall").toEqual([]);
				}
			},
			RENDER_CASE_TIMEOUT_MS,
		);
	}
}
