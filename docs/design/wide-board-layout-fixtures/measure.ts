// Measures the three Flask module maps of docs/design/wide-board-layout.md under
// layout experiments. Run from the repository root; the numbers in that note
// come from here.
// usage: bun docs/design/wide-board-layout-fixtures/measure.ts <baseline|layering|compaction|both> [outdir]
import fs from "node:fs";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { COMPOUND_OPTIONS } from "@/runtime/semantic-renderer/lib/layout/compound-graph";
import { routeLabels, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";

const fixtures = "docs/design/wide-board-layout-fixtures";
const mode = process.argv[2] ?? "baseline";
const out = process.argv[3] ?? ".skill-evals/repro";
const options = COMPOUND_OPTIONS as Record<string, string>;
if (mode === "layering") options["elk.layered.layering.strategy"] = "NETWORK_SIMPLEX";
if (mode === "compaction") {
	options["elk.layered.compaction.postCompaction.strategy"] = "EDGE_LENGTH";
	options["elk.layered.nodePlacement.strategy"] = "NETWORK_SIMPLEX";
}
if (mode === "both") {
	options["elk.layered.layering.strategy"] = "NETWORK_SIMPLEX";
	options["elk.layered.compaction.postCompaction.strategy"] = "EDGE_LENGTH";
	options["elk.layered.nodePlacement.strategy"] = "NETWORK_SIMPLEX";
}
const pictures = process.env["PICTURES"] === "1";
const rasterizer = pictures
	? (await import("@/runtime/semantic-rasterizer/index")).createSemanticRasterizer({})
	: null;

for (const rep of ["1", "2", "3"]) {
	const content = VariantContentSchema.parse(
		JSON.parse(fs.readFileSync(`${fixtures}/flask-map-${rep}.content.json`, "utf8")),
	);
	const drawn = await renderArchitecture({ content, theme: "light", fonts: "embedded" });
	if (rasterizer !== null) {
		const shot = await rasterizer.rasterize({
			svg: drawn.svg,
			width: drawn.width,
			height: drawn.height,
			scale: 1,
		});
		fs.writeFileSync(`${out}/flask-map-${rep}-${mode}.png`, shot.png);
	}
	const nodes = drawn.atlas.nodes;
	const boxes = Object.values(nodes);
	const cardArea = boxes.reduce((sum, box) => sum + box.width * box.height, 0);
	const routes = routePoints(drawn.svg);
	const labels = routeLabels(drawn.svg);
	const westExits = new Map<string, number>();
	let corridor = 0,
		ink = 0,
		west = 0,
		bends = 0;
	const distances: number[] = [];
	for (const edge of content.edges) {
		const route = routes.get(edge.id);
		if (route === undefined) continue;
		const from = nodes[edge.from]!,
			to = nodes[edge.to]!;
		if (Math.abs(route[0]!.x - from.x) < 1) {
			west += 1;
			westExits.set(edge.from, (westExits.get(edge.from) ?? 0) + 1);
		}
		for (let index = 1; index < route.length; index += 1) {
			const a = route[index - 1]!,
				b = route[index]!;
			if (index > 1) {
				const before = route[index - 2]!;
				// A corner is where the run changes axis; crossing bridges are rounded
				// hops and count too, since a reader follows every one of them.
				if ((before.x === a.x) !== (a.x === b.x)) bends += 1;
			}
			const length = Math.hypot(b.x - a.x, b.y - a.y);
			ink += length;
			if (a.x === b.x && !boxes.some((box) => box.x <= a.x && a.x <= box.x + box.width))
				corridor += length;
		}
		const label = labels.get(edge.id);
		if (label === undefined) continue;
		const centre = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
		const gap = (box: typeof to) =>
			Math.hypot(
				Math.max(box.x - centre.x, 0, centre.x - box.x - box.width),
				Math.max(box.y - centre.y, 0, centre.y - box.y - box.height),
			);
		distances.push(Math.min(gap(from), gap(to)));
	}
	const cell = 100;
	const columns = Math.ceil(drawn.width / cell),
		rows = Math.ceil(drawn.height / cell);
	let occupied = 0;
	for (let row = 0; row < rows; row += 1)
		for (let column = 0; column < columns; column += 1) {
			const x = column * cell,
				y = row * cell;
			if (
				boxes.some(
					(box) =>
						box.x < x + cell && box.x + box.width > x && box.y < y + cell && box.y + box.height > y,
				)
			)
				occupied += 1;
		}
	const rowKeys = new Set(boxes.map((box) => Math.round(box.y / 20)));
	const sorted = distances.toSorted((a, b) => a - b);
	const hub = [...westExits.values()].toSorted((a, b) => b - a)[0] ?? 0;
	console.log(
		`${mode} rep${rep}: page ${drawn.width}x${drawn.height} (${(
			(drawn.width * drawn.height) /
			1e6
		).toFixed(
			2,
		)}Mpx), rows ${rowKeys.size}, cards ${((100 * cardArea) / (drawn.width * drawn.height)).toFixed(1)}% of page, cells touched ${((100 * occupied) / (rows * columns)).toFixed(0)}%, west exits ${west}/${content.edges.length} (max per node ${hub}), corridor ink ${((100 * corridor) / ink).toFixed(0)}%, bends ${bends} (${(bends / content.edges.length).toFixed(1)} per edge), label gap median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(0)}px max ${sorted.at(-1)?.toFixed(0)}px over200 ${sorted.filter((d) => d > 200).length}/${sorted.length}`,
	);
}
await rasterizer?.stop();
