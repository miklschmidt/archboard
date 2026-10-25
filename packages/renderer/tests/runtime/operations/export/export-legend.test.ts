import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
	appearanceFrom,
	keyOf,
	LINE_MARKS,
	markCounts,
	pictureAppearances,
	type AppliedAppearance,
} from "#shared/rules/render/picture-key.ts";
import type { DrawnBoard } from "@archboard/board/render-reply";
import { exported } from "#tests/runtime/support/export-board.ts";

// An exported picture can carry the legend of what it draws, under it or beside
// it, or be the legend alone (TASK-468). The legend lists what the page's key
// lists for the same picture, read by the same code.

/** One entry of an exported legend: what it keys, its words and its count. */
interface Listed {
	readonly keys: string;
	readonly words: string;
	readonly count?: number | undefined;
}

/**
 * The entries an exported legend lists, in order, and where each stands.
 * @param svg The document.
 * @returns Each entry and the place its words stand.
 */
function listed(svg: string): (Listed & { x: number; y: number })[] {
	return [
		...svg.matchAll(
			/<g data-legend-entry="([^"]+)">[\s\S]*?<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>(?:\n(?:<g [^>]*aria-hidden="true">[^]*?<\/g>)?<text [^>]*>(\d+)<\/text>)?\n?<\/g>/gu,
		),
	].map((found) => ({
		keys: found[1]!,
		x: Number(found[2]),
		y: Number(found[3]),
		words: found[4]!.replace("&amp;", "&"),
		count: found[5] === undefined ? undefined : Number(found[5]),
	}));
}

/**
 * What the page's key lists for a picture: the marks it counts, then the
 * legend's kinds, relationship kinds and line marks.
 * @param drawn The picture, as the page receives it.
 * @returns The entries.
 */
function pageKey(drawn: DrawnBoard): Listed[] {
	const key = keyOf(pictureAppearances(drawn.svg));
	const relationships = key?.relationships ?? [];
	return [
		...markCounts(drawn.changes?.standing ?? {}).map((one) => ({
			keys: "mark",
			words: one.word,
			count: one.count,
		})),
		...(key?.kinds ?? []).map((one) => ({ keys: "kind", words: one.typeName })),
		...relationships.map((one) => ({ keys: "relationship", words: one.typeName })),
		...(relationships.length === 0
			? []
			: LINE_MARKS.map(({ mark, word }) => ({ keys: mark, words: word }))),
	];
}

/**
 * The bottom and right edge of everything a picture draws.
 * @param drawn The picture.
 * @returns How far down and right its subjects reach.
 */
function reach(drawn: DrawnBoard): { bottom: number; right: number } {
	const boxes = (["nodes", "edges", "regions"] as const).flatMap((kind) =>
		Object.values(drawn.atlas[kind]),
	);
	return {
		bottom: Math.max(...boxes.map((box) => box.y + box.height)),
		right: Math.max(...boxes.map((box) => box.x + box.width)),
	};
}

describe("what the legend lists", () => {
	for (const view of [undefined, "Exchange"] as const) {
		test(`the ${view ?? "architecture"} picture's legend lists what the page's key lists for it`, async () => {
			const plain = await exported({ variant: "Worker pool", view });
			const keyed = await exported({ variant: "Worker pool", view, legend: "vertical" });
			const expected = pageKey(plain);
			expect(expected.length).toBeGreaterThan(0);
			expect(
				listed(keyed.svg).map(({ keys, words, count }): Listed => ({ keys, words, count })),
			).toEqual(expected);
		});
	}

	test("a picture without its comparison lists no marks, and the current variant none either", async () => {
		const hidden = await exported({
			variant: "Worker pool",
			comparison: false,
			legend: "horizontal",
		});
		const current = await exported({ legend: "horizontal" });
		for (const drawn of [hidden, current]) {
			expect(listed(drawn.svg).filter((one) => one.keys === "mark")).toEqual([]);
			expect(listed(drawn.svg).length).toBeGreaterThan(0);
		}
	});

	test("the page reads a picture's subjects as a DOM query does", async () => {
		const window = new Window();
		try {
			for (const view of [undefined, "Exchange"]) {
				const { svg } = await exported({ variant: "Worker pool", view, layout: "blocks" });
				const picture = new window.DOMParser().parseFromString(svg, "image/svg+xml");
				const read = new Map<string, AppliedAppearance>();
				for (const group of picture.querySelectorAll("[data-semantic-id][data-type-name]")) {
					const id = group.getAttribute("data-semantic-id")!;
					const icon = group.querySelector("[data-type-icon] svg")?.outerHTML ?? "";
					read.set(
						id,
						appearanceFrom(id, (name) => group.getAttribute(name), icon),
					);
				}
				const scanned = pictureAppearances(svg);
				expect([...scanned.keys()]).toEqual([...read.keys()]);
				for (const [id, { iconSvg: readIcon, ...readFacts }] of read) {
					const { iconSvg: scannedIcon, ...scannedFacts } = scanned.get(id)!;
					expect(scannedFacts).toEqual(readFacts);
					// The same icon, whichever serialiser wrote it out.
					expect(scannedIcon === "").toBe(readIcon === "");
					expect(scannedIcon.match(/ d="/gu)?.length).toBe(readIcon.match(/ d="/gu)?.length);
				}
			}
		} finally {
			await window.happyDOM.close();
		}
	});
});

for (const layout of ["track", "blocks"] as const) {
	describe(`where the legend stands, drawn by ${layout}`, () => {
		test("horizontal: a row under the picture, wrapped at its width", async () => {
			const plain = await exported({ variant: "Worker pool", layout });
			const keyed = await exported({ variant: "Worker pool", layout, legend: "horizontal" });
			const entries = listed(keyed.svg);
			expect(keyed.width).toBe(plain.width);
			expect(keyed.height).toBeGreaterThan(plain.height);
			expect(Math.min(...entries.map((one) => one.y))).toBeGreaterThan(reach(plain).bottom);
			expect(new Set(entries.map((one) => one.y)).size).toBeGreaterThan(1);
			// The picture is drawn as it is without the legend.
			expect(keyed.atlas).toEqual(plain.atlas);
		});

		test("vertical: a column beside the picture", async () => {
			const plain = await exported({ variant: "Worker pool", layout });
			const keyed = await exported({ variant: "Worker pool", layout, legend: "vertical" });
			const entries = listed(keyed.svg);
			expect(keyed.width).toBeGreaterThan(plain.width);
			expect(keyed.height).toBeGreaterThanOrEqual(plain.height);
			expect(Math.min(...entries.map((one) => one.x))).toBeGreaterThan(reach(plain).right);
			expect(new Set(entries.map((one) => one.x)).size).toBe(1);
			expect(keyed.atlas).toEqual(plain.atlas);
		});
	});
}

test("the legend alone draws no subject and lists what the legend beside the picture lists", async () => {
	for (const legend of ["horizontal", "vertical"] as const) {
		const beside = await exported({ variant: "Worker pool", legend });
		const alone = await exported({ variant: "Worker pool", legend, legendOnly: true });
		expect(alone.svg).not.toContain('data-semantic-id="');
		expect(alone.atlas).toEqual({ nodes: {}, edges: {}, regions: {} });
		expect(listed(alone.svg).map((one) => one.words)).toEqual(
			listed(beside.svg).map((one) => one.words),
		);
		expect(alone.width).toBeLessThanOrEqual(beside.width);
		expect(alone.height).toBeLessThan(beside.height);
	}
});
