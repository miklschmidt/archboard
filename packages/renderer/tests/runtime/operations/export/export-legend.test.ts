import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { LINE_MARKS, markCounts } from "#shared/rules/render/key-marks.ts";
import type { DrawnBoard } from "@archboard/board/render-reply";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { exported } from "#tests/runtime/support/export-board.ts";

// A render answers each subject's appearance and the picture's key beside the
// document, read by the core off its own scene (TASK-520.08); a pane lists its
// key from them. They must say what the drawn document says: what a DOM query
// of its subject groups finds. An exported picture can carry the legend of what
// it draws, under it or beside it, or be the legend alone (TASK-468), and the
// legend lists what the page's key lists for the same picture.

/** How the picture drew one subject. */
type AppliedAppearance = DrawnBoard["appearances"][number];

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
	const { key } = drawn;
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

/** What a DOM query finds of one subject's group. */
interface Queried {
	getAttribute(name: string): string | null;
	querySelector(selector: string): { readonly outerHTML: string } | null;
}

/**
 * One subject's appearance as its group in the document states it, each fact
 * the group leaves out at its neutral value.
 * @param group The subject's group.
 * @returns Its appearance.
 */
function statedBy(group: Queried): AppliedAppearance {
	/**
	 * One fact the group states.
	 * @param name The attribute that states it.
	 * @param neutral Its value when the group states none.
	 * @returns The fact.
	 */
	const fact = (name: string, neutral: string): string => group.getAttribute(name) ?? neutral;
	return {
		id: group.getAttribute("data-semantic-id")!,
		typeName: fact("data-type-name", ""),
		typeKind: fact("data-type-kind", ""),
		iconSvg: group.querySelector("[data-type-icon] svg")?.outerHTML ?? "",
		depiction: fact("data-depiction", ""),
		typeColor: fact("data-type-color", "neutral"),
		lineColor: fact("data-line-color", "neutral"),
		dash: fact("data-line-dash", "solid"),
		arrowhead: fact("data-arrowhead", "filled"),
	};
}

/**
 * The sample a subject is drawn with: its kind and look, whatever subject it is.
 * @param appearance The subject's appearance.
 * @returns The sample, as one comparable string.
 */
function sampleOf({ id: _id, depiction: _depiction, ...look }: AppliedAppearance): string {
	return JSON.stringify(look);
}

/**
 * Each kind once, by the sample it is drawn with, where the picture first draws it.
 * @param appearances Appearances in drawing order.
 * @returns The last subject drawn with each distinct sample, in that order.
 */
function samples(appearances: readonly AppliedAppearance[]): AppliedAppearance[] {
	return [...new Map(appearances.map((one) => [sampleOf(one), one])).values()];
}

/**
 * The same appearance with its icon reduced to what any serialiser writes of it.
 * @param appearance An appearance.
 * @returns Its facts, and how many paths its icon draws.
 */
function comparable({ iconSvg, ...facts }: AppliedAppearance) {
	return { ...facts, iconPaths: iconSvg.match(/ d="/gu)?.length ?? 0 };
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

	test("the answer's appearances and key say what a DOM query of the document finds", async () => {
		const window = new Window();
		try {
			for (const view of [undefined, "Exchange"]) {
				const drawn = await exported({ variant: "Worker pool", view, layout: "blocks" });
				const picture = new window.DOMParser().parseFromString(drawn.svg, "image/svg+xml");
				// A subject drawn by several groups, a container's frame and its
				// header, keeps its first place and the last group's facts.
				const read = new Map<string, AppliedAppearance>();
				for (const group of picture.querySelectorAll("[data-semantic-id][data-type-name]")) {
					const stated = statedBy(group);
					read.set(stated.id, stated);
				}
				expect(read.size).toBeGreaterThan(0);
				expect(drawn.appearances.map(comparable)).toEqual([...read.values()].map(comparable));
				// The key lists each kind and relationship kind the document draws,
				// once, in the order it draws them.
				const kinds = [...read.values()].filter((one) => one.depiction !== "");
				const relationships = [...read.values()].filter((one) => one.depiction === "");
				expect(drawn.key?.kinds.map(comparable)).toEqual(samples(kinds).map(comparable));
				expect(drawn.key?.relationships.map(comparable)).toEqual(
					samples(relationships).map(comparable),
				);
			}
		} finally {
			await window.happyDOM.close();
		}
	});
});

for (const layout of ["track", "blocks"] as const) {
	describe(`where the legend stands, drawn by ${layout}`, () => {
		test("horizontal: a row under the picture, wrapped at its width", async () => {
			// Long type names force wrapping without depending on one engine's box arrangement.
			const policy = {
				...DEFAULT_SEMANTIC_POLICY,
				relationshipKinds: Object.fromEntries(
					Object.entries(DEFAULT_SEMANTIC_POLICY.relationshipKinds).map(([kind, style]) => [
						kind,
						{
							...style,
							name: Array.from({ length: 14 }, () => style.name).join(" "),
						},
					]),
				),
			};
			const plain = await exported({ variant: "Worker pool", layout }, policy);
			const keyed = await exported(
				{ variant: "Worker pool", layout, legend: "horizontal" },
				policy,
			);
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
