// A line of the overview that joins several relationships stacks their labels,
// one chip for each (ADR 0052). A reader must tell where one relationship's
// words end and the next begin, also when one of them wraps.

import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import { drawnTexts, labelPlates } from "#tests/runtime/support/drawn-text.ts";

/** The face a label's chip is painted in. */
const PILL = "light-dark(var(--slab-face), var(--popover))";

test.each(LayoutEngineSchema.options)(
	"stacked labels are set apart by more than the lines of one label (%s)",
	async (layout) => {
		const long = "Poll and complete owned daemon crypto jobs through the queue";
		const stated = orderedFixture({
			nodes: [
				{ id: "api", name: "C-compatible API", kind: "module" },
				{ id: "core", name: "Rust core", kind: "module" },
			],
			edges: [{ id: "e1", from: "api", to: "core", kind: "call", label: long }],
		});
		// The overview writes the stacked label; no author can, so no schema parses it.
		const content = {
			...stated,
			edges: [{ ...stated.edges[0]!, label: `${long}\nOpen the lifecycle` }],
		};
		const drawing = await renderArchitecture({ content, theme: "light", layout });
		const lines = drawnTexts(drawing.svg)
			.filter(({ subject }) => subject.id === "e1")
			.toSorted((a, b) => a.y - b.y);
		const steps = lines.slice(1).map((line, index) => line.y - lines[index]!.y);
		const last = lines.at(-1)!;
		// The long label wraps, so the plate holds at least three lines.
		expect(lines.length).toBeGreaterThanOrEqual(3);
		expect(last.text).toBe("Open the lifecycle");
		const within = Math.min(...steps.slice(0, -1));
		expect(steps.at(-1)!).toBeGreaterThan(within);
		// The plate holds every line.
		const plate = labelPlates(drawing.svg).get("e1")!;
		expect(last.y).toBeLessThan(plate.y + plate.height);
		// Each relationship's words stand on a chip of their own, as a lone label's do.
		const group = drawing.svg
			.split('data-semantic-id="e1"')
			.find((chunk) => chunk.includes('data-semantic-part="label"'))!;
		const words = group.slice(0, group.indexOf("</g>"));
		expect(words.split(`style="fill:${PILL}"`).length - 1).toBe(2);
		expect(words).not.toContain("<line");
	},
);
