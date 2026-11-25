import { expect, test } from "bun:test";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import type { ExportFrame } from "#shared/protocol/generated/core/types.ts";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { paintedBody } from "#tests/runtime/support/export-picture.ts";

// An exported picture says what its lens did on one line above the drawing,
// under its title (TASK-663.10): how many lines the lens left out, or that the
// lens drew none here and the picture shows every relationship instead.

const CONTENT = orderedFixture({
	nodes: [
		{ id: "a", name: "Alpha", kind: "service" },
		{ id: "b", name: "Beta", kind: "service" },
	],
	edges: [{ id: "ab", from: "a", to: "b", kind: "http", effect: "mutation", label: "save" }],
});

/**
 * Draw the picture, with an export frame or without one.
 * @param frame What the export carries beside the drawing.
 * @returns The drawn document.
 */
function drawn(frame?: ExportFrame): Promise<RenderedDiagram> {
	return renderArchitecture({
		policy: defaultSemanticPolicy(),
		content: CONTENT,
		theme: "light",
		...(frame === undefined ? {} : { frame }),
	});
}

/**
 * The words an export slot sets, and the height they stand at.
 * @param svg The document.
 * @param slot The slot.
 * @returns Its words and height, or undefined when the document has no such slot.
 */
function slotted(svg: string, slot: string): { words: string; y: number } | undefined {
	const found = new RegExp(
		`<g data-slot="${slot}">(?:<g [^>]*aria-hidden="true">[^]*?</g>)?<text [^>]*?y="([\\d.]+)"[^>]*>([^<]*)</text></g>`,
		"u",
	).exec(svg);
	return found === null ? undefined : { y: Number(found[1]), words: found[2]! };
}

test("the status line of a lens stands above the picture, which moves down whole under it", async () => {
	const plain = await drawn();
	const stated = await drawn({ leftOut: { lens: "Main lines", count: 66 } });
	const status = slotted(stated.svg, "export-status");
	expect(status?.words).toBe("Main lines · 66 lines left out");
	expect(slotted(plain.svg, "export-status")).toBeUndefined();

	const band = stated.height - plain.height;
	expect(band).toBeGreaterThan(0);
	expect(status!.y).toBeLessThan(band);
	expect(paintedBody(stated.svg)).toContain(
		`<g transform="translate(0 ${band})">${paintedBody(plain.svg)}</g>`,
	);
});

test("a title stands above the status line", async () => {
	const { svg } = await drawn({ title: "Shop", leftOut: { lens: "Main lines", count: 2 } });
	const title = slotted(svg, "export-title")!;
	// The status line stands in the page the title moved down.
	const band = Number(
		/<g transform="translate\(0 ([\d.]+)\)"><g data-slot="export-status">/u.exec(svg)![1],
	);
	const status = slotted(svg, "export-status")!;
	expect(title.y).toBeLessThan(band + status.y);
	expect(band).toBeGreaterThan(title.y);
});

test("a lens that draws nothing here says that the picture shows every relationship", async () => {
	const { svg } = await drawn({ leftOut: { lens: "Side effects", count: 0, showingAll: true } });
	expect(slotted(svg, "export-status")?.words).toBe(
		"Side effects has no lines here · Showing all relationships",
	);
});

test("one line left out is counted in the singular", async () => {
	const { svg } = await drawn({ leftOut: { lens: "Network", count: 1 } });
	expect(slotted(svg, "export-status")?.words).toBe("Network · 1 line left out");
});

test("a lens that keeps every line shows its name without a count", async () => {
	const { svg } = await drawn({ leftOut: { lens: "All relationships", count: 0 } });
	expect(slotted(svg, "export-status")?.words).toBe("All relationships");
});
