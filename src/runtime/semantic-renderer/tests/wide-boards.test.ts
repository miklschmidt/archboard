// The broad corpus protects meaning and clearance, independent of a layout
// engine's choice of ranks, shared ports and route shapes. Numeric comparisons
// are reported by docs/design/wide-board-layout-fixtures/measure.ts.

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	parseSemanticBoard,
	VariantContentSchema,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import { labelsOffRuns, routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";
import first from "../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import second from "../../../../docs/design/wide-board-layout-fixtures/flask-map-2.content.json";
import third from "../../../../docs/design/wide-board-layout-fixtures/flask-map-3.content.json";
import systemMap from "../../../../docs/design/wide-board-layout-fixtures/system-map.content.json";

// Fit, route length, bends and shared corridors remain measured by the corpus
// script and recorded in the adoption report. They do not impose the retired
// ELK routing style on native Graphviz/libavoid placement (TASK-278).
const FIXTURES = [
	{ name: "flask-map-1", content: first },
	{ name: "flask-map-2", content: second },
	{ name: "flask-map-3", content: third },
	{ name: "system-map", content: systemMap },
];

/** The vault's tracked boards, by name, as their current variant's content. */
function vaultBoards(): { readonly name: string; readonly content: VariantContent }[] {
	const vault = fileURLToPath(new URL("../../../../.archboard/vault/", import.meta.url));
	return readdirSync(vault)
		.filter((file) => file.endsWith(".semantic.json"))
		.toSorted()
		.map((file) => {
			const parsed = parseSemanticBoard(JSON.parse(readFileSync(vault + file, "utf8")));
			if (!parsed.ok) throw new Error(`the vault board ${file} does not parse`);
			const current = parsed.board.variants.find(({ id }) => id === parsed.board.current);
			if (current === undefined) throw new Error(`the vault board ${file} has no current variant`);
			return { name: parsed.board.name, content: VariantContentSchema.parse(current.content) };
		});
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
		const content = VariantContentSchema.parse(board.content);
		const drawing = await renderArchitecture({ content, theme: "light" });
		expectIntact(drawing, content);
	});
}
