// A shadow may sit under a lifeline, but may never be painted over it (TASK-439).
// Participant shadows are the exception to the shared shadow layer: they travel
// with the sticky head, so their whole reach needs air and a moved head's shade.

import { expect, test } from "bun:test";
import { Window } from "happy-dom";

import { renderSemanticView } from "#runtime/operations/render.ts";
import { SEQUENCE } from "#tests/runtime/support/sequence-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/**
 * One numerical attribute of a painted shape.
 * @param element The SVG shape.
 * @param name Its attribute.
 * @returns The number.
 */
function numberOf(element: { getAttribute(name: string): string | null }, name: string): number {
	return Number(element.getAttribute(name));
}

test.each(["light", "dark"] as const)(
	"no sequence shadow is painted over a lifeline or message (%s)",
	async (theme) => {
		const rendered = await renderSemanticView({
			grammar: "sequence",
			policy: DEFAULT_SEMANTIC_POLICY,
			content: SEQUENCE,
			theme,
		});
		const window = new Window();
		const document = new window.DOMParser().parseFromString(rendered.svg, "image/svg+xml");
		const elements = [...document.querySelectorAll("*")];
		const lifelines = [...document.querySelectorAll('[data-semantic-part="lifeline"] line')];
		const shadows = [...document.querySelectorAll(".ab-shadow")];
		const heads = [...document.querySelectorAll("[data-flow-head]")];
		const messages = [...document.querySelectorAll('[data-semantic-kind="step"] path[marker-end]')];

		expect(lifelines).toHaveLength(SEQUENCE.nodes.length * 2);
		expect(shadows.length).toBeGreaterThan(SEQUENCE.nodes.length);
		expect(messages.length).toBeGreaterThan(0);
		for (const shadow of shadows) {
			for (const message of messages) {
				expect(elements.indexOf(shadow)).toBeLessThan(elements.indexOf(message));
			}
			for (const line of lifelines) {
				if (shadow.hasAttribute("data-semantic-part")) {
					expect(elements.indexOf(shadow)).toBeLessThan(elements.indexOf(line));
				}
				// Shared activation/label shadows are below every line. A head's
				// shadows are above them, but must clear their full strokes.
				if (elements.indexOf(shadow) < elements.indexOf(line)) continue;
				const x = numberOf(line, "x1");
				const stroke = numberOf(line, "stroke-width") / 2;
				for (const patch of shadow.querySelectorAll("rect")) {
					const left = numberOf(patch, "x");
					const right = left + numberOf(patch, "width");
					if (right <= x - stroke || left >= x + stroke) continue;
					expect(numberOf(patch, "y") + numberOf(patch, "height")).toBeLessThanOrEqual(
						numberOf(line, "y1") - stroke,
					);
				}
			}
		}
		for (const head of heads) {
			const participantShadows = [...head.querySelectorAll(".ab-shadow")];
			expect(participantShadows).toHaveLength(SEQUENCE.nodes.length);
			const shade = head.querySelector(".ab-head-shade rect")!;
			const shadeBottom = numberOf(shade, "y") + numberOf(shade, "height");
			// Moving this group moves the shade and every participant shadow
			// together. Its opaque shade hides lines through the entire shadow.
			for (const shadow of participantShadows) {
				for (const patch of shadow.querySelectorAll("rect")) {
					expect(numberOf(patch, "y") + numberOf(patch, "height")).toBeLessThanOrEqual(shadeBottom);
				}
			}
		}
	},
);

test("a sequence reserves only seven more units per flow and keeps the lifeline dash phase", async () => {
	const rendered = await renderSemanticView({
		grammar: "sequence",
		policy: DEFAULT_SEMANTIC_POLICY,
		content: SEQUENCE,
	});
	// The same public fixture measured 379 units before the 6-unit gap grew.
	expect(rendered.height).toBe(386);
	const window = new Window();
	const document = new window.DOMParser().parseFromString(rendered.svg, "image/svg+xml");
	for (const column of document.querySelectorAll('[data-semantic-part="lifeline"]')) {
		const id = column.getAttribute("data-semantic-id")!;
		const card = document.querySelector(
			`[data-flow-head] [data-semantic-id="${id}"] rect[pointer-events="all"]`,
		)!;
		const foot = numberOf(card, "y") + numberOf(card, "height");
		for (const line of column.querySelectorAll("line")) {
			expect(numberOf(line, "y1") - foot).toBe(13);
			expect(line.getAttribute("stroke-dasharray")).toBe("3 5");
			// SVG's positive offset advances the pattern at its new start by
			// exactly the length removed from the original lifeline.
			expect(numberOf(line, "y1") - numberOf(line, "stroke-dashoffset")).toBe(foot + 6);
		}
	}
});
