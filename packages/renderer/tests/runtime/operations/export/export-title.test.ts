import { expect, test } from "bun:test";
import type { DiagramBox, DrawnBoard } from "@archboard/board/render-reply";
import { exported, paintedBody } from "#tests/runtime/support/export-board.ts";

// A title is drawn above an exported picture (TASK-467): the drawing moves down
// whole under it and is otherwise the drawing without it.

/**
 * The title an exported document draws, and where.
 * @param svg The document.
 * @returns Its words and the line it stands on, or undefined when it has none.
 */
function titleOf(svg: string): { words: string; y: number } | undefined {
	const found =
		/<g data-slot="export-title">(?:<g [^>]*aria-hidden="true">[^]*?<\/g>)?<text [^>]*?y="([\d.]+)"[^>]*>([^<]*)<\/text><\/g>/u.exec(
			svg,
		);
	return found === null ? undefined : { y: Number(found[1]), words: found[2]! };
}

/**
 * Every box of a drawing.
 * @param drawn The drawing.
 * @returns Its subjects' boxes, by kind and id.
 */
function boxes(drawn: DrawnBoard): [string, DiagramBox][] {
	return (["nodes", "edges", "regions"] as const).flatMap((kind) =>
		Object.entries(drawn.atlas[kind]).map(([id, box]): [string, DiagramBox] => [
			`${kind}/${id}`,
			box,
		]),
	);
}

for (const [layout, view] of [
	["track", undefined],
	["blocks", undefined],
	["blocks", "Exchange"],
] as const) {
	test(`a title stands above the ${view ?? "architecture"} drawn by ${layout}, which moves down whole`, async () => {
		const plain = await exported({ variant: "Worker pool", layout, view });
		const titled = await exported({
			variant: "Worker pool",
			layout,
			view,
			title: "Ingest & <queue>",
		});
		const title = titleOf(titled.svg);
		expect(title?.words).toBe("Ingest &amp; &lt;queue&gt;");
		expect(titleOf(plain.svg)).toBeUndefined();
		// A reader who cannot see the picture hears the title it draws.
		expect(titled.svg).toContain(`aria-label="${title!.words}.`);

		// The drawing is the untitled one, moved down by the band the title takes.
		const band = titled.height - plain.height;
		expect(band).toBeGreaterThan(0);
		expect(titled.width).toBe(plain.width);
		expect(paintedBody(titled.svg)).toContain(
			`<g transform="translate(0 ${band})">${paintedBody(plain.svg)}</g>`,
		);
		// Every subject keeps its size and moves by the band, so none reaches up into it.
		for (const [key, box] of boxes(plain)) {
			const moved = Object.fromEntries(boxes(titled))[key]!;
			expect([moved.x, moved.width, moved.height], key).toEqual([box.x, box.width, box.height]);
			expect(moved.y - box.y, key).toBeCloseTo(band, 6);
		}
		expect(title!.y).toBeLessThan(band);
	});
}

test("a title wider than the picture widens the page to hold it", async () => {
	const plain = await exported({ view: "Intake" });
	const words = "A title that runs on well past the width of a two-card view of the intake";
	const titled = await exported({ view: "Intake", title: words });
	expect(titled.width).toBeGreaterThan(plain.width);
});

test("asked for without words, the title names the board, the view, the variant and what it is compared with", async () => {
	const compared = titleOf(
		(await exported({ variant: "Worker pool", view: "Intake", title: true })).svg,
	);
	for (const name of ["Ingest", "Intake", "Worker pool", "As built"]) {
		expect(compared?.words).toContain(name);
	}
	// Without the comparison, the picture is compared with nothing, and the title says no more.
	const plain = titleOf(
		(await exported({ variant: "Worker pool", comparison: false, title: true })).svg,
	);
	expect(plain?.words).toContain("Worker pool");
	expect(plain?.words).not.toContain("As built");
});
