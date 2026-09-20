import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
// The broad corpus protects meaning and clearance, independent of a layout
// engine's choice of ranks, shared ports and route shapes. Numeric comparisons
// are reported by docs/design/wide-board-layout-fixtures/measure.ts.

import { expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VariantContent } from "@/shared/semantic-board/index";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	locateSemanticBoard,
	readSemanticBoardAt,
	readSemanticBoardConfiguration,
} from "@/runtime/semantic-board-store/index";
import { labelsOffRuns, routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";
import first from "../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import third from "../../../../docs/design/wide-board-layout-fixtures/flask-map-3.content.json";
import systemMap from "../../../../docs/design/wide-board-layout-fixtures/system-map.content.json";

// Fit, route length, bends and shared corridors remain measured by the corpus
// script and recorded in the adoption report. They do not impose the retired
// ELK routing style on native Graphviz/libavoid placement (TASK-278).
const FIXTURES = [
	{ name: "flask-map-1", content: first },
	{ name: "flask-map-3", content: third },
	{ name: "system-map", content: systemMap },
];

/** The vault's tracked boards, by name, as their current variant's content. */
function vaultBoards(): { readonly name: string; readonly content: VariantContent }[] {
	const vault = fileURLToPath(new URL("../../../../.archboard/vault/", import.meta.url));
	const copy = mkdtempSync(join(tmpdir(), "archboard-renderer-vault-"));
	try {
		const configured = readSemanticBoardConfiguration(copy);
		return readdirSync(vault)
			.filter((file) => file.endsWith(".semantic.json"))
			.toSorted()
			.map((file) => {
				copyFileSync(join(vault, file), join(copy, file));
				const name = file.slice(0, -".semantic.json".length);
				const read = readSemanticBoardAt(locateSemanticBoard(name, copy), configured);
				if (!read.ok) throw new Error(`the vault board ${file} does not parse`);
				const current = read.board.variants.find(({ id }) => id === read.board.current);
				if (current === undefined)
					throw new Error(`the vault board ${file} has no current variant`);
				return { name: read.board.name, content: current.content };
			});
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
	expect(Object.keys(drawing.atlas.nodes).toSorted()).toEqual(
		content.nodes.map(({ id }) => id).toSorted(),
	);
	expect(Object.keys(drawing.atlas.edges).toSorted()).toEqual(
		content.edges.map(({ id }) => id).toSorted(),
	);
}

for (const board of [...FIXTURES, ...vaultBoards()]) {
	test(`${board.name}: complete architecture, clear cards, labels on their own routes`, async () => {
		const content = orderedFixture(board.content);
		const drawing = await renderArchitecture({ content, theme: "light" });
		expectIntact(drawing, content);
	});
}
