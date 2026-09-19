// The reader's measure of an architecture drawing, held on the three Flask
// module maps of docs/design/wide-board-layout.md and on every board in the
// vault. No one measure decides (docs/design/layout-rules.md sections 18 and
// 21): a board may give up fit for a smaller page, or a lane for fewer
// crossings, so each is held to its recorded scorecard as a whole, and is
// never worse on more measures than it is better. Beside that, what a reader
// needs whatever way the page reads and whatever the board's size: no route
// through a card, every label on a straight run of its own route and within
// reach of one of the two cards it joins, and bounded bends. Those are
// thresholds, and the system map is held to them alone: a board that draws
// badly must not be able to record its own drawing as the standard. A board
// the vault gains needs a scorecard of its own.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	parseSemanticBoard,
	VariantContentSchema,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	inkOf,
	labelReachOf,
	labelsOffRuns,
	routesThroughCards,
} from "@/runtime/semantic-renderer/tests/drawn-ink";
import { scorecardOf, verdictOf } from "@/runtime/semantic-renderer/tests/drawn-scorecard";
import first from "../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import second from "../../../../docs/design/wide-board-layout-fixtures/flask-map-2.content.json";
import third from "../../../../docs/design/wide-board-layout-fixtures/flask-map-3.content.json";
import systemMap from "../../../../docs/design/wide-board-layout-fixtures/system-map.content.json";

/**
 * A recorded scorecard: fit, megapixels, card share, route length, bends per
 * route, crossings, lane ink and flank fan, in the order the scorecard prints
 * them, as measured on 2026-09-17 with text measured by the canvas (TASK-247).
 */
type Recorded = readonly [number, number, number, number, number, number, number, number];

/** How far a size may move before it counts as better or worse. */
const SIZE_TOLERANCE = 0.02;

/** Bends per route a board with no allowance of its own may spend: the largest measured, with room. */
const VAULT_BENDS = 3.0;

/**
 * How far a label may sit from the nearer of the two cards its line joins, as
 * a share of the way between them. A label at the midpoint of a straight route
 * reaches half; one at the far card's own distance reaches all of it, which is
 * words stranded off the stretch of page their two cards occupy, where a reader
 * can only learn what they name by tracing the line. Thirteen of the fifteen
 * boards measured for docs/design/layout-rules.md section 25 keep every label
 * inside 0.64 and the widest is 0.94, so this bound is loose today; it is the
 * one a reader can state without knowing how big the board is.
 */
const LABEL_STRAND = 1;

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

/**
 * Each vault board's current variant, drawn first, as recorded.
 *
 * Re-recorded on 2026-09-17 when TASK-257 rewrote the vault against the code
 * as it now stands. Every board grew: the boards carry the subsystems built
 * since September and the callers ADR 0029 asks for in place of the cards that
 * only pointed at another board, so they are bigger pages at a smaller fit than
 * the September recording, and these numbers are that drawing, not a target.
 */
const VAULT: Readonly<Record<string, Recorded>> = {
	// Re-recorded 2026-09-19 (TASK-276) after removing forced flank exits.
	// These two boards trade fit and
	// wiring length for smaller pages under the requested routing policy;
	// their independent legibility bounds below are unchanged.
	"Agent workbench": [0.407, 4.257, 0.107, 17490.5, 2, 10, 0.104, 1],
	Archboard: [0.709, 1.43, 0.163, 4553, 1.333, 0, 0.076, 1],
	"Board persistence": [0.609, 1.634, 0.177, 6733, 1.333, 7, 0.052, 3],
	"Board rasterizer": [0.697, 2.195, 0.134, 5258, 1.273, 1, 0.061, 1],
	"Board viewer": [0.413, 2.988, 0.105, 10781, 1.889, 7, 0, 1],
	"Browser application": [0.573, 2.584, 0.107, 9432, 1.571, 6, 0, 1],
	"Canvas server": [0.518, 4.172, 0.098, 25511, 2, 26, 0.076, 1],
	"Codex session": [0.604, 2.007, 0.104, 8321, 2.167, 5, 0.198, 1],
	"Codex workhorse": [0.581, 1.748, 0.205, 8424, 1.231, 3, 0.204, 3],
	"Command dispatch": [0.836, 1.272, 0.168, 2953, 1, 0, 0, 0],
	"Command interface": [0.424, 5.079, 0.088, 18116, 1.81, 13, 0.042, 1],
	"Renderer layout": [0.558, 1.764, 0.2, 6363, 1.231, 0, 0.061, 1],
	"Semantic renderer": [0.549, 2.631, 0.166, 18527, 1.727, 15, 0.206, 1],
	"Skill evaluation": [0.399, 3.848, 0.168, 13323, 1.25, 3, 0.03, 1],
	"Voice coordinator": [0.491, 2.152, 0.184, 6376, 1.538, 2, 0.159, 1],
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
 * What every drawing owes its reader, whichever way it reads and whatever its
 * size: nothing drawn over a card, every label on a straight run of its own
 * route and within reach of one of its cards, and bends a reader can follow.
 * These are thresholds, not recordings: a board meets them or it does not.
 * @param drawing The rendered board.
 * @param content The board.
 * @param bends The bends per route it may spend.
 */
function expectLegible(drawing: RenderedDiagram, content: VariantContent, bends: number) {
	expect(routesThroughCards(drawing, content), "routes through cards").toEqual([]);
	expect(labelsOffRuns(drawing), "labels off a straight run of their own route").toEqual([]);
	expect(inkOf(drawing).bends, "bends per route").toBeLessThanOrEqual(bends);
	expect(
		labelReachOf(drawing).strand,
		"a label farther from its nearer card than its two cards are apart",
	).toBeLessThanOrEqual(LABEL_STRAND);
}

/**
 * What every drawing owes its reader, and that it is no worse than its
 * recorded scorecard on more measures than it is better.
 * @param content The board.
 * @param recorded Its recorded scorecard.
 * @param bends The bends per route it may spend.
 */
async function expectReadable(content: VariantContent, recorded: Recorded, bends: number) {
	const drawing = await renderArchitecture({ content, theme: "light" });
	expectLegible(drawing, content, bends);
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

describe("a system map at twenty parts is legible without a view", () => {
	// Nineteen parts and thirty-two relationships, the shape of board an agent
	// draws when asked to map a system whole (docs/design/layout-rules.md
	// section 25). It is held to what a reader needs and never to a scorecard of
	// its own: a recording of this drawing would pass forever, and this drawing
	// is one a reader failed.
	test("no route through a card, labels on their runs and within reach of a card, bounded bends", async () => {
		const content = VariantContentSchema.parse(systemMap);
		const drawing = await renderArchitecture({ content, theme: "light" });
		expectLegible(drawing, content, VAULT_BENDS);
	});
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
