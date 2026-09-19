// Measures every fixture and every vault board on the scorecard a layout change
// is judged by (src/runtime/semantic-renderer/tests/drawn-scorecard.ts): fit,
// page area, how much of the page is card, route length, bends, crossings,
// margin-lane ink, flank fan, how far a label sits from the line it names, the
// corridors two routes share and the two
// invariants. No single measure decides a comparison; the numbers in
// docs/design/layout-rules.md come from here. A fixture is any
// `*.content.json` beside this file.
//
// Run from the repository root:
//   bun docs/design/wide-board-layout-fixtures/measure.ts [outdir]
//
// SAVE=run.json      also write this run's scorecards
// AGAINST=run.json   compare this run with a saved one, measure by measure
// ALL=1              measure every variant of every board, not only the current one
// PICTURES=1         write a PNG of each drawing to outdir (default .skill-evals/repro)
//
// A layout experiment is compared by saving a run on the tree as it is, then
// running again with the experiment applied and AGAINST pointing at the save.
import fs from "node:fs";
import path from "node:path";
import { parseSemanticBoard, VariantContentSchema } from "@/shared/semantic-board/index";
import { REFERENCE_PANE } from "@/shared/shell-geometry/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	scorecardOf,
	verdictOf,
	type Measure,
} from "@/runtime/semantic-renderer/tests/drawn-scorecard";

const fixtures = "docs/design/wide-board-layout-fixtures";
const vault = ".archboard/vault";
const out = process.argv[2] ?? ".skill-evals/repro";
const every = process.env["ALL"] === "1";
const pictures = process.env["PICTURES"] === "1";
const save = process.env["SAVE"];
const against = process.env["AGAINST"];
const rasterizer = pictures
	? (await import("@/runtime/semantic-rasterizer/index")).createSemanticRasterizer({})
	: null;

/** One thing to measure: a board's variant, or a fixture. */
interface Item {
	readonly name: string;
	readonly variant: string;
	readonly content: unknown;
}

/** One board's saved result. */
interface Result {
	readonly page: string;
	readonly reads: string;
	readonly measures: Measure[];
}

const items: Item[] = [];
for (const file of fs
	.readdirSync(fixtures)
	.filter((name) => name.endsWith(".content.json"))
	.toSorted()) {
	items.push({
		name: file.replace(".content.json", ""),
		variant: "fixture",
		content: JSON.parse(fs.readFileSync(path.join(fixtures, file), "utf8")),
	});
}
for (const file of fs
	.readdirSync(vault)
	.filter((name) => name.endsWith(".semantic.json"))
	.toSorted()) {
	const parsed = parseSemanticBoard(JSON.parse(fs.readFileSync(path.join(vault, file), "utf8")));
	if (!parsed.ok) {
		console.error(`unparsed ${file}: ${JSON.stringify(parsed).slice(0, 200)}`);
		continue;
	}
	for (const variant of parsed.board.variants) {
		const current = variant.id === parsed.board.current;
		if (!current && !every) continue;
		items.push({
			name: parsed.board.name,
			variant: `${current ? "*" : ""}${variant.name}`,
			content: variant.content,
		});
	}
}

/**
 * A measure's value as the scorecard prints it.
 * @param measure The measure.
 * @returns The printed value.
 */
function shown(measure: Measure): string {
	return measure.value.toFixed(measure.digits);
}

const saved: Record<string, Result> =
	against === undefined ? {} : JSON.parse(fs.readFileSync(against, "utf8"));
const results: Record<string, Result> = {};

console.log(`reference pane ${REFERENCE_PANE.width}x${REFERENCE_PANE.height}`);
let header = false;
for (const item of items) {
	const content = VariantContentSchema.parse(item.content);
	const drawn = await renderArchitecture({ content, theme: "light", fonts: "embedded" });
	const key = `${item.name} ${item.variant}`;
	const measures = scorecardOf(drawn, content);
	const reads = drawn.readingDirection ?? "-";
	const page = `${Math.round(drawn.width)}x${Math.round(drawn.height)}`;
	results[key] = { page, reads, measures };
	if (!header) {
		console.log(["board", "reads", "page", ...measures.map((measure) => measure.name)].join(" | "));
		header = true;
	}
	console.log([key, reads, page, ...measures.map(shown)].join(" | "));
	if (rasterizer !== null) {
		const shot = await rasterizer.rasterize({
			svg: drawn.svg,
			width: drawn.width,
			height: drawn.height,
			scale: 1,
		});
		fs.mkdirSync(out, { recursive: true });
		fs.writeFileSync(path.join(out, `${key.replace(/[^A-Za-z0-9]+/g, "-")}.png`), shot.png);
	}
}
await rasterizer?.stop();

if (save !== undefined) fs.writeFileSync(save, JSON.stringify(results, null, "\t"));

if (against !== undefined) {
	console.log(`\ncompared with ${against}, measure by measure`);
	for (const [key, result] of Object.entries(results)) {
		const before = saved[key];
		if (before === undefined) {
			console.log(`${key}: not in the saved run`);
			continue;
		}
		const moved: string[] = [];
		const counts = { better: 0, worse: 0 };
		result.measures.forEach((measure, index) => {
			const previous = before.measures[index]!;
			const verdict = verdictOf(previous, measure);
			if (verdict === "same") return;
			if (verdict === "better" || verdict === "worse") counts[verdict] += 1;
			moved.push(`${measure.name} ${shown(previous)} -> ${shown(measure)} ${verdict}`);
		});
		const pageNote = before.page === result.page ? "" : ` page ${before.page} -> ${result.page};`;
		const readNote =
			before.reads === result.reads ? "" : ` reads ${before.reads} -> ${result.reads};`;
		console.log(
			moved.length === 0 && pageNote === "" && readNote === ""
				? `${key}: unchanged`
				: `${key}: ${counts.better} better, ${counts.worse} worse;${readNote}${pageNote} ${moved.join("; ")}`,
		);
	}
}
