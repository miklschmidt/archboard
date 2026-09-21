// What a narrator is handed for a walkthrough step, and when it is refused one.
//
// The narrator names a step and sometimes a walkthrough; the pane, the board and
// the variant are the host's. What is guarded: the words handed back are the
// step the pane arrived on, said with names a voice can speak; a step or a
// walkthrough the board does not have moves no pane; and a pane that did not
// arrive is a refusal that says why, never a description of a picture that is
// not there.

import { describe, expect, test } from "bun:test";
import {
	nextCountsFrom,
	presentWalkthroughStep,
	type PresentStepParts,
} from "@/server/canvas/index";
import { SemanticBoardSchema } from "@/shared/semantic-board/index";

const BOARD = SemanticBoardSchema.parse({
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "bd",
	name: "pipeline",
	level: "system",
	version: 3,
	createdAt: "2026-09-11T00:00:00.000Z",
	updatedAt: "2026-09-11T00:00:00.000Z",
	views: [
		{
			id: "vw1",
			name: "The writer alone",
			grammar: "architecture",
			scope: { kind: "selection", nodes: ["n1"], edges: [], flows: [] },
		},
	],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "as it is",
			lifecycle: "current",
			content: {
				nodes: [
					{ id: "n1", name: "board-io", kind: "module", order: 0 },
					{ id: "n2", name: "Write Lease", kind: "module", order: 1 },
				],
				edges: [{ id: "e1", from: "n1", to: "n2", kind: "call", order: 0 }],
				walkthroughs: [
					{
						id: "w1",
						name: "For the board",
						beats: [
							{ id: "b1", heading: "The shape of it", body: "Two modules.", subjects: [] },
							{
								id: "b2",
								heading: "One writer",
								body: "board-io owns every write.",
								subjects: ["n1", "e1"],
								view: "vw1",
							},
						],
					},
					{
						id: "w2",
						name: "For operators",
						beats: [{ id: "b3", heading: "Leases", body: "Deny by default.", subjects: ["n2"] }],
					},
				],
			},
		},
	],
});

/** A canvas with one pane on the board, recording what the pane was asked for. */
function canvas(outcome: Awaited<ReturnType<PresentStepParts["presentations"]["present"]>>) {
	const asked: Parameters<PresentStepParts["presentations"]["present"]>[0][] = [];
	const parts: PresentStepParts = {
		presentations: {
			present: async (input) => {
				asked.push(input);
				return outcome;
			},
		},
		paneShowing: (paneId) =>
			paneId === "pane-a" ? { board: "pipeline", variant: undefined, presenting: null } : null,
		readBoard: (name) => (name === "pipeline" ? BOARD : null),
	};
	return { parts, asked };
}

const ARRIVED = {
	kind: "arrived",
	presentation: { walkthrough: "w1", beat: 1, of: 2, arrived: true, answering: "r" },
} as const;

/**
 * One request against the one pane.
 * @param input The step and, when named, the walkthrough.
 * @param sessionWalkthrough The walkthrough the narration is already on, or null.
 * @returns The request.
 */
function request(
	input: { step?: number; walkthrough?: string },
	sessionWalkthrough: string | null = null,
	lastStep = 0,
) {
	return {
		paneId: "pane-a",
		input,
		sessionWalkthrough,
		lastStep,
		signal: new AbortController().signal,
	};
}

describe("a walkthrough step presented for a narrator", () => {
	test("is asked of the pane by id and beat, and handed back in words a voice can say", async () => {
		const { parts, asked } = canvas(ARRIVED);
		const outcome = await presentWalkthroughStep(
			parts,
			request({ step: 2, walkthrough: "for the board" }),
		);
		expect(asked).toMatchObject([{ paneId: "pane-a", walkthrough: "w1", beat: 1 }]);
		expect(outcome).toEqual({
			tag: "ok",
			value: {
				walkthroughId: "w1",
				walkthroughName: "For the board",
				step: 2,
				of: 2,
				heading: "One writer",
				body: "board-io owns every write.",
				subjects: ["board-io", "board-io to Write Lease"],
				view: "The writer alone",
			},
		});
	});

	test("goes on with the walkthrough the narration is already on when none is named", async () => {
		const { parts, asked } = canvas(ARRIVED);
		await presentWalkthroughStep(parts, request({ step: 1 }, "w2"));
		expect(asked).toMatchObject([{ walkthrough: "w2", beat: 0 }]);
	});

	test("presents the step after where the narration stands when none is named, and says when the talk is over", async () => {
		// A delegation carries the person's last words, never the voice model's, so the
		// coordinator cannot be told which step is wanted: the host knows where the talk is.
		const { parts, asked } = canvas(ARRIVED);
		const first = await presentWalkthroughStep(parts, request({}, "w1", 0));
		const second = await presentWalkthroughStep(parts, request({}, "w1", 1));
		const over = await presentWalkthroughStep(parts, request({}, "w1", 2));
		expect(asked.map((one) => one.beat)).toEqual([0, 1]);
		expect([first, second].map((one) => (one.tag === "ok" ? one.value.step : null))).toEqual([
			1, 2,
		]);
		expect(over).toMatchObject({ tag: "refused", reason: "invalid_call" });
		// Standing in another walkthrough is standing nowhere in this one.
		await presentWalkthroughStep(parts, request({ walkthrough: "w2" }, "w1", 2));
		expect(asked.at(-1)).toMatchObject({ walkthrough: "w2", beat: 0 });
	});

	test("moves no pane for a walkthrough it cannot settle or a step the walkthrough has not got", async () => {
		const { parts, asked } = canvas(ARRIVED);
		const unnamed = await presentWalkthroughStep(parts, request({ step: 1 }));
		const missing = await presentWalkthroughStep(parts, request({ step: 3, walkthrough: "w1" }));
		const gone = await presentWalkthroughStep(parts, { ...request({ step: 1 }), paneId: "pane-b" });
		expect(
			[unnamed, missing, gone].map((one) => (one.tag === "refused" ? one.reason : "ok")),
		).toEqual(["invalid_call", "invalid_call", "not_ready"]);
		expect(asked).toEqual([]);
	});

	test("refuses, with the reason, a step the pane did not arrive on", async () => {
		const reasons = [
			["person_took_over", "busy"],
			["timeout", "expired"],
			["no_pane", "not_ready"],
		] as const;
		for (const [reason, expected] of reasons) {
			const { parts } = canvas({ kind: "refused", reason });
			const outcome = await presentWalkthroughStep(parts, request({ step: 1, walkthrough: "w1" }));
			expect(outcome).toMatchObject({ tag: "refused", reason: expected });
		}
	});

	test("means one step by 'next' for the whole of a coordinator turn, however often it is asked", () => {
		// A coordinator that could not read its first answer calls again. The second call must get
		// the same step: counting from where the narration stood when the turn began, not from
		// where the first call left it.
		expect(nextCountsFrom(undefined, "turn-1")).toBe(0);
		const afterFirstCall = { walkthrough: "w1", step: 1, turn: { id: "turn-1", base: 0 } };
		expect(nextCountsFrom(afterFirstCall, "turn-1")).toBe(0);
		// The next turn goes on from there, and so does a caller the host cannot name.
		expect(nextCountsFrom(afterFirstCall, "turn-2")).toBe(1);
		expect(nextCountsFrom(afterFirstCall, null)).toBe(1);
		// A person's hand on the keys belongs to no turn: the talk goes on from where they are.
		expect(nextCountsFrom({ walkthrough: "w1", step: 4, turn: null }, "turn-2")).toBe(4);
	});
});
