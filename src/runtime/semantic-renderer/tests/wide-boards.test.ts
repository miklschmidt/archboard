// The reader's measure of an architecture drawing (ADR 0028): its fit in the
// reference pane, held on the three Flask module maps of
// docs/design/wide-board-layout.md and on every board in the vault, beside
// what a reader needs whatever way the page reads: no route through a card,
// no card fanning skips down its flank, bounded bends, every label on a
// straight run of its own route, and on the fixtures a bounded share of route
// ink in margin corridors. The floors are the baseline of
// docs/design/layout-rules.md less a small allowance, so a rule change that
// spends fit is seen, and a board the vault gains needs a floor of its own.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	parseSemanticBoard,
	VariantContentSchema,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	fitOf,
	flankFanOf,
	inkOf,
	labelsOffRuns,
	routesThroughCards,
} from "@/runtime/semantic-renderer/tests/drawn-ink";
import first from "../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import second from "../../../../docs/design/wide-board-layout-fixtures/flask-map-2.content.json";
import third from "../../../../docs/design/wide-board-layout-fixtures/flask-map-3.content.json";

/** How far below its recorded fit a board may land before the change is seen. */
const ALLOWANCE = 0.02;

/** Bends per route a vault board may spend: the largest measured, with room. */
const VAULT_BENDS = 3.0;

/** What each fixture may cost: the 2026-09-16 baseline, with a little room. */
const FIXTURES = [
	{ name: "flask-map-1", content: first, fit: 0.46, corridor: 0.25, bends: 2.5 },
	{ name: "flask-map-2", content: second, fit: 0.35, corridor: 0.2, bends: 3.0 },
	{ name: "flask-map-3", content: third, fit: 0.45, corridor: 0.15, bends: 3.5 },
] as const;

/** The fit of each vault board's current variant, drawn first, on 2026-09-16. */
const VAULT_FITS: Readonly<Record<string, number>> = {
	"Agent workbench": 0.59,
	Archboard: 1.0,
	"Board persistence": 0.75,
	"Board viewer": 0.62,
	"Browser application": 0.69,
	"Canvas server": 0.71,
	"Codex session": 0.91,
	"Command dispatch": 0.88,
	"Command interface": 0.88,
	"Renderer layout": 1.0,
	"Semantic renderer": 0.61,
};

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
 * What every drawing owes its reader, whichever way it reads.
 * @param content The board.
 * @param bends The bends per route it may spend.
 */
async function expectReadable(content: VariantContent, bends: number) {
	const drawing = await renderArchitecture({ content, theme: "light" });
	expect(routesThroughCards(drawing, content), "routes through cards").toEqual([]);
	expect(flankFanOf(drawing, content), "skips fanning down one card's flank").toBeLessThanOrEqual(
		1,
	);
	expect(labelsOffRuns(drawing), "labels off a straight run of their own route").toEqual([]);
	expect(inkOf(drawing).bends, "bends per route").toBeLessThanOrEqual(bends);
	return drawing;
}

describe("a wide board reads as its cards and their wiring", () => {
	for (const fixture of FIXTURES) {
		test(`${fixture.name}: fit, no route through a card, no fan of skips, bounded corridors and bends, labels on their runs`, async () => {
			const content = VariantContentSchema.parse(fixture.content);
			const drawing = await expectReadable(content, fixture.bends);
			expect(inkOf(drawing).corridor, "route ink in margin corridors").toBeLessThanOrEqual(
				fixture.corridor,
			);
			expect(fitOf(drawing), "fit in the reference pane").toBeGreaterThanOrEqual(
				fixture.fit - ALLOWANCE,
			);
		});
	}
});

describe("every board in the vault fits the reader's pane no worse than it did", () => {
	for (const board of vaultBoards()) {
		test(`${board.name}: fit, no route through a card, no fan of skips, bounded bends, labels on their runs`, async () => {
			const floor = VAULT_FITS[board.name];
			expect(floor, `${board.name} needs a recorded fit in this suite`).toBeDefined();
			const drawing = await expectReadable(board.content, VAULT_BENDS);
			expect(fitOf(drawing), "fit in the reference pane").toBeGreaterThanOrEqual(
				floor! - ALLOWANCE,
			);
		});
	}
});
