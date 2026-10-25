// The video a replay scenario asks for is judged from the run's world after the author ran: the
// file, the container its first bytes are, and the receipt the replay printed among its progress
// lines, against the talk the fixture kept. Nothing here renders; the replay itself is owned by
// tests/system/server-state/walkthrough-replay.test.ts.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SemanticBoardSchema } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { framesOf } from "@archboard/walkthrough/talk";
import { keepTalk } from "@archboard/walkthrough/recorder";
import { evaluateOutcomes, type OutcomeCheck } from "#runtime/rules/outcomes/outcomes.ts";
import { inspectVideo, talkOfFixture } from "#runtime/operations/runs/replay.ts";
import { withFixtureOrders } from "#tests/runtime/support/fixture-orders.ts";
import { READING } from "#tests/runtime/support/reading-fixture.ts";

const BOARD = SemanticBoardSchema.parse(
	withFixtureOrders({
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "b",
		name: "pr-1",
		level: "service",
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
					nodes: [{ id: "app", name: "App", kind: "app" }],
					edges: [],
					flows: [],
					walkthroughs: [
						{
							id: "w1",
							name: "For reviewers",
							beats: [
								{ id: "b1", heading: "Why it exists", body: "One sentence." },
								{ id: "b2", heading: "What changed", body: "The app.", subjects: ["app"] },
							],
						},
					],
				},
			},
		],
	}),
);

const CHECKED = {
	policy: DEFAULT_SEMANTIC_POLICY,
	configurationValid: true,
	configurationFile: "config.yaml",
	fingerprint: "f",
	diagnostics: [],
};

const CHECK: OutcomeCheck = {
	check: "video-rendered",
	file: "~/out/dark.webm",
	talk: "~/talk",
	theme: "dark",
};

/** The first bytes ffmpeg writes: an EBML header whose type is webm, and an MP4's ftyp box. */
const WEBM = Buffer.concat([
	Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]),
	Buffer.from("webm"),
	Buffer.alloc(200),
]);
const MP4 = Buffer.concat([
	Buffer.from([0, 0, 0, 0x18]),
	Buffer.from("ftypisom"),
	Buffer.alloc(200),
]);

let home: string;
let frames: number;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "archboard-replay-check-"));
	const kept = talkOfFixture(
		{ board: "pr-1", walkthrough: "For reviewers", directory: "~/talk", theme: "light" },
		BOARD,
		CHECKED,
	);
	frames = framesOf(keepTalk({ ...kept, directory: join(home, "talk") }));
	mkdirSync(join(home, "out"));
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

/**
 * What `semantic replay` printed: its progress on stderr, then its receipt, in one output.
 * @param receipt What the receipt says beyond the defaults for the asked video.
 * @returns The output.
 */
function replayOutput(receipt: Record<string, unknown>): string {
	return [
		"Fetching ffmpeg through nix.",
		"Rendered 30 of 180 frames.",
		JSON.stringify(
			{
				success: true,
				talk: join(home, "talk"),
				board: "pr-1",
				variant: "v1",
				walkthrough: { id: "w1", name: "For reviewers" },
				steps: 2,
				file: join(home, "out", "dark.webm"),
				bytes: WEBM.length,
				mimeType: "video/webm;codecs=vp9,opus",
				durationMs: 6000,
				frames,
				theme: "dark",
				...receipt,
			},
			null,
			2,
		),
	].join("\n");
}

/**
 * Whether the check passes on what a run left.
 * @param file What the video file holds.
 * @param outputs What the author's commands printed.
 * @returns The verdict.
 */
function judged(file: Buffer, outputs: readonly string[]): boolean {
	writeFileSync(join(home, "out", "dark.webm"), file);
	const video = inspectVideo({ file: "~/out/dark.webm", talk: "~/talk" }, home, outputs);
	return evaluateOutcomes([CHECK], { ...READING, videos: [video] })[0]!.passed;
}

test("a replay of the kept talk in the asked theme passes, its receipt found among the progress lines", () => {
	expect(judged(WEBM, ["ls ~/recordings", replayOutput({})])).toBe(true);
});

test("a video that is not the one asked for fails: another theme, another length, another talk, another container, or no receipt", () => {
	expect([
		judged(WEBM, [replayOutput({ theme: "light" })]),
		judged(WEBM, [replayOutput({ frames: 90 })]),
		judged(WEBM, [replayOutput({ talk: join(home, "elsewhere") })]),
		judged(MP4, [replayOutput({ bytes: MP4.length })]),
		judged(WEBM, []),
		// The last receipt for the file is what counts, not an earlier one.
		judged(WEBM, [replayOutput({}), replayOutput({ theme: "light" })]),
		// A receipt for another file says nothing about this one.
		judged(WEBM, [replayOutput({ file: join(home, "out", "other.webm") })]),
		// A file changed after the replay wrote it is not what the replay wrote.
		judged(WEBM, [replayOutput({ bytes: WEBM.length + 1 })]),
	]).toEqual([false, false, false, false, false, false, false, false]);
});

test("a receipt narrowed to the fields the check reads still counts", () => {
	const narrowed = JSON.stringify({
		file: join(home, "out", "dark.webm"),
		talk: join(home, "talk"),
		theme: "dark",
		frames,
		bytes: WEBM.length,
	});
	expect(judged(WEBM, [narrowed])).toBe(true);
});
