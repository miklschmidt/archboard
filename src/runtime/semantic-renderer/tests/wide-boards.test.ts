// The reader's measure of an architecture drawing, held on the three Flask
// module maps of docs/design/wide-board-layout.md and on every board in the
// vault. No one measure decides (docs/design/layout-rules.md sections 18 and
// 21): a board may give up fit for a smaller page, or a lane for fewer
// crossings, so each is held to its recorded scorecard as a whole, and is
// never worse on more measures than it is better. Beside that, what a reader
// needs whatever way the page reads: no route through a card, every label on a
// straight run of its own route, and bounded bends. A board the vault gains
// needs a scorecard of its own.

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
	inkOf,
	labelsOffRuns,
	routesThroughCards,
} from "@/runtime/semantic-renderer/tests/drawn-ink";
import { scorecardOf, verdictOf } from "@/runtime/semantic-renderer/tests/drawn-scorecard";
import first from "../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import second from "../../../../docs/design/wide-board-layout-fixtures/flask-map-2.content.json";
import third from "../../../../docs/design/wide-board-layout-fixtures/flask-map-3.content.json";

/**
 * A recorded scorecard: fit, megapixels, card share, route length, bends per
 * route, crossings, lane ink and flank fan, in the order the scorecard prints
 * them, as measured on 2026-09-17 with text measured by the canvas (TASK-247).
 */
type Recorded = readonly [number, number, number, number, number, number, number, number];

/** How far a size may move before it counts as better or worse. */
const SIZE_TOLERANCE = 0.02;

/** Bends per route a vault board may spend: the largest measured, with room. */
const VAULT_BENDS = 3.0;

/** The fixtures, their recorded scorecards, and the bends each may spend. */
const FIXTURES = [
	{
		name: "flask-map-1",
		content: first,
		recorded: [0.5, 4.17, 0.11, 24024, 1.9, 33, 0.07, 1],
		bends: 2.5,
	},
	{
		name: "flask-map-2",
		content: second,
		recorded: [0.44, 4.82, 0.11, 36241, 1.8, 34, 0.23, 3],
		bends: 3.0,
	},
	{
		name: "flask-map-3",
		content: third,
		recorded: [0.5, 3.99, 0.12, 31249, 2, 39, 0.05, 1],
		bends: 3.5,
	},
] as const satisfies readonly {
	name: string;
	content: unknown;
	recorded: Recorded;
	bends: number;
}[];

/** Each vault board's current variant, drawn first, as recorded. */
const VAULT: Readonly<Record<string, Recorded>> = {
	"Agent workbench": [0.75, 1.62, 0.13, 5260, 1.6, 3, 0, 1],
	Archboard: [1, 0.7, 0.16, 3171, 1.3, 0, 0.1, 1],
	"Board persistence": [0.84, 1.26, 0.15, 5914, 1.7, 7, 0.08, 3],
	"Board viewer": [0.68, 1.81, 0.1, 5157, 1.5, 2, 0, 1],
	"Browser application": [0.76, 1.94, 0.1, 5907, 1.5, 5, 0, 0],
	"Canvas server": [0.97, 1.22, 0.17, 7793, 2.1, 9, 0.06, 2],
	"Codex session": [0.99, 1.01, 0.17, 1002, 0.2, 0, 0, 0],
	"Command dispatch": [0.88, 0.92, 0.16, 2738, 1.3, 0, 0, 0],
	"Command interface": [1, 0.73, 0.23, 1696, 0.9, 0, 0.39, 0],
	"Renderer layout": [1, 0.65, 0.17, 1295, 0.8, 0, 0, 0],
	"Semantic renderer": [0.91, 1.05, 0.18, 5713, 1.1, 4, 0.38, 2],
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
 * What every drawing owes its reader, whichever way it reads, and that it is
 * no worse than its recorded scorecard on more measures than it is better.
 * @param content The board.
 * @param recorded Its recorded scorecard.
 * @param bends The bends per route it may spend.
 */
async function expectReadable(content: VariantContent, recorded: Recorded, bends: number) {
	const drawing = await renderArchitecture({ content, theme: "light" });
	expect(routesThroughCards(drawing, content), "routes through cards").toEqual([]);
	expect(labelsOffRuns(drawing), "labels off a straight run of their own route").toEqual([]);
	expect(inkOf(drawing).bends, "bends per route").toBeLessThanOrEqual(bends);
	const measures = scorecardOf(drawing, content);
	// A size counts only past two percent and a count by any amount, as the
	// renderer itself compares drawings (docs/design/layout-rules.md section 21):
	// a route a unit longer is the same drawing to a reader.
	const verdicts = recorded.map((value, index) => {
		const measure = measures[index]!;
		const count = measure.name === "crossings" || measure.name === "flank fan";
		const within =
			Math.abs(measure.value - value) <= SIZE_TOLERANCE * Math.max(value, measure.value);
		return !count && within ? "same" : verdictOf({ ...measure, value }, measure);
	});
	const moved = measures
		.slice(0, recorded.length)
		.map(
			(measure, index) =>
				`${measure.name} ${recorded[index]} -> ${measure.value} ${verdicts[index]}`,
		)
		.filter((line) => !line.endsWith("same"));
	expect(
		verdicts.filter((verdict) => verdict === "worse").length,
		`worse on more measures than better: ${moved.join("; ")}`,
	).toBeLessThanOrEqual(verdicts.filter((verdict) => verdict === "better").length);
}

describe("a wide board reads as its cards and their wiring", () => {
	for (const fixture of FIXTURES) {
		test(`${fixture.name}: no worse on the scorecard, no route through a card, bounded bends, labels on their runs`, async () => {
			await expectReadable(
				VariantContentSchema.parse(fixture.content),
				fixture.recorded,
				fixture.bends,
			);
		});
	}
});

describe("every board in the vault reads no worse than it did", () => {
	for (const board of vaultBoards()) {
		test(`${board.name}: no worse on the scorecard, no route through a card, bounded bends, labels on their runs`, async () => {
			const recorded = VAULT[board.name];
			expect(recorded, `${board.name} needs a recorded scorecard in this suite`).toBeDefined();
			await expectReadable(board.content, recorded!, VAULT_BENDS);
		});
	}
});
