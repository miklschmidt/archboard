// A small talk that renders: a board of two parts and a walkthrough of two steps, told over three
// seconds of voice. Private test support of the recorder's tests.

import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { TalkSchema, type Talk } from "@/shared/walkthrough-recording/talk";

/** How many samples of voice the talk has: 3 s at 48 kHz, which is 90 frames. */
const VOICE_SAMPLES = 144_000;

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

/**
 * A talk that can be rendered.
 * @returns The talk, as a recording writes it.
 */
function fixtureTalk(): Talk {
	return TalkSchema.parse({
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
			samples: VOICE_SAMPLES,
			baseLatencyMs: 10,
		},
		events: [
			{ kind: "drawn", at: 0, version: 3 },
			{ kind: "step", at: 4800, beat: 0 },
			{ kind: "said", at: 9600, itemId: "a1", text: "Two parts and one call.", final: true },
			{ kind: "step", at: 96_000, beat: 1 },
			{ kind: "end", at: VOICE_SAMPLES },
		],
		document: BOARD,
		policy: {
			policy: DEFAULT_SEMANTIC_POLICY,
			configurationValid: true,
			configurationFile: "config.yaml",
			fingerprint: "f1",
			diagnostics: [],
		},
	});
}

/**
 * The talk's voice: a quiet tone, so a wrong length or format is a wrong file rather than silence.
 * @returns Its samples.
 */
function fixtureVoice(): Int16Array {
	return Int16Array.from({ length: VOICE_SAMPLES }, (_, at) =>
		Math.round(Math.sin(at / 20) * 1000),
	);
}

export { fixtureTalk, fixtureVoice, VOICE_SAMPLES };
