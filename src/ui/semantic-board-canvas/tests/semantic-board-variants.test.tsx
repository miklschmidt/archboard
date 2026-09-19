// Showing one board's other states: the drafts proposed against the current
// architecture, and the states that used to be current.
//
// A proposal nobody can reach is a proposal nobody reviews. The navigator offers
// every state of every board, and a pane does not offer its own board's states a
// second time (a board a level down is another matter, held by the levels
// tests). These check what the pane still owns: the state it is told to show is
// the one it asks the server for, and moving between states is reading rather
// than editing, which fits the selected view to the arriving variant.

import { expect, test } from "bun:test";
import { act, fireEvent } from "@testing-library/react";

import { PICTURE_TRANSITION_MS } from "@/shared/timing/timing";
import {
	cameraNow,
	drawing,
	surface,
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

/** The current state with a path to another board in the same pane. */
const LINKED = {
	...AS_IT_IS,
	content: {
		nodes: [
			{
				...AS_IT_IS.content.nodes[0],
				drillDown: { board: "archive", variant: { kind: "current" } },
			},
		],
		edges: [],
	},
};

/** Open the selected card's linked board, through the real drill-down control. */
async function openArchive(): Promise<void> {
	await act(async () => {
		fireEvent.click(document.querySelector<HTMLElement>("[data-slot='semantic-drill-down-open']")!);
	});
}

/**
 * Draw the next requested animation frame at a controlled time.
 * @param frames Frames awaiting the test clock.
 * @param now The frame time in milliseconds.
 */
function runFrames(frames: Map<number, FrameRequestCallback>, now: number): void {
	act(() => {
		const due = [...frames.values()];
		frames.clear();
		for (const frame of due) frame(now);
	});
}

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
	"switching variants fits the selected view, including after a gesture: %s",
	async (handled) => {
		const view = { id: "scope1", name: "Integration", grammar: "architecture" };
		const other = { id: "scope2", name: "Whole system", grammar: "architecture" };
		serving([AS_IT_IS, PROPOSED]);
		server.reply = { status: 200, body: { ...drawing(1), view, views: [view, other] } };
		mountStage(null, { live: true, view: view.id, reducedMotion: true });
		await settle();
		if (handled) {
			act(() => {
				fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
			});
		}
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

test("Everything fits the whole proposal and current state instead of zooming to changed subjects", async () => {
	serving([AS_IT_IS, PROPOSED]);
	mountStage(null, { live: true, reducedMotion: true });
	await settle();
	const whole = cameraNow();
	server.reply = {
		status: 200,
		body: {
			...drawing(1),
			width: 900,
			height: 600,
			variant: { id: PROPOSED.id, name: PROPOSED.name, lifecycle: PROPOSED.lifecycle },
			changes: {
				predecessor: { id: AS_IT_IS.id, name: AS_IT_IS.name, lifecycle: AS_IT_IS.lifecycle },
				standing: { n1: "changed", e1: "unchanged" },
			},
		},
	};
	chooseVariantInShell(PROPOSED.id);
	await settle();
	// Only n1 changed, but Everything must still show the entire larger picture.
	const fitted = cameraNow();
	expect(fitted.scale).toBeCloseTo(Math.min((800 - 48) / 900, (600 - 48) / 600), 6);
	expect(fitted.x).toBeCloseTo((800 - 900 * fitted.scale) / 2, 6);
	expect(fitted.y).toBeCloseTo((600 - 600 * fitted.scale) / 2, 6);

	chooseVariantInShell(undefined);
	await settle();
	expect(cameraNow()).toEqual(whole);
});

const MOVES = [
	{
		kind: "variant",
		first: AS_IT_IS,
		board: "pipeline",
		selected: null,
		next: PROPOSED,
		variant: PROPOSED.id,
	},
	{ kind: "board", first: LINKED, board: "archive", selected: "n1", next: AS_IT_IS, variant: null },
] as const;

for (const move of MOVES) {
	test(`switching ${move.kind}s animates the scale toward the selected view's fit`, async () => {
		const realFrame = globalThis.requestAnimationFrame;
		const realCancel = globalThis.cancelAnimationFrame;
		const frames = new Map<number, FrameRequestCallback>();
		let nextFrame = 0;
		try {
			serving([move.first, PROPOSED]);
			server.documents["archive"] = { ...boardOf([AS_IT_IS]), name: "archive" };
			mountStage(move.selected, { live: true });
			await settle();
			const before = cameraNow();
			/**
			 * Ask for a frame on the test's clock.
			 * @param callback The frame callback.
			 * @returns Its id for cancellation.
			 */
			globalThis.requestAnimationFrame = (callback): number => {
				frames.set(++nextFrame, callback);
				return nextFrame;
			};
			/**
			 * Cancel a frame on the test's clock.
			 * @param id The frame id.
			 */
			globalThis.cancelAnimationFrame = (id): void => {
				frames.delete(id);
			};
			server.reply = {
				status: 200,
				body: {
					...drawing(1, move.board),
					width: 900,
					height: 600,
					variant: { id: move.next.id, name: move.next.name, lifecycle: move.next.lifecycle },
				},
			};
			if (move.variant !== null) chooseVariantInShell(move.variant);
			else await openArchive();
			await settle();
			expect(
				document.querySelector("[data-slot='semantic-board-stage']")?.getAttribute("data-board"),
			).toBe(move.board);
			expect(surface().hasAttribute("data-camera-motion")).toBe(true);
			expect(cameraNow()).toEqual(before);
			let now = performance.now() + PICTURE_TRANSITION_MS / 2;
			runFrames(frames, now);
			const midway = cameraNow();
			const destination = Math.min((800 - 48) / 900, (600 - 48) / 600);
			expect(midway.scale).toBeLessThan(before.scale);
			expect(midway.scale).not.toBe(destination);
			now += PICTURE_TRANSITION_MS / 2 + 1;
			runFrames(frames, now);
			expect(surface().hasAttribute("data-camera-motion")).toBe(false);
			expect(cameraNow().scale).toBeCloseTo(destination, 6);
			expect(cameraNow().x).toBeCloseTo((800 - 900 * destination) / 2, 6);
			expect(cameraNow().y).toBeCloseTo((600 - 600 * destination) / 2, 6);
			const arrived = cameraNow();
			act(() => {
				fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
			});
			expect(cameraNow().x - arrived.x).toBeCloseTo(64, 6);
			await settle();
		} finally {
			globalThis.requestAnimationFrame = realFrame;
			globalThis.cancelAnimationFrame = realCancel;
		}
	});
}

test("switching boards lands at once when motion is reduced", async () => {
	serving([LINKED]);
	server.documents["archive"] = { ...boardOf([AS_IT_IS]), name: "archive" };
	mountStage("n1", { live: true, reducedMotion: true });
	await settle();
	server.reply = {
		status: 200,
		body: { ...drawing(1, "archive"), width: 900, height: 600 },
	};
	await openArchive();
	await settle();
	expect(surface().hasAttribute("data-camera-motion")).toBe(false);
	expect(cameraNow().scale).toBeCloseTo(Math.min((800 - 48) / 900, (600 - 48) / 600), 6);
});
