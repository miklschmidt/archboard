// What a talk has to be before it is rendered.
//
// What these catch: a talk whose steps were shown out of order, skipped or
// repeated; one whose events run on after it ended or out of time order; one
// whose voice and end disagree, which would pad or cut the sound against the
// picture; and one whose pictures were drawn from another version of the board
// than the snapshot it carries, which would render a picture the voice never
// spoke over. They catch a talk kept before talks stated their layout engine
// that can no longer be rendered (TASK-469). Of its voice, they catch an orb
// that moves a frame early, before the sound that moves it, or that reads the
// voice on another scale than the shell's meter.

import { describe, expect, test } from "bun:test";

import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { TalkSchema, framesOf, voiceLevels, type TalkEvent } from "#shared/protocol/talk.ts";

/** A board of two parts and a walkthrough of two steps, at version 3. */
const BOARD = {
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "bd1",
	name: "Pipeline",
	level: "system",
	version: 3,
	createdAt: "2026-09-30T00:00:00.000Z",
	updatedAt: "2026-09-30T00:00:00.000Z",
	views: [],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "Initial",
			lifecycle: "current",
			content: {
				nodes: [
					{ id: "cli", name: "CLI", kind: "app", order: 1000 },
					{ id: "srv", name: "Server", kind: "service", order: 2000 },
				],
				edges: [{ id: "e1", from: "cli", to: "srv", kind: "http", order: 1000 }],
				walkthroughs: [
					{
						id: "wk",
						name: "For the board",
						beats: [
							{ id: "b1", heading: "The shape", body: "Two parts and one call." },
							{ id: "b2", heading: "One edit", body: "The CLI states it.", subjects: ["e1"] },
						],
					},
				],
			},
		},
	],
};

/** A talk that can be rendered: two steps, a few words, drawn at the board's version. */
const EVENTS: readonly TalkEvent[] = [
	{ kind: "drawn", at: 0, version: 3 },
	{ kind: "step", at: 4800, beat: 0 },
	{ kind: "said", at: 9600, itemId: "a1", text: "Two parts", final: false },
	{ kind: "said", at: 14_400, itemId: "a1", text: "Two parts and one call.", final: true },
	{ kind: "step", at: 96_000, beat: 1 },
	{ kind: "end", at: 144_000 },
];

/**
 * A talk, with whatever is stated changed about it.
 * @param over What to change.
 * @returns The talk, not yet checked.
 */
function talk(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		format: "archboard-talk",
		version: 1,
		recordedAt: "2026-09-30T10:00:00.000Z",
		language: "en",
		theme: "light",
		board: {
			name: "Pipeline",
			variant: null,
			version: 3,
			walkthrough: { id: "wk", name: "For the board" },
			steps: 2,
		},
		audio: {
			file: "voice.wav",
			sampleRate: 48_000,
			channels: 1,
			samples: 144_000,
			baseLatencyMs: 10,
		},
		events: EVENTS,
		document: BOARD,
		policy: {
			policy: DEFAULT_SEMANTIC_POLICY,
			configurationValid: true,
			configurationFile: "config.yaml",
			fingerprint: "f1",
			diagnostics: [],
		},
		...over,
	};
}

/**
 * A talk's events that show some steps, then end.
 * @param beats The steps shown, in the order they were shown.
 * @returns The events.
 */
function steps(beats: readonly number[]): readonly TalkEvent[] {
	return [
		...beats.map((beat, index): TalkEvent => ({ kind: "step", at: index * 4800, beat })),
		{ kind: "end", at: 144_000 },
	];
}

