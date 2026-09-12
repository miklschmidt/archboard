// Showing one board's other states: the drafts proposed against the current
// architecture, and the states that used to be current.
//
// A proposal nobody can reach is a proposal nobody reviews. These check that a
// board with a family of variants offers the family, that choosing one is
// reading rather than editing — the pane asks the server for that variant and
// writes nothing — and that a board with one state offers no choice at all.

import { expect, test } from "bun:test";
import { act, fireEvent } from "@testing-library/react";

import {
	drawing,
	mountStage,
	renderCalls,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/**
 * One board document with a family of variants.
 * @param variants The variants, in the order the board states them.
 * @returns The document its route answers with.
 */
function boardOf(variants: readonly Record<string, unknown>[]): Record<string, unknown> {
	return {
		schemaVersion: "1.0.0",
		kind: "semantic-board",
		id: "b1",
		name: "pipeline",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		current: "v1",
		variants,
	};
}

/** The current architecture. */
const AS_IT_IS = {
	id: "v1",
	name: "as it is",
	lifecycle: "current",
	content: { nodes: [{ id: "n1", name: "board-io", kind: "module" }], edges: [] },
};

/** A draft proposed against it. */
const PROPOSED = {
	id: "v2",
	name: "Semantic boards",
	lifecycle: "draft",
	parent: "v1",
	content: { nodes: [{ id: "n1", name: "board-io", kind: "module" }], edges: [] },
};

/**
 * Put a board and a drawing of one of its variants in front of a pane.
 * @param variants The board's variants.
 * @param shown Which variant the drawing says it is of.
 */
function serving(variants: readonly Record<string, unknown>[], shown = AS_IT_IS): void {
	server.documents["pipeline"] = boardOf(variants);
	server.reply = {
		status: 200,
		body: {
			...drawing(1),
			variant: { id: shown.id, name: shown.name, lifecycle: shown.lifecycle },
		},
	};
}

/**
 * Every variant button on screen, in order.
 * @returns The buttons.
 */
function choices(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='semantic-variant-choice']")];
}

/** A pane whose choice nothing records, for cases that do not read it. */
function ignoreChoice(): void {
	// Which variant a pane shows is the shell's; these cases ask other questions.
}

test("a board with a proposal offers both states and says where each one stands", async () => {
	serving([AS_IT_IS, PROPOSED]);
	const picked: (string | null)[] = [];
	/**
	 * Record the state the pane reported.
	 * @param variant The variant's id, or null.
	 */
	function record(variant: string | null): void {
		picked.push(variant);
	}
	mountStage(null, { onVariantChange: record });
	await settle();
	// The name alone does not say whether a state is the architecture or a
	// suggestion about it, so each button says both.
	expect(choices().map((one) => one.textContent)).toEqual([
		"as it iscurrent",
		"Semantic boardsdraft",
	]);
	expect(choices()[0]?.getAttribute("aria-pressed")).toBe("true");

	act(() => {
		fireEvent.click(choices()[1]!);
	});
	// Reported upward, not decided here: two panes hold two answers, and the one
	// a pane shows belongs in its board key.
	expect(picked).toEqual(["v2"]);
	// The current state is asked for as the absence of a variant, so a pane on it
	// follows the designation rather than pinning itself to an id that stops
	// being current the day somebody adopts the draft.
	act(() => {
		fireEvent.click(choices()[0]!);
	});
	expect(picked).toEqual(["v2", null]);
});

test("the variant the pane is told to show rides in the request", async () => {
	serving([AS_IT_IS, PROPOSED], PROPOSED);
	mountStage(null, { variant: "v2", onVariantChange: ignoreChoice });
	await settle();
	expect(renderCalls().at(-1)).toContain("variant=v2");
	expect(choices()[1]?.getAttribute("aria-pressed")).toBe("true");
});

test("a board with one state says which one it is without offering a choice", async () => {
	serving([AS_IT_IS]);
	mountStage(null, { onVariantChange: ignoreChoice });
	await settle();
	expect(choices()).toHaveLength(0);
	// Still said, though: what else could be read and what is being read are two
	// questions, and somebody who followed a link here has only asked the second.
	const said = document.querySelector<HTMLElement>("[data-slot='semantic-variant-showing']");
	expect(said?.textContent).toBe("as it iscurrent");
	expect(said?.getAttribute("data-semantic-lifecycle")).toBe("current");
});
