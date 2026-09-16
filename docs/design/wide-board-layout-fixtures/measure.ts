// Measures every fixture and every vault board as a reader gets it: the fit in
// the reference pane, the page, the rows and columns, the routes through
// cards, the share of route ink in margin corridors, the bends per route and
// the labels off their own route. The numbers in docs/design/layout-rules.md
// come from here, and src/runtime/semantic-renderer/tests/wide-boards.test.ts
// holds the same measurements through the same helpers.
//
// Run from the repository root:
//   bun docs/design/wide-board-layout-fixtures/measure.ts [outdir]
// ALL=1 measures every variant of every board rather than the current one;
// PICTURES=1 writes a PNG of each drawing to outdir (default .skill-evals/repro).
// To measure a layout experiment, copy src to a scratch directory, symlink
// node_modules, mutate COMPOUND_OPTIONS there and run this script against it.
import fs from "node:fs";
import path from "node:path";
import { parseSemanticBoard, VariantContentSchema } from "@/shared/semantic-board/index";
import { REFERENCE_PANE, fitIn } from "@/shared/shell-geometry/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { settleIn } from "@/runtime/semantic-renderer/lib/layout/compound";
import { measureArchitecture } from "@/runtime/semantic-renderer/lib/measurement";
import { withStepLines } from "@/runtime/semantic-renderer/lib/step-lines";
import {
	fitOf,
	flankFanOf,
	inkOf,
	labelsOffRuns,
	routesThroughCards,
} from "@/runtime/semantic-renderer/tests/drawn-ink";

const fixtures = "docs/design/wide-board-layout-fixtures";
const vault = ".archboard/vault";
const out = process.argv[2] ?? ".skill-evals/repro";
const every = process.env["ALL"] === "1";
const pictures = process.env["PICTURES"] === "1";
const rasterizer = pictures
	? (await import("@/runtime/semantic-rasterizer/index")).createSemanticRasterizer({})
	: null;

/** One thing to measure: a board's variant, or a fixture. */
interface Item {
	readonly name: string;
	readonly variant: string;
	readonly content: unknown;
}

const items: Item[] = [];
for (const rep of ["1", "2", "3"]) {
	items.push({
		name: `flask-map-${rep}`,
		variant: "fixture",
		content: JSON.parse(fs.readFileSync(`${fixtures}/flask-map-${rep}.content.json`, "utf8")),
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

console.log(`reference pane ${REFERENCE_PANE.width}x${REFERENCE_PANE.height}`);
console.log(
	"board | variant | nodes | edges | reads | page WxH | fit | down: page, fit, bends | right | down folded | right folded | rows | cols | through cards | flank fan | corridor% | bends/route | labels off runs",
);
for (const item of items) {
	const content = VariantContentSchema.parse(item.content);
	const drawn = await renderArchitecture({ content, theme: "light", fonts: "embedded" });
	const boxes = Object.values(drawn.atlas.nodes);
	const direction = `${drawn.readingDirection ?? "-"}${drawn.svg.includes("data-reading-wrapped") ? " folded" : ""}`;
	// Every reading of a first render, so the note can say what the others cost.
	const stepped = withStepLines(content).content;
	const readings = [
		{ direction: "down", wrapped: false },
		{ direction: "right", wrapped: false },
		{ direction: "down", wrapped: true },
		{ direction: "right", wrapped: true },
	] as const;
	const each = await Promise.all(
		readings.map(async (reading) => {
			try {
				const read = await settleIn(reading, stepped, measureArchitecture(stepped), undefined);
				const bends =
					read.edges.reduce(
						(total, { curve }) => total + curve.segments.filter((s) => s.kind === "cubic").length,
						0,
					) / Math.max(1, read.edges.length);
				return `${Math.round(read.width)}x${Math.round(read.height)}, ${fitIn(read).toFixed(2)}, ${bends.toFixed(1)}`;
			} catch (error) {
				return `throws ${String(error).slice(0, 40)}`;
			}
		}),
	);
	const rows = new Set(boxes.map((box) => Math.round(box.y / 20))).size;
	const cols = new Set(boxes.map((box) => Math.round(box.x / 20))).size;
	const ink = inkOf(drawn);
	console.log(
		[
			item.name,
			item.variant,
			content.nodes.length,
			content.edges.length,
			direction,
			`${Math.round(drawn.width)}x${Math.round(drawn.height)}`,
			fitOf(drawn).toFixed(2),
			each[0],
			each[1],
			each[2],
			each[3],
			rows,
			cols,
			routesThroughCards(drawn, content).length,
			flankFanOf(drawn, content),
			(100 * ink.corridor).toFixed(0),
			ink.bends.toFixed(1),
			labelsOffRuns(drawn).length,
		].join(" | "),
	);
	if (rasterizer !== null) {
		const shot = await rasterizer.rasterize({
			svg: drawn.svg,
			width: drawn.width,
			height: drawn.height,
			scale: 1,
		});
		fs.mkdirSync(out, { recursive: true });
		const stem = `${item.name} ${item.variant}`.replace(/[^A-Za-z0-9]+/g, "-");
		fs.writeFileSync(path.join(out, `${stem}.png`), shot.png);
	}
}
await rasterizer?.stop();