describe("a talk", () => {
	test("that showed each step once in order, and ended where its voice does, renders to every frame that begins before its end", () => {
		const parsed = TalkSchema.parse(talk());
		expect(framesOf(parsed)).toBe(90);
		expect(framesOf({ audio: { ...parsed.audio, samples: 144_001 } })).toBe(91);
	});

	test("with a step skipped, repeated or out of order is refused", () => {
		expect(TalkSchema.safeParse(talk({ events: steps([1, 0]) })).success).toBe(false);
		expect(TalkSchema.safeParse(talk({ events: steps([0]) })).success).toBe(false);
		expect(TalkSchema.safeParse(talk({ events: steps([0, 0, 1]) })).success).toBe(false);
	});

	test("with anything after its end, or out of time order, is refused", () => {
		const afterEnd = [...EVENTS, { kind: "drawn", at: 144_000, version: 3 }];
		const outOfOrder = EVENTS.toSpliced(3, 0, { kind: "drawn", at: 1, version: 3 });
		expect(TalkSchema.safeParse(talk({ events: afterEnd })).success).toBe(false);
		expect(TalkSchema.safeParse(talk({ events: outOfOrder })).success).toBe(false);
	});

	test("whose voice runs longer or shorter than the talk is refused", () => {
		const audio = { file: "voice.wav", sampleRate: 48_000, channels: 1, baseLatencyMs: 10 };
		expect(TalkSchema.safeParse(talk({ audio: { ...audio, samples: 143_999 } })).success).toBe(
			false,
		);
		expect(TalkSchema.safeParse(talk({ audio: { ...audio, samples: 144_001 } })).success).toBe(
			false,
		);
	});

	test("drawn from another version of the board than its snapshot is refused", () => {
		const redrawn = EVENTS.with(0, { kind: "drawn", at: 0, version: 4 });
		expect(TalkSchema.safeParse(talk({ events: redrawn })).success).toBe(false);
		expect(TalkSchema.safeParse(talk({ document: { ...BOARD, version: 4 } })).success).toBe(false);
		expect(TalkSchema.safeParse(talk({ document: { kind: "semantic-board" } })).success).toBe(
			false,
		);
	});

	test("keeps an explicit recorded engine and defaults an omitted engine to Blocks", () => {
		expect(TalkSchema.parse(talk({ layout: "blocks" })).layout).toBe("blocks");
		expect(TalkSchema.parse(talk({ layout: "track" })).layout).toBe("track");
		expect(TalkSchema.parse(talk()).layout).toBe("blocks");
	});
});

describe("a talk read against a variant", () => {
	/** The board with a proposal beside its current variant, both stating the walkthrough. */
	const withProposal = {
		...BOARD,
		variants: [
			...BOARD.variants,
			{ ...BOARD.variants[0]!, id: "v2", name: "Proposal", lifecycle: "draft", parent: "v1" },
		],
	};

	/**
	 * A talk of the proposal, read against the named variant.
	 * @param against The variant id, as the talk states it.
	 * @returns The talk, not yet checked.
	 */
	function readAgainst(against: string): Record<string, unknown> {
		const board = { name: "Pipeline", version: 3, walkthrough: { id: "wk", name: "x" }, steps: 2 };
		return talk({ document: withProposal, board: { ...board, variant: "v2", against } });
	}

	test("keeps the variant it is read against, so a replay draws the same comparison", () => {
		expect(TalkSchema.parse(readAgainst("v1")).board.against).toBe("v1");
		expect(TalkSchema.parse(talk()).board.against).toBeUndefined();
	});

	test("is refused when that variant is not on its board, or is the one it draws", () => {
		expect(TalkSchema.safeParse(readAgainst("gone")).success).toBe(false);
		expect(TalkSchema.safeParse(readAgainst("v2")).success).toBe(false);
	});
});

describe("a talk's voice", () => {
	test("is as loud on each frame as the voice meter would read it at the frame's moment, from the samples heard by then", () => {
		// Silent for two frames, then a square wave at half scale.
		const samples = Int16Array.from({ length: 144_001 }, (_, index) =>
			index < 3200 ? 0 : (index % 2 === 0 ? 1 : -1) * 16_384,
		);
		const levels = voiceLevels(samples);
		expect(levels).toHaveLength(91);
		expect(levels.slice(0, 3)).toEqual([0, 0, 0]);
		// The meter's window of 2048 samples is 1600 samples into the sound by frame three.
		expect(levels[3]).toBeCloseTo(0.5 * Math.sqrt(1600 / 2048), 9);
		expect(levels.slice(4)).toEqual(Array.from({ length: 87 }, () => 0.5));
	});
});
