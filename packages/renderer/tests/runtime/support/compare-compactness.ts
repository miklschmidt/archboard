// Read saved corpus SVGs without a matching renderer core or atlas.
// Run: bun packages/renderer/tests/runtime/support/compare-compactness.ts <before> <after> <out>.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DiagramBox } from "@archboard/board/render-reply";
import { compactnessOf, type Compactness } from "#tests/runtime/support/drawn-compactness.ts";

/** The dimensions and key convention written by scripts/render-corpus.ts. */
function runOf(dir: string): Record<string, Pick<DiagramBox, "width" | "height">> {
	return JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8"));
}

/** The corpus key fields used by the report. */
function drawingOf(key: string) {
	const [, board, , view, engine] = key.split(" | ");
	return { board: board!, view: view!, engine: engine! };
}

/** The filename convention of a saved corpus SVG. */
function svgFileOf(key: string): string {
	return `${key.replaceAll(/[^\w-]+/gu, "_")}.svg`;
}

/** Every SVG is measured, including unchanged drawings and whole boards. */
function measureCorpus(dir: string): Record<string, Compactness> {
	return Object.fromEntries(
		Object.entries(runOf(dir)).map(([key, drawing]) => [
			key,
			compactnessOf(
				readFileSync(join(dir, "svg", svgFileOf(key)), "utf8"),
				drawing.width,
				drawing.height,
			),
		]),
	);
}

/** Total route length counts every relationship that a reader must follow. */
function routeLength(page: Compactness): number {
	return page.routes.reduce((sum, route) => sum + route.length, 0);
}

function main() {
	const [before, after, out] = process.argv.slice(2);
	if (before === undefined || after === undefined || out === undefined)
		throw new Error("Name the before corpus, after corpus, and output directory.");
	mkdirSync(out, { recursive: true });
	const one = measureCorpus(before),
		other = measureCorpus(after);
	writeFileSync(join(out, "before.json"), JSON.stringify(one));
	writeFileSync(join(out, "after.json"), JSON.stringify(other));
	const comparisons = Object.keys(one)
		.filter((key) => other[key] !== undefined)
		.map((key) => {
			const a = one[key]!,
				b = other[key]!;
			return {
				key,
				areaRatio: b.area / a.area,
				aspectBefore: a.aspect,
				aspectAfter: b.aspect,
				elongationRatio: b.elongation / a.elongation,
				frameEmptyBefore: a.frameEmptyShare,
				frameEmptyAfter: b.frameEmptyShare,
				frames: b.frames.map((frame) => ({
					id: frame.id,
					before: a.frames.find((old) => old.id === frame.id),
					after: frame,
				})),
				routes: b.routes.map((route) => ({
					id: route.id,
					before: a.routes.find((old) => old.id === route.id),
					after: route,
				})),
				routeLengthBefore: routeLength(a),
				routeLengthAfter: routeLength(b),
				routeLengthRatio: routeLength(a) === 0 ? 1 : routeLength(b) / routeLength(a),
				longestRouteBefore: a.longestRoute,
				longestRouteAfter: b.longestRoute,
				longestRouteRatio:
					a.longestRoute.length === 0 ? 1 : b.longestRoute.length / a.longestRoute.length,
			};
		});
	writeFileSync(join(out, "comparisons.json"), JSON.stringify(comparisons, null, 2));
	const report = [
		"# Compactness by board and engine",
		"",
		"Every drawing contributes, including unchanged pictures and whole boards.",
		"Frame empty share measures area not covered by visible member cards. It excludes headers, labels, routes, and clearance.",
		"Nested frames are measured separately. These measures identify candidates for visual inspection, rather than replace it.",
		"",
		"| Board | Engine | Drawings | Total area ratio | Worst area ratio | Aspect growth | Frame empty share before / after | Total route ratio | Longest route before / after | Worst area reading |",
		"| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |",
	];
	const groups = new Map<string, typeof comparisons>();
	for (const row of comparisons) {
		const d = drawingOf(row.key),
			key = `${d.board} | ${d.engine}`;
		const rows = groups.get(key) ?? [];
		rows.push(row);
		groups.set(key, rows);
	}
	for (const [group, rows] of groups) {
		const worst = rows.reduce((a, b) => (a.areaRatio >= b.areaRatio ? a : b));
		const ratio =
			rows.reduce((sum, row) => sum + other[row.key]!.area, 0) /
			rows.reduce((sum, row) => sum + one[row.key]!.area, 0);
		const occupancy = (measured: typeof one) => {
			const frames = rows.flatMap((row) => measured[row.key]!.frames);
			const area = frames.reduce((sum, frame) => sum + frame.area, 0);
			return area === 0
				? 0
				: frames.reduce((sum, frame) => sum + frame.emptyShare * frame.area, 0) / area;
		};
		const lengthRatio =
			rows.reduce((sum, row) => sum + row.routeLengthAfter, 0) /
			rows.reduce((sum, row) => sum + row.routeLengthBefore, 0);
		const longest = (measured: typeof one) =>
			Math.round(Math.max(...rows.map((row) => measured[row.key]!.longestRoute.length)));
		report.push(
			`| ${group} | ${rows.length} | ${ratio.toFixed(3)} | ${worst.areaRatio.toFixed(3)} | ${Math.max(...rows.map((row) => row.elongationRatio)).toFixed(3)} | ${occupancy(one).toFixed(3)} / ${occupancy(other).toFixed(3)} | ${(Number.isNaN(lengthRatio) ? 1 : lengthRatio).toFixed(3)} | ${longest(one)} / ${longest(other)} | ${drawingOf(worst.key).view} |`,
		);
	}
	writeFileSync(join(out, "per-board.md"), report.join("\n") + "\n");
	const whole = comparisons.filter((row) => drawingOf(row.key).view === "(whole board)");
	writeFileSync(join(out, "whole-boards.json"), JSON.stringify(whole, null, 2));
	console.log(
		`${comparisons.length} drawings, ${whole.length} whole boards, ${groups.size} board/engine groups`,
	);
}

if (import.meta.main) main();
