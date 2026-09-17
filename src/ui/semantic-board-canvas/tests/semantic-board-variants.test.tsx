// Showing one board's other states: the drafts proposed against the current
// architecture, and the states that used to be current.
//
// A proposal nobody can reach is a proposal nobody reviews. The navigator offers
// every state of every board, and a pane does not offer its own board's states a
// second time (a board a level down is another matter, held by the levels
// tests). These check what the pane still owns: the state it is told to show is
// the one it asks the server for, and moving between states is reading rather
// than editing, which leaves where the reader was looking alone.

import { expect, test } from "bun:test";
import { act, fireEvent } from "@testing-library/react";

import {
	cameraNow,
	drawing,
	viewport,
	chooseVariantInShell,
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
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "b1",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
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

test("the variant the pane is told to show rides in the request", async () => {
	serving([AS_IT_IS, PROPOSED], PROPOSED);
	mountStage(null, { variant: "v2" });
	await settle();
	expect(renderCalls().at(-1)).toContain("variant=v2");
	expect(
		document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-variant"),
	).toBe(PROPOSED.name);
});

test.each([false, true])(
	"switching variants preserves the camera, including after a gesture: %s",
	async (handled) => {
		const view = { id: "scope1", name: "Integration", grammar: "architecture" };
		const other = { id: "scope2", name: "Whole system", grammar: "architecture" };
		serving([AS_IT_IS, PROPOSED]);
		server.reply = { status: 200, body: { ...drawing(1), view, views: [view, other] } };
		mountStage(null, { live: true, view: view.id });
		await settle();
		if (handled) {
			act(() => {
				fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
			});
		}
		const before = cameraNow();
		server.reply = {
			status: 200,
			body: {
				...drawing(1),
				width: 900,
				height: 600,
				variant: { id: PROPOSED.id, name: PROPOSED.name, lifecycle: PROPOSED.lifecycle },
				view,
				views: [view, other],
			},
		};
		chooseVariantInShell(PROPOSED.id);
		// The last picture stays up while the uncached one is on its way, so the
		// pane can carry it into the next rather than dropping to a skeleton;
		// the camera must outlive the request either way.
		const stage = document.querySelector("[data-slot='semantic-board-stage']");
		expect(stage?.getAttribute("data-variant")).toBe("current");
		expect(document.querySelector("[data-slot='semantic-board-surface']")).not.toBeNull();
		await settle();
		expect(stage?.getAttribute("data-variant")).toBe(PROPOSED.name);
		expect(renderCalls().at(-1)).toContain("variant=v2");
		expect(cameraNow()).toEqual(before);
		act(() => {
			fireEvent.keyDown(viewport(), { key: "0" });
		});
		expect(cameraNow().scale).toBeCloseTo(Math.min((800 - 48) / 900, (600 - 48) / 600), 6);
		const fitted = cameraNow();
		act(() => {
			fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
		});
		server.reply = {
			status: 200,
			body: {
				...drawing(1),
				width: 900,
				height: 600,
				variant: { id: PROPOSED.id, name: PROPOSED.name, lifecycle: PROPOSED.lifecycle },
				view: other,
				views: [view, other],
			},
		};
		act(() => {
			fireEvent.click(document.querySelector<HTMLElement>("[data-semantic-view='scope2']")!);
		});
		await settle();
		expect(renderCalls().at(-1)).toContain("view=scope2");
		expect(cameraNow()).toEqual(fitted);
	},
);

test("moving to a proposal and back fits what the proposal changes in view", async () => {
	serving([AS_IT_IS, PROPOSED]);
	mountStage(null, { live: true, reducedMotion: true });
	await settle();
	const whole = cameraNow();
	server.reply = {
		status: 200,
		body: {
			...drawing(1),
			variant: { id: PROPOSED.id, name: PROPOSED.name, lifecycle: PROPOSED.lifecycle },
			changes: {
				predecessor: { id: AS_IT_IS.id, name: AS_IT_IS.name, lifecycle: AS_IT_IS.lifecycle },
				standing: { n1: "changed", e1: "unchanged" },
			},
		},
	};
	chooseVariantInShell(PROPOSED.id);
	await settle();
	// n1 is 80×40 at the origin: the camera goes to it, as close as a fit to one
	// region may, rather than staying on the whole picture.
	expect(cameraNow()).not.toEqual(whole);
	expect(cameraNow()).toEqual({ x: 340, y: 270, scale: 1.5 });

	// And back to the current state, the same changes are what the reader is shown.
	act(() => {
		fireEvent.keyDown(viewport(), { key: "0" });
	});
	chooseVariantInShell(undefined);
	await settle();
	expect(cameraNow()).toEqual({ x: 340, y: 270, scale: 1.5 });
});
